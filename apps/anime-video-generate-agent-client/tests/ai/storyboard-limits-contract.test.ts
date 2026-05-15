import { describe, expect, it } from "vitest";

import { clampClientStoryboardMaxShots } from "@/lib/storyboard-limits";

/**
 * 客户端「AI 前置契约」：拆镜上限等与后端/env 对齐的钳制逻辑，应用侧单测即可锁住。
 */
describe("clampClientStoryboardMaxShots（拆镜上限契约）", () => {
  it("钳制在合法区间内", () => {
    expect(clampClientStoryboardMaxShots(1)).toBeGreaterThanOrEqual(6);
    expect(clampClientStoryboardMaxShots(999)).toBeLessThanOrEqual(30);
  });

  it("NaN 时使用合理默认", () => {
    expect(Number.isFinite(clampClientStoryboardMaxShots(Number.NaN))).toBe(true);
  });
});
