import { v4 as uuidv4 } from "uuid";

import type { Shot } from "@/types";

export type AnimeTimelineImportResult =
  | { ok: true; shots: Shot[]; policy: "anime_only" }
  | { ok: false; reason: string };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** 仅接受本平台动漫时间线或兼容结构；拒绝非 anime 介质 */
export function importAnimeTimelineJson(raw: unknown): AnimeTimelineImportResult {
  if (!isRecord(raw)) return { ok: false, reason: "根节点不是 JSON 对象" };

  const medium = raw.medium;
  const kind = raw.kind;
  const product = raw.product;

  if (typeof medium === "string" && medium !== "anime") {
    return { ok: false, reason: "仅支持动漫介质（medium 须为 anime）" };
  }

  const animeOk =
    medium === "anime" ||
    kind === "anime_timeline_v1" ||
    product === "anime-video-generate-agent" ||
    product === "auto-drama";

  if (!animeOk) {
    return {
      ok: false,
      reason:
        "缺少动漫时间线标记（medium: anime，或 kind: anime_timeline_v1，或 product: anime-video-generate-agent / auto-drama）",
    };
  }

  if (raw.policy != null && raw.policy !== "anime_only") {
    return { ok: false, reason: "policy 必须为 anime_only 或省略" };
  }

  const shotsRaw = raw.shots;
  if (!Array.isArray(shotsRaw) || shotsRaw.length === 0) {
    return { ok: false, reason: "缺少 shots 数组" };
  }

  const out: Shot[] = [];

  for (let i = 0; i < shotsRaw.length; i++) {
    const row = shotsRaw[i];
    if (!isRecord(row)) continue;

    const order = typeof row.order === "number" ? row.order : i + 1;
    const prompt = typeof row.prompt === "string" ? row.prompt.trim() : "";
    if (!prompt) continue;

    const description = typeof row.description === "string" ? row.description : "";
    const videoUrl =
      typeof row.videoUrl === "string" && row.videoUrl.trim() ? row.videoUrl.trim() : null;

    let videoTakeUrls: string[] | undefined;
    if (Array.isArray(row.videoTakeUrls)) {
      videoTakeUrls = row.videoTakeUrls
        .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
        .map((u) => u.trim());
      if (videoTakeUrls.length === 0) videoTakeUrls = undefined;
    }

    const vu = videoUrl ?? videoTakeUrls?.[videoTakeUrls.length - 1] ?? null;

    const durationRaw = row.durationSec ?? row.duration;
    const duration =
      typeof durationRaw === "number" && Number.isFinite(durationRaw)
        ? Math.min(12, Math.max(2, Math.round(durationRaw)))
        : 5;

    const resolution = row.resolution === "480p" || row.resolution === "720p" || row.resolution === "1080p"
      ? row.resolution
      : undefined;

    const shot: Shot = {
      id: uuidv4(),
      order,
      description,
      prompt,
      status: vu ? "success" : "pending",
      videoUrl: vu,
      videoTakeUrls:
        videoTakeUrls && videoTakeUrls.length > 0
          ? videoTakeUrls
          : vu
            ? [vu]
            : undefined,
      referenceImage:
        typeof row.referenceImage === "string" && row.referenceImage.trim()
          ? row.referenceImage.trim()
          : null,
      firstFrame:
        typeof row.firstFrame === "string" && row.firstFrame.trim() ? row.firstFrame.trim() : null,
      lastFrame:
        typeof row.lastFrame === "string" && row.lastFrame.trim() ? row.lastFrame.trim() : null,
      modelType: "seedance1.5pro",
      duration,
      resolution,
      ratio: typeof row.ratio === "string" ? row.ratio : undefined,
      fps: typeof row.fps === "number" ? row.fps : undefined,
      seed: typeof row.seed === "number" ? row.seed : undefined,
    };

    out.push(shot);
  }

  if (out.length === 0) return { ok: false, reason: "没有可用镜头（需含 prompt）" };

  out.sort((a, b) => a.order - b.order);
  const normalized = out.map((s, idx) => ({ ...s, order: idx + 1 }));

  return { ok: true, shots: normalized, policy: "anime_only" };
}
