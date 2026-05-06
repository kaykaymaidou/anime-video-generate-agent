import type { Shot } from "@/types";
import { v4 as uuidv4 } from "uuid";

/**
 * WebLLM 可选拆镜：
 * - 懒加载 @mlc-ai/web-llm，避免影响默认 bundle
 * - 输出严格 JSON（shots 数组），再转成本项目 Shot
 *
 * 注意：这是一条“可选离线能力”，工业级主链路仍建议后端 agent 做最终校正。
 */
export async function webllmStoryboardFromScript(script: string): Promise<Shot[]> {
  const text = script.trim();
  if (!text) return [];

  // 动态 import，避免在不使用时加载 WebGPU runtime
  const webllm = await import("@mlc-ai/web-llm");

  const engine = await webllm.CreateMLCEngine(
    "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    {
      initProgressCallback: () => {},
      appConfig: webllm.prebuiltAppConfig
    }
  );

  const system = [
    "你是短剧导演助理。把用户剧本拆成分镜列表。",
    "必须输出严格 JSON，不要 markdown，不要多余文本。",
    "JSON 格式：{\"shots\":[{\"order\":1,\"prompt\":\"...\"}, ...]}",
    "prompt 要包含画面、主体、动作、镜头语言、光影、风格（电影感），避免文字/字幕/logo。",
    "镜头数控制在 3-10 之间，节奏从铺垫到冲突到收束。",
  ].join("\n");

  const user = `剧本：\n${text}\n\n请输出 JSON：`;

  const resp = await engine.chat.completions.create({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    temperature: 0.4
  });

  const content = resp.choices?.[0]?.message?.content ?? "";
  const jsonText = content.trim();

  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    // 简单兜底：截取首尾大括号
    const start = jsonText.indexOf("{");
    const end = jsonText.lastIndexOf("}");
    if (start >= 0 && end > start) parsed = JSON.parse(jsonText.slice(start, end + 1));
    else throw new Error("WebLLM output is not valid JSON");
  }

  const arr: Array<{ order?: number; prompt?: string }> = Array.isArray(parsed?.shots) ? parsed.shots : [];
  const cleaned = arr
    .map((s, i) => ({
      id: uuidv4(),
      order: Number.isFinite(s.order as any) ? Number(s.order) : i + 1,
      description: "",
      prompt: String(s.prompt || "").trim(),
      status: "pending" as const,
      modelType: "seedance1.5pro" as const,
      duration: 5,
      resolution: "720p" as const,
      ratio: "16:9",
      fps: 24,
      watermark: false,
      camera_fixed: false,
    }))
    .filter((s) => s.prompt.length > 0)
    .slice(0, 12);

  return cleaned;
}

