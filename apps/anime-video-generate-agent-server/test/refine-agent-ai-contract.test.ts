import { describe, expect, it } from "vitest";

import { refineAgentRequest } from "@/lib/agent/refine-storyboard";

/**
 * 「AI 契约」测试：校验 gateway 对 Agent 载荷的规范化（Zod + 纯函数），不发起真实模型调用。
 * 适于锁住 prompt 策略迭代前后的请求形状。
 */
describe("refineAgentRequest（AI 网关契约 · Vitest）", () => {
  it("接受最小 shots 并合并 defaults（无外部 IO）", () => {
    const r = refineAgentRequest({
      shots: [{ prompt: "动漫镜头内测", order: 1 }],
      defaults: { modelType: "seedance1.5pro", duration: 5 },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.shots).toHaveLength(1);
      expect(r.data.shots[0].modelType).toBe("seedance1.5pro");
      expect(r.data.shots[0].duration).toBe(5);
    }
  });

  it("拒绝非法 resolution（契约失败应可观测）", () => {
    const r = refineAgentRequest({
      shots: [{ prompt: "x", resolution: "999p" as unknown as string }],
    });
    expect(r.ok).toBe(false);
  });
});
