import { Injectable, Logger } from "@nestjs/common";

import { VolcChatService } from "../volc/volc-chat.service";
import { getStoryboardShotBounds } from "../volc/storyboard-schema";
import { parseJsonLoose } from "../volc/text.util";

export type ScriptIntentKind = "evolution_arc" | "narrative_script" | "single_scene" | "unclear";

export type ScriptIntentAnalysis = {
  intent: ScriptIntentKind;
  /** 有序形态名，用于进化纪录片式拆幕 */
  evolution_stages: string[];
  /** 每镜时长建议 2–12 */
  seconds_per_shot: number;
  /** 可供图搜 / 人工找参考的关键词（非已授权配图 URL） */
  reference_image_queries: string[];
  /** 给导演与分镜 Agent 的简短说明 */
  director_notes: string;
};

function truthyEnv(name: string): boolean {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function asStrArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}

function asIntentKind(v: unknown): ScriptIntentKind {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "evolution_arc" || s === "narrative_script" || s === "single_scene" || s === "unclear") {
    return s;
  }
  if (s.includes("进化") || s.includes("evolution")) return "evolution_arc";
  if (s.includes("单场") || s.includes("single")) return "single_scene";
  if (s.includes("叙事") || s.includes("剧本") || s.includes("narrative")) return "narrative_script";
  return "unclear";
}

/** 拼进导演/分镜上下文的意图摘要（非用户原文复述）。 */
export function formatIntentForRag(a: ScriptIntentAnalysis | null | undefined): string | undefined {
  if (!a) return undefined;
  const head =
    a.evolution_stages.length >= 2
      ? `【意图识别·${a.intent}】有序形态：${a.evolution_stages.join("→")}；建议每镜 ${a.seconds_per_shot}s。`
      : `【意图识别·${a.intent}】`;
  const evolutionBeatHint =
    a.intent === "evolution_arc" && a.evolution_stages.length >= 2
      ? "拆幕节奏：每一形态建议先有「亮相站稳」类节拍，相邻形态之间必须插入至少一条「进化过渡」节拍（光效包裹、剪影蜕变、能量粒子缠绕等纯画面口令）；若有招牌招式可再加一条动作节拍，使镜头数多于纯形态数、成片衔接更顺。"
      : "";

  const tail = [
    evolutionBeatHint,
    a.director_notes ? `导演备注：${a.director_notes}` : "",
    a.reference_image_queries.length
      ? `参考图检索关键词（人工按关键词图搜后自行填入镜头参考图 URL；系统不会在拆镜时自动联网搜图）：${a.reference_image_queries.join("；")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  return tail ? `${head}\n${tail}` : head;
}

@Injectable()
export class ScriptIntentService {
  private readonly log = new Logger(ScriptIntentService.name);

  constructor(private readonly chat: VolcChatService) {}

  /** 关闭意图识别（省一次对话请求）：VOLC_SCRIPT_INTENT_DISABLE=1 */
  isEnabled(): boolean {
    return !truthyEnv("VOLC_SCRIPT_INTENT_DISABLE");
  }

  /**
   * 调用方舟对话模型（VOLC_CHAT_MODEL_* 降级链）理解用户口令/剧本，
   * 输出结构化意图；进化类须给出有序形态列表（可含「金属暴龙兽」等资料常用名）。
   */
  async analyze(script: string): Promise<ScriptIntentAnalysis | null> {
    if (!this.isEnabled()) return null;
    const s = script.trim();
    if (!s) return null;

    const bounds = getStoryboardShotBounds();
    this.chat.assertConfigured();

    const sys =
      "你是动漫短片制片助理，只做「意图结构化」。用户输入可能是简短口令或正文剧本。" +
      "若涉及角色进化、变身、形态递进（如数码兽进化路线），必须检索你的知识给出公认有序形态链；名称用简体中文常用写法。" +
      "例如亚古兽至战斗暴龙兽的主链常被表述为：黑球兽→滚球兽→亚古兽→暴龙兽→金属暴龙兽（或机械暴龙兽）→战斗暴龙兽。" +
      "reference_image_queries 填可用于图片搜索的英文或中文关键词（非 URL），尽量与 evolution_stages 顺序对齐（每形态或关键过渡一条检索词），便于人类后续搜图贴 URL；不要编造可下载的图片地址。" +
      "只输出一个 JSON 对象，不要 markdown。字段：intent（字符串枚举 evolution_arc | narrative_script | single_scene | unclear）、" +
      "evolution_stages（字符串数组，若非进化弧可为空数组）、seconds_per_shot（整数 2-12，进化纪录片式默认 5）、" +
      "reference_image_queries（字符串数组）、director_notes（字符串，简短中文）。";

    const user = `【用户输入】\n${s.slice(0, Math.min(s.length, bounds.maxScriptChars))}\n\n` +
      `约束：若 intent 为 evolution_arc，evolution_stages 至少 3 项且不超过 ${bounds.maxShots} 项；` +
      `seconds_per_shot 需与总幕数匹配「短片总时长」诉求（每镜 5s 时 6 幕约 30s 有效成片，可按需调整）。`;

    try {
      const { content } = await this.chat.createChatCompletion({
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        temperature: 0.25,
        response_format: { type: "json_object" },
      });

      const raw = parseJsonLoose(content);
      let stages = asStrArr(raw.evolution_stages);
      const max = bounds.maxShots;
      if (stages.length > max) stages = stages.slice(0, max);

      let seconds = Number(raw.seconds_per_shot);
      if (!Number.isFinite(seconds)) seconds = 5;
      seconds = Math.min(12, Math.max(2, Math.round(seconds)));

      const out: ScriptIntentAnalysis = {
        intent: asIntentKind(raw.intent),
        evolution_stages: stages,
        seconds_per_shot: seconds,
        reference_image_queries: asStrArr(raw.reference_image_queries).slice(0, 8),
        director_notes: String(raw.director_notes ?? "").trim().slice(0, 800),
      };

      if (out.intent === "evolution_arc" && out.evolution_stages.length < 2) {
        this.log.warn("intent evolution_arc but stages < 2; downgrade to unclear");
        out.intent = "unclear";
      }

      return out;
    } catch (e) {
      this.log.warn(`script intent analyze failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }
}
