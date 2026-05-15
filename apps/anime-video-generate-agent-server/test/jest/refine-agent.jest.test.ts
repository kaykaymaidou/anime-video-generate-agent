/** uuid v14 为 ESM 包，Jest 默认不解译 node_modules；此处 mock 避免整套 ESM 链路配置 */
jest.mock("uuid", () => ({
  v4: jest.fn(() => "00000000-0000-4000-8000-000000000099"),
}));

import { refineAgentRequest } from "@/lib/agent/refine-storyboard";

/**
 * Jest 样例（与 Vitest 并存）：CI 可选用不同 runner；此处仅示范 Jest + ts-jest +路径别名。
 */
describe("refineAgentRequest（Jest）", () => {
  it("ok路径：shots 带 id 时保留", () => {
    const r = refineAgentRequest({
      shots: [
        {
          id: "fixed-id",
          order: 1,
          prompt: "测试",
          description: "标签",
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.shots[0].id).toBe("fixed-id");
    }
  });
});
