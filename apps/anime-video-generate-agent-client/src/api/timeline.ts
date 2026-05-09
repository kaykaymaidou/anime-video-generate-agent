import { requestJson } from "@/lib/http";

export type TimelineConcatClip = {
  order: number;
  url: string;
};

export type TimelineConcatResponse = {
  ok: boolean;
  filename: string;
  /** 绝对或相对 URL，可直接做 <video src> */
  videoUrl: string;
  clipCount: number;
  path: string;
};

export type TimelineConcatTransition = "none" | "fade";

export function postTimelineConcat(
  clips: TimelineConcatClip[],
  opts?: { transition?: TimelineConcatTransition }
) {
  return requestJson<TimelineConcatResponse>("/api/timeline/concat", {
    method: "POST",
    body: JSON.stringify({
      clips,
      transition: opts?.transition === "fade" ? "fade" : "none",
    }),
  });
}
