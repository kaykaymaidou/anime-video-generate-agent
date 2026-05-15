import { BadGatewayException, HttpException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RunnableLambda } from "@langchain/core/runnables";

import { VolcArkAdvancedService } from "../volc/volc-ark-advanced.service";
import { VolcChatService } from "../volc/volc-chat.service";
import {
  buildStoryboardJsonSchema,
  clampScriptForModel,
  envInt,
  resolveStoryboardShotBounds,
} from "../volc/storyboard-schema";
import { parseJsonLoose } from "../volc/text.util";
import { VolcHttpError } from "../volc/volc-http.error";
import { httpStatusFromVolc, volcFailurePayload } from "../volc/volc-user-facing";
import { AgentPipelineContextService } from "./agent-pipeline-context.service";
import { evolutionKnowledgeSnippetForScript } from "./evolution-stages";
import { evolutionArcDirectorConstraint, evolutionArcStoryboardConstraint } from "./evolution-arc-prompt-blocks";
import {
  formatIntentForRag,
  type ScriptIntentAnalysis,
  ScriptIntentService,
} from "./script-intent.service";
import { runStoryboardLangGraph } from "./storyboard-langgraph.runner";
import { auditStoryboardConsistency } from "./storyboard-consistency-audit";
import { normalizeStoryboardShotsContent } from "./storyboard-shot-normalizer";
import type {
  DirectorBrief,
  PipelineShot,
  PipelineState,
  StoryboardPipelineStagePayload,
} from "./storyboard-pipeline.types";
import { truthyEnv } from "./env-flag.util";

export type { PipelineShot, StoryboardPipelineStagePayload } from "./storyboard-pipeline.types";

/**
 * LangChain Runnable 编排：导演（风格/节拍）→ 结构化分镜 → 质检润色。
 * RAG：可把静态设定塞进 ragContext（或由上层从向量库取数后传入）。
 */
@Injectable()
export class AnimeAgentPipelineService {
  private readonly log = new Logger(AnimeAgentPipelineService.name);

  constructor(
    private readonly chat: VolcChatService,
    private readonly arkAdv: VolcArkAdvancedService,
    private readonly pipelineCtx: AgentPipelineContextService,
    private readonly config: ConfigService,
    private readonly scriptIntent: ScriptIntentService
  ) {}

  contextCacheEnabled(): boolean {
    return this.pipelineCtx.isContextCacheEnabled();
  }

  contextCacheReuseEnabled(): boolean {
    return this.pipelineCtx.isReuseEnabled();
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
    /** 单次请求覆盖最大镜头数（受 ARK_STORYBOARD_ABS_MAX_SHOTS 封顶） */
    storyboardMaxShots?: number;
    /** 拆镜预览等：每完成一阶段回调（意图 → 导演 → 分镜 → 质检） */
    onStoryboardStage?: (p: StoryboardPipelineStagePayload) => void;
  }): Promise<{ shots: PipelineShot[]; intentAnalysis: ScriptIntentAnalysis | null }> {
    const bounds = resolveStoryboardShotBounds(input.storyboardMaxShots);
    const script = clampScriptForModel(input.script, bounds.maxScriptChars);

    let intent: ScriptIntentAnalysis | null | undefined = input.intentAnalysis;
    if (intent === undefined) {
      intent = await this.scriptIntent.analyze(script, bounds).catch(() => null);
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
    const established = await this.pipelineCtx.establishArkContext({
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
      const evoDir = evolutionArcDirectorConstraint(intent, bounds.maxShots);
      const userFullFinal = evoDir ? `${userFull}\n\n${evoDir}` : userFull;
      const userCachedBase =
        "请根据上下文缓存中的【知识库/设定片段】与【用户剧本/创意】担任导演。" +
        "\n请输出 JSON：{ \"styleBible\": \"...\", \"narrativeBeats\": [\"...\"] }";
      const userCachedFinal = evoDir ? `${userCachedBase}\n\n${evoDir}` : userCachedBase;

      const { content } = await complete({
        messages: [
          { role: "system", content: sys },
          { role: "user", content: contextId ? userCachedFinal : userFullFinal },
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
        "相邻镜头必须时空连续：除第 1 镜外，每条 prompt 须用简短句承接上一镜结尾（姿态/机位/朝向）；禁止无铺垫的大跨度跳场；若换场景必须插入过渡镜（跟拍行走、推拉门、路程压缩蒙太奇等）。" +
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

      const evoSb = evolutionArcStoryboardConstraint(intent, bounds.maxShots);
      const userFullBase =
        userBodyCore +
        ["\n【剧本】\n", script, `\n拆成 ${bounds.minShots}～${bounds.maxShots} 个镜头；每条含 order、description、prompt。`].join("") +
        (intent?.evolution_stages?.length
          ? `\n【时长建议】每条镜头 duration（秒）优先填 ${intent.seconds_per_shot}（2-12）。`
          : "") +
        (evoSb ? `\n${evoSb}` : "");

      const userCachedBase =
        userBodyCore +
        [
          "\n（完整剧本与知识库见上下文缓存；请勿要求用户重复粘贴。）\n",
          `\n拆成 ${bounds.minShots}～${bounds.maxShots} 个镜头；每条含 order、description、prompt。`,
        ].join("") +
        (intent?.evolution_stages?.length
          ? `\n【时长建议】每条镜头 duration（秒）优先填 ${intent.seconds_per_shot}（2-12）。`
          : "") +
        (evoSb ? `\n${evoSb}` : "");

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

      const graphRemedy = (state.remedySuffix ?? "").trim();
      let shots = await runStoryboardAttempt(graphRemedy);
      if (
        intent?.intent === "evolution_arc" &&
        intent.evolution_stages.length >= 2 &&
        shots.length < intent.evolution_stages.length
      ) {
        const target = Math.min(bounds.maxShots, intent.evolution_stages.length * 2 - 1);
        const evoRemedy =
          `【系统补救·进化弧】上一轮镜头条数少于有序形态数。必须至少 ${intent.evolution_stages.length} 条镜头分别对应形态：${intent.evolution_stages.join("→")}，` +
          `且建议在每两个形态间各增加 1 条过渡镜；总条数尽量达到 ${target}（上限 ${bounds.maxShots}）。`;
        shots = await runStoryboardAttempt(evoRemedy);
      }
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
      return { ...state, storyboard: { shots }, remedySuffix: undefined };
    });

    const qaStep = RunnableLambda.from(async (state: PipelineState): Promise<{ shots: PipelineShot[] }> => {
      const schema = buildStoryboardJsonSchema(bounds.minShots, bounds.maxShots);
      const qaEvo =
        intent?.intent === "evolution_arc" && intent.evolution_stages.length >= 2
          ? " 若为进化弧：核查 shots 是否覆盖意图中的每一形态（名称可写在 description）；缺失早期形态则拆分或增补镜头；强化相邻 prompt 的承接句。"
          : "";
      const sys =
        "你是「质检」Agent：检查镜头信息是否足够、prompt 是否与风格宪法一致；若出现真人实拍/写实摄影/纪录片/新闻风/明星指向，必须改为动漫导演表述。" +
        "核查相邻镜头是否存在无过渡跳场：若有则改写或增补过渡描述。" +
        qaEvo +
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

    const runConsistencyAudit = async (ws: PipelineState, shotList: PipelineShot[]) =>
      auditStoryboardConsistency({
        workspace: ws,
        shots: shotList,
        intent,
        complete,
        contextId,
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

    const maxGraphRepairs = envInt("VOLC_AGENT_GRAPH_MAX_REPAIRS", 1, { min: 0, max: 4 });
    const useLangGraph = truthyEnv("VOLC_AGENT_LANGGRAPH");

    const invokeChainGraph = async () => {
      const shots = await runStoryboardLangGraph(
        {
          maxRepairs: maxGraphRepairs,
          onStage: stageCb
            ? (stage: string, progress: number, message: string) =>
                stageCb({ stage, progress, message })
            : undefined,
          director: (ws) => directorStep.invoke(ws as PipelineState),
          storyboard: (ws) => storyboardStep.invoke(ws as PipelineState),
          qa: (ws) => qaStep.invoke(ws as PipelineState),
          audit: (ws, sh) => runConsistencyAudit(ws as PipelineState, sh as PipelineShot[]),
        },
        { script, ragContext: rag },
      );
      stageCb?.({ stage: "qa", progress: 96, message: "LangGraph 流水线收敛" });
      return { shots };
    };

    const invokePreferred = async () => (useLangGraph ? invokeChainGraph() : invokeChain());

    try {
      const raw = await invokePreferred();
      this.pipelineCtx.persistSession(ctxKey, script, rag, contextId);
      return { shots: raw.shots, intentAnalysis: intent ?? null };
    } catch (e) {
      const keyTrim = ctxKey?.trim();
      if (keyTrim && reusedFromStore && this.pipelineCtx.shouldInvalidateReuse(e)) {
        this.pipelineCtx.invalidateSession(keyTrim);
        const second = await this.pipelineCtx.establishArkContext({
          script,
          rag,
          primaryModel,
          sessionKey: ctxKey,
          forceNew: true,
        });
        contextId = second.contextId;
        reusedFromStore = second.reusedFromStore;
        try {
          const raw = await invokePreferred();
          this.pipelineCtx.persistSession(ctxKey, script, rag, contextId);
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
