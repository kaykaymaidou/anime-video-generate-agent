import { parseJsonLoose } from "../volc/text.util";
import { truthyEnv } from "./env-flag.util";
import type { ScriptIntentAnalysis } from "./script-intent.service";
import type { PipelineShot, PipelineState } from "./storyboard-pipeline.types";

export type StoryboardChatComplete = (req: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature: number;
  response_format?: Record<string, unknown>;
}) => Promise<{ content: string }>;

/**
 * LangGraph 一致性审计：启发式（进化链）+ 可选 LLM JSON 裁判。
 * 单一职责：判定 pass/hint，不修改 shots。
 */
export async function auditStoryboardConsistency(input: {
  workspace: PipelineState;
  shots: PipelineShot[];
  intent: ScriptIntentAnalysis | null | undefined;
  complete: StoryboardChatComplete;
  contextId: string | null;
}): Promise<{ pass: boolean; hint: string }> {
  const { workspace, shots, intent, complete, contextId } = input;

  if (intent?.intent === "evolution_arc" && intent.evolution_stages.length >= 2) {
    const blob = shots.map((s) => `${s.description}\n${s.prompt}`).join("\n");
    for (const name of intent.evolution_stages) {
      if (!blob.includes(name)) {
        return {
          pass: false,
          hint: `分镜须显式覆盖进化形态「${name}」（description 或 prompt），并保留形态间过渡镜。`,
        };
      }
    }
  }

  if (!truthyEnv("VOLC_AGENT_CONSISTENCY_AUDIT_LLM")) {
    return { pass: true, hint: "" };
  }

  const sys =
    "你是动漫短片「一致性审计」Agent，只做结构化判定。对照风格宪法与分镜，检查：人设主色块/发型是否在多条 prompt 中自相矛盾；相邻镜是否明显无承接的大跳场；是否出现真人实拍表述。" +
    "只输出一个 JSON 对象：{\"pass\": true/false, \"hint\": \"若不通过，给分镜模型的一句中文补救指令\"}。不要 markdown。";
  const user = JSON.stringify({
    styleBible: (workspace.director?.styleBible ?? "").slice(0, 1200),
    intent: intent ? { kind: intent.intent, evolution_stages: intent.evolution_stages } : null,
    shots: shots.map((s) => ({
      order: s.order,
      description: s.description,
      prompt: s.prompt.slice(0, 500),
    })),
  });

  try {
    const { content } = await complete({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      temperature: 0.1,
      ...(contextId ? {} : { response_format: { type: "json_object" } }),
    });
    const rawAudit = parseJsonLoose<{ pass?: boolean; hint?: string }>(content);
    const pass = Boolean(rawAudit.pass);
    const hint = String(rawAudit.hint ?? "").trim();
    return {
      pass,
      hint: pass ? "" : hint || "按风格宪法收紧各镜 prompt，补齐相邻镜承接句与人设色块。",
    };
  } catch {
    return { pass: true, hint: "" };
  }
}
