import { ArkRuntimeClient } from "@volcengine/ark-runtime";

export type ArkStoryboardShot = {
  order: number;
  description: string;
  prompt: string;
  duration?: number;
  resolution?: "480p" | "720p" | "1080p";
  ratio?: "16:9" | "9:16" | "1:1";
  fps?: number;
};

export type ArkStoryboard = {
  title?: string;
  shots: ArkStoryboardShot[];
};

function envInt(name: string, fallback: number, bounds?: { min: number; max: number }) {
  const raw = process.env[name];
  if (!raw?.trim()) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  let v = n;
  if (bounds) {
    v = Math.min(bounds.max, Math.max(bounds.min, v));
  }
  return v;
}

function truthyEnv(name: string): boolean {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** 供路由与各调用方统一读取，便于文档与测试对齐（SPEC-002） */
export function getArkStoryboardEnvLimits() {
  const minShots = envInt("ARK_STORYBOARD_MIN_SHOTS", 3, { min: 1, max: 30 });
  let maxShots = envInt("ARK_STORYBOARD_MAX_SHOTS", 10, { min: 1, max: 30 });
  if (maxShots < minShots) maxShots = minShots;
  const maxScriptChars = envInt("ARK_STORYBOARD_MAX_SCRIPT_CHARS", 12_000, { min: 500, max: 200_000 });
  return { minShots, maxShots, maxScriptChars };
}

function buildStoryboardSchema(minItems: number, maxItems: number) {
  return {
    type: "object",
    properties: {
      title: { type: "string", description: "标题（可空）" },
      shots: {
        type: "array",
        description: `分镜 ${minItems}-${maxItems} 条`,
        minItems,
        maxItems,
        items: {
          type: "object",
          properties: {
            order: { type: "integer", description: "序号，从 1 递增" },
            description: { type: "string", description: "一句剧情说明" },
            prompt: {
              type: "string",
              description: "Seedance 画面描述：主体/动作/场景/镜头/光影/风格；不要字幕 logo",
            },
            duration: { type: "integer", description: "建议时长秒 2-12" },
            resolution: { type: "string", enum: ["480p", "720p", "1080p"] },
            ratio: { type: "string", enum: ["16:9", "9:16", "1:1"] },
            fps: { type: "integer", description: "12/16/24/30" },
          },
          required: ["order", "description", "prompt"],
          additionalProperties: false,
        },
      },
    },
    required: ["shots"],
    additionalProperties: false,
  };
}

function clampScript(script: string, maxChars: number): string {
  const s = script.trim();
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}\n\n[已截断：仅前 ${maxChars} 字送入模型；可调 ARK_STORYBOARD_MAX_SCRIPT_CHARS]`;
}

export function shouldSkipArkStoryboard(): boolean {
  return truthyEnv("ARK_STORYBOARD_SKIP");
}

export async function arkStructuredStoryboardFromScript(args: {
  script: string;
  model?: string;
}): Promise<ArkStoryboard> {
  const apiKey = process.env.ARK_API_KEY || process.env.SEEDANCE_API_KEY;
  if (!apiKey) throw new Error("Missing ARK_API_KEY (or SEEDANCE_API_KEY) for Ark text model");

  const { minShots, maxShots, maxScriptChars } = getArkStoryboardEnvLimits();
  const scriptForModel = clampScript(args.script, maxScriptChars);

  const client = ArkRuntimeClient.withApiKey(apiKey);
  const model = args.model || process.env.ARK_STORYBOARD_MODEL || "doubao-seed-2-0-pro-260215";

  const schema = buildStoryboardSchema(minShots, maxShots);

  const response = await client.createChatCompletion({
    model,
    messages: [
      {
        role: "system",
        content:
          "你是分镜助手。只输出符合 JSON Schema 的一条 JSON，不要 markdown、不要解释、不要多余字段。",
      },
      {
        role: "user",
        content: [
          `把下面剧本拆成 **${minShots}～${maxShots}** 个镜头（shots 数组长度必须在此区间内）。`,
          "每个镜头：order 递增；description 一句话；prompt 给视频模型用，偏画面与运镜。",
          "不要输出剧本全文或复述要求。",
          "",
          "剧本：",
          scriptForModel,
        ].join("\n"),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "auto_drama_storyboard",
        description: "分镜 JSON",
        schema,
        strict: true,
      },
    },
    temperature: 0.4,
  });

  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Ark returned empty storyboard content");
  return JSON.parse(content) as ArkStoryboard;
}
