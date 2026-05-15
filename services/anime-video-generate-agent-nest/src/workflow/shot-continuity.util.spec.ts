import type { RefinedShot } from "./refine-agent";
import { isPrAShotContinuityEnabled, propagateAdjacentFirstFrames } from "./shot-continuity.util";

describe("shot-continuity.util (PR-A)", () => {
  const prevEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...prevEnv };
  });

  it("propagateAdjacentFirstFrames copies prev.lastFrame to next.firstFrame when missing", () => {
    const shots: RefinedShot[] = [
      {
        id: "a",
        order: 1,
        description: "",
        prompt: "p1",
        modelType: "seedance1.5pro",
        duration: 5,
        resolution: "720p",
        ratio: "16:9",
        fps: 24,
        watermark: false,
        camera_fixed: false,
        lastFrame: "https://example.com/end1.png",
      },
      {
        id: "b",
        order: 2,
        description: "",
        prompt: "p2",
        modelType: "seedance1.5pro",
        duration: 5,
        resolution: "720p",
        ratio: "16:9",
        fps: 24,
        watermark: false,
        camera_fixed: false,
      },
    ];
    const out = propagateAdjacentFirstFrames(shots);
    expect(out[1].firstFrame).toBe("https://example.com/end1.png");
    expect(out[0].lastFrame).toBe("https://example.com/end1.png");
  });

  it("does not overwrite existing firstFrame", () => {
    const shots: RefinedShot[] = [
      {
        id: "a",
        order: 1,
        description: "",
        prompt: "p1",
        modelType: "seedance1.5pro",
        duration: 5,
        resolution: "720p",
        ratio: "16:9",
        fps: 24,
        watermark: false,
        camera_fixed: false,
        lastFrame: "https://x/l1.png",
      },
      {
        id: "b",
        order: 2,
        description: "",
        prompt: "p2",
        modelType: "seedance1.5pro",
        duration: 5,
        resolution: "720p",
        ratio: "16:9",
        fps: 24,
        watermark: false,
        camera_fixed: false,
        firstFrame: "https://custom/start2.png",
      },
    ];
    const out = propagateAdjacentFirstFrames(shots);
    expect(out[1].firstFrame).toBe("https://custom/start2.png");
  });

  it("isPrAShotContinuityEnabled reads VOLC_AGENT_PR_A_CONTINUITY", () => {
    delete process.env.VOLC_AGENT_SHOT_CONTINUITY_PASS;
    process.env.VOLC_AGENT_PR_A_CONTINUITY = "1";
    expect(isPrAShotContinuityEnabled()).toBe(true);
  });
});
