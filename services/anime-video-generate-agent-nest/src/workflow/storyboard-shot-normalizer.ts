import type { PipelineShot } from "./storyboard-pipeline.types";

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

function renumberShotsInOrder(shots: PipelineShot[]): PipelineShot[] {
  const sorted = [...shots].sort((a, b) => a.order - b.order || 0);
  return sorted.map((s, i) => ({ ...s, order: i + 1 }));
}

/** 从模型 JSON 中尽力抽出镜头行并规范化序号 */
export function normalizeStoryboardShotsContent(parsed: unknown): PipelineShot[] {
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
