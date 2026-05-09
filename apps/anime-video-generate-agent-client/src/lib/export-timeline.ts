import type { Shot } from "@/types";

export type AnimeTimelineExportV1 = {
  product: "anime-video-generate-agent";
  kind: "anime_timeline_v1";
  generatedAt: number;
  /** 二维/三维动漫；拒绝非动漫工作流混用 */
  medium: "anime";
  policy: "anime_only";
  shots: Array<{
    id: string;
    order: number;
    description: string;
    prompt: string;
    durationSec: number;
    videoUrl: string | null;
    videoTakeUrls?: string[] | null;
    referenceImage: string | null;
    firstFrame: string | null;
    lastFrame: string | null;
    seed?: number;
  }>;
};

export function buildAnimeTimelineExport(shots: Shot[]): AnimeTimelineExportV1 {
  const sorted = [...shots].sort((a, b) => a.order - b.order);
  return {
    product: "anime-video-generate-agent",
    kind: "anime_timeline_v1",
    generatedAt: Date.now(),
    medium: "anime",
    policy: "anime_only",
    shots: sorted.map((s) => ({
      id: s.id,
      order: s.order,
      description: s.description,
      prompt: s.prompt,
      durationSec: s.duration ?? 5,
      videoUrl: s.videoUrl?.trim() ? s.videoUrl : null,
      videoTakeUrls:
        s.videoTakeUrls && s.videoTakeUrls.length > 0
          ? [...s.videoTakeUrls]
          : s.videoUrl?.trim()
            ? [s.videoUrl.trim()]
            : null,
      referenceImage: s.referenceImage?.trim() ? s.referenceImage : null,
      firstFrame: s.firstFrame?.trim() ? s.firstFrame : null,
      lastFrame: s.lastFrame?.trim() ? s.lastFrame : null,
      seed: s.seed,
    })),
  };
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
