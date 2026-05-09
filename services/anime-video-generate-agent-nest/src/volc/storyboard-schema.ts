/**
 * 结构化分镜 JSON Schema（方舟 chat/completions response_format），与 legacy Next 对齐。
 */

export function envInt(name: string, fallback: number, bounds?: { min: number; max: number }) {
  const raw = process.env[name];
  if (!raw?.trim()) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  let v = n;
  if (bounds) v = Math.min(bounds.max, Math.max(bounds.min, v));
  return v;
}

export function getStoryboardShotBounds() {
  const minShots = envInt("ARK_STORYBOARD_MIN_SHOTS", 3, { min: 1, max: 30 });
  let maxShots = envInt("ARK_STORYBOARD_MAX_SHOTS", 12, { min: 1, max: 30 });
  if (maxShots < minShots) maxShots = minShots;
  const maxScriptChars = envInt("ARK_STORYBOARD_MAX_SCRIPT_CHARS", 12_000, { min: 500, max: 200_000 });
  return { minShots, maxShots, maxScriptChars };
}

export function clampScriptForModel(script: string, maxChars: number): string {
  const s = script.trim();
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}\n\n[已截断：可调 ARK_STORYBOARD_MAX_SCRIPT_CHARS]`;
}

export function buildStoryboardJsonSchema(minItems: number, maxItems: number): Record<string, unknown> {
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
              description: "Seedance 画面描述：主体/动作/场景/镜头/光影/动漫风格；不要字幕 logo",
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
