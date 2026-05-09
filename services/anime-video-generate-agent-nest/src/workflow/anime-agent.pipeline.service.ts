import { BadGatewayException, HttpException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RunnableLambda } from "@langchain/core/runnables";

import { VolcArkAdvancedService } from "../volc/volc-ark-advanced.service";
import { VolcChatService } from "../volc/volc-chat.service";
import {
  buildStoryboardJsonSchema,
  clampScriptForModel,
  getStoryboardShotBounds,
} from "../volc/storyboard-schema";
import { parseJsonLoose } from "../volc/text.util";
import { VolcHttpError } from "../volc/volc-http.error";
import { httpStatusFromVolc, volcFailurePayload } from "../volc/volc-user-facing";
import { ContextCacheSessionStore } from "./context-cache-session.store";
import { evolutionKnowledgeSnippetForScript } from "./evolution-stages";
import { formatIntentForRag, type ScriptIntentAnalysis, ScriptIntentService } from "./script-intent.service";

export type StoryboardPipelineStagePayload = {
  stage: string;
  progress: number;
  message: string;
};

export type PipelineShot = {
  order: number;
  description: string;
  prompt: string;
  duration?: number;
  resolution?: "480p" | "720p" | "1080p";
  ratio?: "16:9" | "9:16" | "1:1";
  fps?: number;
};

type DirectorBrief = {
  styleBible: string;
  narrativeBeats: string[];
};

type PipelineState = {
  script: string;
  ragContext?: string;
  director?: DirectorBrief;
  storyboard?: { shots: PipelineShot[] };
};

/** 模型常见偏离：顶层无 shots、嵌套在 data、或使用别名字段 */
const STORYBOARD_ARRAY_KEYS = ["shots", "storyboard", "shot_list", "scenes", "items", "镜头列表"];

function extractShotsArrayFromObject(obj: Record<string, unknown>): unknown[] | null {
  for (const k of STORYBOARD_ARRAY_KEYS) {
    const v = obj[k];
    if (Array.isArray(v) && v.length > 0) return v;
  }
  for (const nestKey of ["data", "result", "output", "payload"]) {
    const nested = obj[nestKey];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const n = nested as Record<string, unknown>;
      for (const k of STORYBOARD_ARRAY_KEYS) {
        const v = n[k];
        if (Array.isArray(v) && v.length > 0) return v;
      }
    }
  }
  return null;
}

function coercePipelineShot(row: unknown, idx: number): PipelineShot | null {
  if (!row || typeof row !== "object") return null;
  const x = row as Record<string, unknown>;
  const prompt = String(x.prompt ?? x.video_prompt ?? x.seedance_prompt ?? "").trim();
  const description = String(x.description ?? x.label ?? x.title ?? x.summary ?? "").trim();
  const orderRaw = x.order ?? x.index ?? x.idx;
  const order = Number(orderRaw);
  if (!prompt && !description) return null;
  const shot: PipelineShot = {
    order: Number.isFinite(order) && order > 0 ? Math.floor(order) : idx + 1,
    description: description || prompt.slice(0, 160),
    prompt: prompt || description,
  };
  const dur = Number(x.duration);
  if (Number.isFinite(dur) && dur >= 2 && dur <= 12) shot.duration = dur;
  const res = String(x.resolution ?? "");
  if (res === "480p" || res === "720p" || res === "1080p") shot.resolution = res;
  const ratio = String(x.ratio ?? "");
  if (ratio === "16:9" || ratio === "9:16" || ratio === "1:1") shot.ratio = ratio;
  const fps = Number(x.fps);
  if (Number.isFinite(fps) && fps > 0) shot.fps = Math.round(fps);
  return shot;
}

/** 从模型 JSON 中尽力抽出镜头行并规范化序号 */
function normalizeStoryboardShotsContent(parsed: unknown): PipelineShot[] {
  if (parsed == null) return [];
  if (Array.isArray(parsed)) {
    const rows = parsed.map((row, i) => coercePipelineShot(row, i)).filter((s): s is PipelineShot => s != null);
    return renumberShotsInOrder(rows);
  }
  if (typeof parsed !== "object") return [];
  const obj = parsed as Record<string, unknown>;
  const arr = extractShotsArrayFromObject(obj);
  if (!arr) return [];
  const rows = arr.map((row, i) => coercePipelineShot(row, i)).filter((s): s is PipelineShot => s != null);
  return renumberShotsInOrder(rows);
}

function renumberShotsInOrder(shots: PipelineShot[]): PipelineShot[] {
  const sorted = [...shots].sort((a, b) => a.order - b.order || 0);
  return sorted.map((s, i) => ({ ...s, order: i + 1 }));
}

function truthyEnv(name: string): boolean {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** 写入上下文缓存的共用前缀（common_prefix），后续轮次不再重复传剧本与 RAG */
const CONTEXT_PREFIX_BOOT_SYS =
  "以下为同一动漫短片项目的固定上下文（剧本与知识库）。后续你是导演、分镜或质检 Agent 时，不要要求用户重复粘贴全文；必要时引用「上下文缓存中的剧本与知识库」即可。";

/**
 * LangChain Runnable 编排：导演（风格/节拍）→ 结构化分镜 → 质检润色。
 * RAG：可把静态设定塞进 ragContext（或由上层从向量库取数后传入）。
 * MCP：后续可作为 Tool 接入 Runnable；当前仅占位扩展点。
 */
@Injectable()
export class AnimeAgentPipelineService {
  private readonly log = new Logger(AnimeAgentPipelineService.name);

  constructor(
    private readonly chat: VolcChatService,
    private readonly arkAdv: VolcArkAdvancedService,
    private readonly ctxStore: ContextCacheSessionStore,
    private readonly config: ConfigService,
    private readonly scriptIntent: ScriptIntentService
  ) {}

  /**
   * 同一 HTTP 请求内三步复用方舟上下文缓存（common_prefix），减少重复剧本/RAG token。
   * 开启：VOLC_AGENT_CONTEXT_CACHE=1；关闭：VOLC_AGENT_CONTEXT_CACHE_DISABLE=1
   */
  contextCacheEnabled(): boolean {
    if (truthyEnv("VOLC_AGENT_CONTEXT_CACHE_DISABLE")) return false;
    const raw = String(
      this.config.get<string>("VOLC_AGENT_CONTEXT_CACHE") ?? process.env.VOLC_AGENT_CONTEXT_CACHE ?? ""
    )
      .trim()
      .toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  }

  private contextTtlSeconds(): number {
    const n = Number(this.config.get<string>("VOLC_CHAT_CONTEXT_TTL") ?? process.env.VOLC_CHAT_CONTEXT_TTL ?? 3600);
    if (!Number.isFinite(n)) return 3600;
    return Math.min(604_800, Math.max(3600, Math.round(n)));
  }

  /**
   * 跨请求复用 context_id（须客户端传稳定的 contextCacheKey，且剧本+RAG 指纹未变）。
   * 默认开启；VOLC_AGENT_CONTEXT_CACHE_REUSE_DISABLE=1 关闭。
   */
  contextCacheReuseEnabled(): boolean {
    if (!this.contextCacheEnabled()) return false;
    if (truthyEnv("VOLC_AGENT_CONTEXT_CACHE_REUSE_DISABLE")) return false;
    const raw = String(
      this.config.get<string>("VOLC_AGENT_CONTEXT_CACHE_REUSE") ?? process.env.VOLC_AGENT_CONTEXT_CACHE_REUSE ?? "1"
    )
      .trim()
      .toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  }

  private shouldInvalidateContextReuse(e: unknown): boolean {
    if (!(e instanceof VolcHttpError)) return false;
    if (e.status === 403) return true;
    const blob = `${e.message}\n${e.bodySnippet}`.toLowerCase();
    return (
      blob.includes("context") &&
      (blob.includes("invalid") || blob.includes("expired") || blob.includes("state") || blob.includes("not found"))
    );
  }

  private persistContextSession(sessionKey: string | undefined, script: string, rag: string, contextId: string | null) {
    if (!this.contextCacheEnabled() || !sessionKey?.trim() || !contextId) return;
    const fp = this.ctxStore.fingerprint(script, rag);
    this.ctxStore.set(sessionKey.trim(), {
      contextId,
      fingerprint: fp,
      expiresAt: Date.now() + this.contextTtlSeconds() * 1000,
    });
  }

  private async establishArkContext(opts: {
    script: string;
    rag: string;
    primaryModel: string;
    sessionKey?: string;
    forceNew?: boolean;
  }): Promise<{ contextId: string | null; reusedFromStore: boolean }> {
    if (!this.contextCacheEnabled()) {
      return { contextId: null, reusedFromStore: false };
    }
    const fp = this.ctxStore.fingerprint(opts.script, opts.rag);
    const key = opts.sessionKey?.trim();
    if (!opts.forceNew && this.contextCacheReuseEnabled() && key) {
      const hit = this.ctxStore.get(key);
      if (hit && hit.fingerprint === fp) {
        this.log.debug(`pipeline context cache session hit (${key.slice(0, 10)}…)`);
        return { contextId: hit.contextId, reusedFromStore: true };
      }
    }

    try {
      const prefixUser = [
        opts.rag ? `【知识库/设定片段】\n${opts.rag}` : "",
        "\n【用户剧本/创意】\n",
        opts.script,
      ]
        .filter(Boolean)
        .join("\n");
      const created = await this.arkAdv.createContextCache({
        model: opts.primaryModel,
        mode: "common_prefix",
        ttl: this.contextTtlSeconds(),
        messages: [
          { role: "system", content: CONTEXT_PREFIX_BOOT_SYS },
          { role: "user", content: prefixUser },
        ],
      });
      const id = created.id;
      const cid = typeof id === "string" && id.trim() ? id.trim() : null;
      if (cid) {
        this.log.debug(`pipeline context cache created ${cid.slice(0, 16)}… ttl=${this.contextTtlSeconds()}s`);
      }
      if (cid && key) {
        this.persistContextSession(key, opts.script, opts.rag, cid);
      }
      return { contextId: cid, reusedFromStore: false };
    } catch (e) {
      this.log.warn(
        `VOLC_AGENT_CONTEXT_CACHE: create failed, fallback to plain chat — ${e instanceof Error ? e.message : String(e)}`
      );
      return { contextId: null, reusedFromStore: false };
    }
  }

  isEnabled(): boolean {
    if (truthyEnv("VOLC_AGENT_PIPELINE_DISABLE")) return false;
    const raw = String(this.config.get<string>("VOLC_AGENT_PIPELINE") ?? "on").trim().toLowerCase();
    if (raw === "off" || raw === "0" || raw === "false") return false;
    return true;
  }

  async run(input: {
    script: string;
    ragContext?: string;
    /** null=上游已解析但无结果；undefined=在本管线内补跑一次意图识别（如拆镜预览） */
    intentAnalysis?: ScriptIntentAnalysis | null;
    /** 客户端稳定 ID（如同一项目 UUID）；配合 VOLC_AGENT_CONTEXT_CACHE 跨请求复用方舟上下文 */
    contextCacheKey?: string;
    /** 拆镜预览等：每完成一阶段回调（意图 → 导演 → 分镜 → 质检） */
    onStoryboardStage?: (p: StoryboardPipelineStagePayload) => void;
  }): Promise<{ shots: PipelineShot[]; intentAnalysis: ScriptIntentAnalysis | null }> {
    const bounds = getStoryboardShotBounds();
    const script = clampScriptForModel(input.script, bounds.maxScriptChars);

    let intent: ScriptIntentAnalysis | null | undefined = input.intentAnalysis;
    if (intent === undefined) {
      intent = await this.scriptIntent.analyze(script).catch(() => null);
    }

    const stageCb = input.onStoryboardStage;
    if (intent) {
      stageCb?.({
        stage: "intent",
        progress: 18,
        message:
          intent.evolution_stages?.length >= 2
            ? `意图 ${intent.intent}：${intent.evolution_stages.join("→")}`
            : `意图 ${intent.intent}`,
      });
    } else {
      stageCb?.({ stage: "intent", progress: 18, message: "意图识别已跳过或失败，继续导演阶段" });
    }

    const baseRag = [
      (input.ragContext ?? "").trim(),
      String(this.config.get<string>("AGENT_RAG_CONTEXT_SNIPPET") ?? "").trim(),
    ]
      .filter(Boolean)
      .join("\n\n");
    const evoSnip = evolutionKnowledgeSnippetForScript(script);
    const intentRag = formatIntentForRag(intent ?? null);
    const rag = [baseRag, evoSnip, intentRag].filter(Boolean).join("\n\n").trim();

    this.chat.assertConfigured();
    const primaryModel = this.chat.chatModelCascade()[0];

    let contextId: string | null = null;
    let reusedFromStore = false;
    const ctxKey = input.contextCacheKey;
    const established = await this.establishArkContext({
      script,
      rag,
      primaryModel,
      sessionKey: ctxKey,
      forceNew: false,
    });
    contextId = established.contextId;
    reusedFromStore = established.reusedFromStore;

    const complete = async (req: {
      messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
      temperature: number;
      response_format?: Record<string, unknown>;
    }): Promise<{ content: string }> => {
      if (contextId) {
        return this.arkAdv.contextChatCompletion({
          context_id: contextId,
          model: primaryModel,
          messages: req.messages,
          temperature: req.temperature,
        });
      }
      const body: Record<string, unknown> = {
        messages: req.messages,
        temperature: req.temperature,
      };
      if (req.response_format) body.response_format = req.response_format;
      return this.chat.createChatCompletion(body);
    };

    const directorStep = RunnableLambda.from(async (state: PipelineState): Promise<PipelineState> => {
      const sys =
        "你是商业动漫剧集「导演」Agent。本平台仅产出动漫影像：二维赛璐璐、三渲二或风格化三维动漫渲染均可；禁止真人实拍、写实摄影、纪录片、新闻播报风与真实明星指向。" +
        "styleBible 必须写清角色脸型符号、发色色块、服装剪影与线宽，便于后续分镜与 Seedance 锁人设、防崩脸与换装穿帮。" +
        "若创意为角色进化/变身/形态递进（尤其数码兽等），narrativeBeats 必须按时间顺序覆盖每一关键形态或转折，通常一模一幕；节拍用语必须是简短导演口令，禁止把用户原始需求整句粘贴进来。" +
        "只输出一个 JSON 对象，不要 markdown。字段：styleBible（字符串：统一动漫视觉宪法——介质、线条、表演夸张度、色调与特效口径）, narrativeBeats（字符串数组，3-12 条幕节拍；进化短片优先与形态数对齐）。";
      const userFull = [
        rag ? `【知识库/设定片段】\n${rag}\n` : "",
        "【用户剧本/创意】\n",
        script,
        "\n请输出 JSON：{ \"styleBible\": \"...\", \"narrativeBeats\": [\"...\"] }",
      ]
        .filter(Boolean)
        .join("\n");
      const userCached =
        "请根据上下文缓存中的【知识库/设定片段】与【用户剧本/创意】担任导演。" +
        "\n请输出 JSON：{ \"styleBible\": \"...\", \"narrativeBeats\": [\"...\"] }";

      const { content } = await complete({
        messages: [
          { role: "system", content: sys },
          { role: "user", content: contextId ? userCached : userFull },
        ],
        temperature: 0.35,
        ...(contextId ? {} : { response_format: { type: "json_object" } }),
      });
      let brief: DirectorBrief;
      try {
        brief = parseJsonLoose<DirectorBrief>(content);
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        this.log.warn(`导演阶段 JSON 解析失败: ${detail}`);
        throw new BadGatewayException(
          "「导演」步骤返回无法解析，请稍后重试或略改剧本。"
        );
      }
      if (!brief.styleBible || !Array.isArray(brief.narrativeBeats)) {
        this.log.warn("导演阶段返回结构无效（缺 styleBible 或 narrativeBeats）");
        throw new BadGatewayException(
          "「导演」步骤输出不完整，请重试或补充场次、角色与画面要点。"
        );
      }
      return { ...state, director: brief };
    });

    const storyboardStep = RunnableLambda.from(async (state: PipelineState): Promise<PipelineState> => {
      const schema = buildStoryboardJsonSchema(bounds.minShots, bounds.maxShots);
      const sysBase =
        "你是「分镜」Agent。严格按 JSON Schema 输出一条 JSON。" +
        "每条 prompt 必须可直接用于 Seedance 动漫视频生成：明确景别/运动/主体外形色块/场景/动作情绪/光影色调；禁止写实真人摄影表述。" +
        "优先漫画翻页与番组分镜逻辑：可对角线张力格、破格、特写与大远景对切、压黑留白；避免电视剧口语正反打调度。" +
        "description 仅一句剧情标签（如「成熟期：暴龙兽」），禁止写入用户原始口令或需求全文；prompt 只写画面，不复述用户提问句子。";
      const sysShape =
        " 输出必须是单个 JSON 对象，顶层含非空数组 shots；每项含 order（整数）、description、prompt；禁止 markdown、禁止省略 shots。";
      const sys =
        sysBase +
        sysShape +
        (contextId ? "（当前走上下文缓存对话，仍必须输出合法 JSON，不得以说明文字代替 shots。）" : "");

      const userBodyCore = [
        "【风格宪法】\n",
        state.director!.styleBible,
        "\n【叙事节拍】\n",
        state.director!.narrativeBeats.map((b, i) => `${i + 1}. ${b}`).join("\n"),
      ].join("");

      const userFullBase =
        userBodyCore +
        ["\n【剧本】\n", script, `\n拆成 ${bounds.minShots}～${bounds.maxShots} 个镜头；每条含 order、description、prompt。`].join("") +
        (intent?.evolution_stages?.length
          ? `\n【时长建议】每条镜头 duration（秒）优先填 ${intent.seconds_per_shot}（2-12）。`
          : "");

      const userCachedBase =
        userBodyCore +
        [
          "\n（完整剧本与知识库见上下文缓存；请勿要求用户重复粘贴。）\n",
          `\n拆成 ${bounds.minShots}～${bounds.maxShots} 个镜头；每条含 order、description、prompt。`,
        ].join("") +
        (intent?.evolution_stages?.length
          ? `\n【时长建议】每条镜头 duration（秒）优先填 ${intent.seconds_per_shot}（2-12）。`
          : "");

      const runStoryboardAttempt = async (remedySuffix: string): Promise<PipelineShot[]> => {
        const userFull = remedySuffix ? `${userFullBase}\n${remedySuffix}` : userFullBase;
        const userCached = remedySuffix ? `${userCachedBase}\n${remedySuffix}` : userCachedBase;
        const { content } = await complete({
          messages: [
            { role: "system", content: sys },
            { role: "user", content: contextId ? userCached : userFull },
          ],
          temperature: remedySuffix ? 0.35 : 0.4,
          ...(contextId
            ? {}
            : {
                response_format: {
                  type: "json_schema",
                  json_schema: {
                    name: "auto_drama_storyboard",
                    description: "分镜",
                    schema,
                    strict: true,
                  },
                },
              }),
        });

        let parsedObj: Record<string, unknown>;
        try {
          parsedObj = parseJsonLoose<Record<string, unknown>>(content);
        } catch (e) {
          const detail = e instanceof Error ? e.message : String(e);
          this.log.warn(`分镜阶段 JSON 解析失败: ${detail}；片段: ${String(content).slice(0, 320)}`);
          return [];
        }
        return normalizeStoryboardShotsContent(parsedObj);
      };

      let shots = await runStoryboardAttempt("");
      if (shots.length < bounds.minShots) {
        this.log.warn(`分镜首轮有效镜头 ${shots.length} 条（期望≥${bounds.minShots}），触发一次自动重试`);
        const remedy =
          `【系统补救】上一轮输出镜头不足或结构不符。请仅输出一个合法 JSON 对象，顶层字段 shots 为数组，` +
          `长度须在 ${bounds.minShots}～${bounds.maxShots} 之间；每项必须含 order、description、prompt。不要 markdown，不要附加说明文字。`;
        shots = await runStoryboardAttempt(remedy);
      }

      if (shots.length === 0) {
        this.log.warn("分镜阶段重试后仍无有效镜头");
        throw new BadGatewayException(
          "拆镜未完成：未得到有效镜头列表。写具体些（场次、动作、场景），删掉无关长段后重试。"
        );
      }
      if (shots.length < bounds.minShots) {
        this.log.warn(`分镜重试后仍只有 ${shots.length} 条（环境最小 ${bounds.minShots}），继续后续质检`);
      }
      if (shots.length > bounds.maxShots) {
        shots = shots.slice(0, bounds.maxShots);
      }
      return { ...state, storyboard: { shots } };
    });

    const qaStep = RunnableLambda.from(async (state: PipelineState): Promise<{ shots: PipelineShot[] }> => {
      const schema = buildStoryboardJsonSchema(bounds.minShots, bounds.maxShots);
      const sys =
        "你是「质检」Agent：检查镜头信息是否足够、prompt 是否与风格宪法一致；若出现真人实拍/写实摄影/纪录片/新闻风/明星指向，必须改为动漫导演表述。" +
        "若 description 或 prompt 中含有用户原始提问句式（如「生成一个…视频」），必须改成简短标签与纯画面描述。必要时改写 prompt。只输出符合 Schema 的一条 JSON。";
      const user = [
        "【风格宪法】\n",
        state.director!.styleBible,
        "\n【当前分镜 JSON】\n",
        JSON.stringify({ shots: state.storyboard!.shots }, null, 0),
        "\n输出修订后的完整 JSON（含 shots 数组）。",
      ].join("\n");

      const { content } = await complete({
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        ...(contextId
          ? {}
          : {
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "auto_drama_storyboard_qa",
                  description: "质检后分镜",
                  schema,
                  strict: true,
                },
              },
            }),
      });
      let parsedObj: Record<string, unknown>;
      try {
        parsedObj = parseJsonLoose<Record<string, unknown>>(content);
      } catch (e) {
        this.log.warn(`质检解析失败，使用分镜稿直出: ${e instanceof Error ? e.message : String(e)}`);
        return { shots: state.storyboard!.shots };
      }
      const qaShots = normalizeStoryboardShotsContent(parsedObj);
      if (qaShots.length === 0) {
        return { shots: state.storyboard!.shots };
      }
      return {
        shots: qaShots.length > bounds.maxShots ? qaShots.slice(0, bounds.maxShots) : qaShots,
      };
    });

    const invokeChain = async () => {
      let state: PipelineState = { script, ragContext: rag };
      state = await directorStep.invoke(state);
      stageCb?.({ stage: "director", progress: 42, message: "导演完成（风格宪法与叙事节拍）" });
      state = await storyboardStep.invoke(state);
      stageCb?.({ stage: "storyboard", progress: 72, message: "分镜结构化完成" });
      const qaOut = await qaStep.invoke(state);
      stageCb?.({ stage: "qa", progress: 93, message: "质检完成" });
      return qaOut;
    };

    try {
      const raw = await invokeChain();
      this.persistContextSession(ctxKey, script, rag, contextId);
      return { shots: raw.shots, intentAnalysis: intent ?? null };
    } catch (e) {
      const keyTrim = ctxKey?.trim();
      if (keyTrim && reusedFromStore && this.shouldInvalidateContextReuse(e)) {
        this.ctxStore.invalidate(keyTrim);
        const second = await this.establishArkContext({
          script,
          rag,
          primaryModel,
          sessionKey: ctxKey,
          forceNew: true,
        });
        contextId = second.contextId;
        reusedFromStore = second.reusedFromStore;
        try {
          const raw = await invokeChain();
          this.persistContextSession(ctxKey, script, rag, contextId);
          return { shots: raw.shots, intentAnalysis: intent ?? null };
        } catch (e2) {
          if (e2 instanceof VolcHttpError) {
            throw new HttpException(volcFailurePayload(e2), httpStatusFromVolc(e2.status));
          }
          throw e2;
        }
      }
      if (e instanceof VolcHttpError) {
        throw new HttpException(volcFailurePayload(e), httpStatusFromVolc(e.status));
      }
      throw e;
    }
  }
}
