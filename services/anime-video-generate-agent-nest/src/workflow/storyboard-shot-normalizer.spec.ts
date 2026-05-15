import { normalizeStoryboardShotsContent } from "./storyboard-shot-normalizer";

/** 纯函数解析：不调用模型，用于 AI 流水线输出结构的回归测试 */
describe("normalizeStoryboardShotsContent", () => {
  it("accepts top-level shots array", () => {
    const shots = normalizeStoryboardShotsContent([
      { order: 2, description: "A", prompt: "p1" },
      { order: 1, description: "B", prompt: "p2" },
    ]);
    expect(shots.map((s) => s.order)).toEqual([1, 2]);
    expect(shots[0].prompt).toBe("p2");
  });

  it("extracts shots nested under data（模型常见包裹）", () => {
    const shots = normalizeStoryboardShotsContent({
      data: {
        shots: [{ description: "x", prompt: "alpha" }],
      },
    });
    expect(shots).toHaveLength(1);
    expect(shots[0].order).toBe(1);
    expect(shots[0].prompt).toBe("alpha");
  });

  it("returns empty array for invalid payload", () => {
    expect(normalizeStoryboardShotsContent(null)).toEqual([]);
    expect(normalizeStoryboardShotsContent({})).toEqual([]);
  });
});
