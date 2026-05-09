import { describe, expect, it } from "vitest";

import { importAnimeTimelineJson } from "../import-anime-timeline";

describe("importAnimeTimelineJson", () => {
  it("accepts legacy product auto-drama", () => {
    const res = importAnimeTimelineJson({
      product: "auto-drama",
      medium: "anime",
      shots: [
        {
          order: 1,
          description: "legacy",
          prompt: "镜头提示",
          durationSec: 5,
        },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.shots).toHaveLength(1);
    expect(res.shots[0].prompt).toBe("镜头提示");
  });

  it("accepts anime timeline v1", () => {
    const res = importAnimeTimelineJson({
      product: "anime-video-generate-agent",
      kind: "anime_timeline_v1",
      medium: "anime",
      policy: "anime_only",
      shots: [
        {
          order: 1,
          description: "test",
          prompt: "赛璐璐角色奔跑",
          durationSec: 5,
          videoUrl: null,
        },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.shots).toHaveLength(1);
    expect(res.shots[0].prompt).toContain("赛璐璐");
    expect(res.policy).toBe("anime_only");
  });

  it("rejects non-anime medium when explicit", () => {
    const res = importAnimeTimelineJson({
      medium: "live_action",
      shots: [{ order: 1, prompt: "x", description: "" }],
    });
    expect(res.ok).toBe(false);
  });

  it("rejects wrong policy", () => {
    const res = importAnimeTimelineJson({
      medium: "anime",
      policy: "mixed",
      shots: [{ order: 1, prompt: "x", description: "" }],
    });
    expect(res.ok).toBe(false);
  });
});
