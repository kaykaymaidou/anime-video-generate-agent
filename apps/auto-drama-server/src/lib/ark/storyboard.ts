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

const storyboardSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "短剧标题（可选）" },
    shots: {
      type: "array",
      description: "分镜列表（3-20个）",
      minItems: 3,
      maxItems: 20,
      items: {
        type: "object",
        properties: {
          order: { type: "integer", description: "镜头序号（从1开始）" },
          description: { type: "string", description: "镜头一句话描述（便于列表展示）" },
          prompt: {
            type: "string",
            description:
              "给 Seedance 的画面提示词：主体/动作/场景/镜头语言/光影/风格（电影感）。避免文字/字幕/logo。",
          },
          duration: { type: "integer", description: "建议时长（秒，2-12）" },
          resolution: { type: "string", enum: ["480p", "720p", "1080p"] },
          ratio: { type: "string", enum: ["16:9", "9:16", "1:1"] },
          fps: { type: "integer", description: "建议 FPS（12/16/24/30）" },
        },
        required: ["order", "description", "prompt"],
        additionalProperties: false,
      },
    },
  },
  required: ["shots"],
  additionalProperties: false,
};

export async function arkStructuredStoryboardFromScript(args: {
  script: string;
  model?: string;
}): Promise<ArkStoryboard> {
  const apiKey = process.env.ARK_API_KEY || process.env.SEEDANCE_API_KEY;
  if (!apiKey) throw new Error("Missing ARK_API_KEY (or SEEDANCE_API_KEY) for Ark text model");

  const client = ArkRuntimeClient.withApiKey(apiKey);
  const model = args.model || process.env.ARK_STORYBOARD_MODEL || "doubao-seed-2-0-pro-260215";

  const response = await client.createChatCompletion({
    model,
    messages: [
      {
        role: "system",
        content:
          "你是工业级分镜智能体。严格按 JSON Schema 输出，不要解释、不输出 markdown、不输出多余文本。",
      },
      {
        role: "user",
        content: `请把下面剧本按章节拆成分镜（优先识别“第一幕/第二幕/镜头1/镜头2”等结构），每章 4-5 个镜头，总计 12-20 个。\n并给出每个镜头的 Seedance prompt。\n\n剧本：\n${args.script}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "auto_drama_storyboard",
        description: "短剧分镜结构化输出",
        schema: storyboardSchema,
        strict: true,
      },
    },
    temperature: 0.4,
  });

  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Ark returned empty storyboard content");
  return JSON.parse(content) as ArkStoryboard;
}

