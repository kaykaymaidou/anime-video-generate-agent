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

export type StoryboardShotBounds = {
  minShots: number;
  maxShots: number;
  maxScriptChars: number;
};

/**
 * 环境默认的镜头上下限（不含单次请求覆盖）。
 */
export function getStoryboardShotBounds(): StoryboardShotBounds {
  return resolveStoryboardShotBounds(undefined);
}

/**
 * 合并「用户单次请求的最大镜头数」与环境上限：
 * - 未传 requestedMaxShots 时，maxShots 取 ARK_STORYBOARD_MAX_SHOTS（默认 12）
 * - 传入时 clamp 到 [minShots, ARK_STORYBOARD_ABS_MAX_SHOTS]（默认可到 30）
 *
 * 运维可用 ARK_STORYBOARD_ABS_MAX_SHOTS 限制滥用（例如设为 16）。
 */
export function resolveStoryboardShotBounds(requestedMaxShots?: number | null): StoryboardShotBounds {
  const minShots = envInt("ARK_STORYBOARD_MIN_SHOTS", 3, { min: 1, max: 30 });
  let envDefaultMax = envInt("ARK_STORYBOARD_MAX_SHOTS", 12, { min: 1, max: 30 });
  const absMax = envInt("ARK_STORYBOARD_ABS_MAX_SHOTS", 30, { min: 1, max: 30 });
  if (envDefaultMax < minShots) envDefaultMax = minShots;

  let maxShots = envDefaultMax;
  if (requestedMaxShots != null && Number.isFinite(requestedMaxShots)) {
    const r = Math.round(Number(requestedMaxShots));
    maxShots = Math.min(absMax, Math.max(minShots, r));
  }

  const maxScriptChars = envInt("ARK_STORYBOARD_MAX_SCRIPT_CHARS", 12_000, { min: 500, max: 200_000 });
  return { minShots, maxShots, maxScriptChars };
}

/** HTTP / JSON 请求体中的「拆镜上限」解析 */
export function parseStoryboardMaxShotsInput(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
        ? Number.parseInt(v.trim(), 10)
        : Number.NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n);
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
