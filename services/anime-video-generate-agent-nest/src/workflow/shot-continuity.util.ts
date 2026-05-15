import { truthyEnv } from "./env-flag.util";
import type { RefinedShot } from "./refine-agent";

/**
 * PR-A：镜间衔接（Shot Continuity Pass）
 * - 优先：上一镜 `lastFrame` → 下一镜缺省 `firstFrame` 时自动对齐（火山 Seedance 首尾帧约束）
 * - 其次：由 ShotContinuityPassService 做全局一次性文本衔接（无首帧锚点时）
 *
 * 环境变量（任一为真即开启）：
 * - `VOLC_AGENT_PR_A_CONTINUITY=1`（推荐）
 * - `VOLC_AGENT_SHOT_CONTINUITY_PASS=1`（兼容旧名）
 */
export function isPrAShotContinuityEnabled(): boolean {
  return truthyEnv("VOLC_AGENT_PR_A_CONTINUITY") || truthyEnv("VOLC_AGENT_SHOT_CONTINUITY_PASS");
}

/** 按 `order` 排序后，将 `prev.lastFrame` 传播到 `next.firstFrame`（仅当 next 未提供 firstFrame） */
export function propagateAdjacentFirstFrames(shots: RefinedShot[]): RefinedShot[] {
  const sorted = [...shots].sort((a, b) => a.order - b.order);
  const out = sorted.map((s) => ({ ...s }));
  for (let i = 1; i < out.length; i++) {
    const prevLast = out[i - 1].lastFrame?.trim();
    const curFirst = out[i].firstFrame?.trim();
    if (prevLast && !curFirst) {
      out[i] = { ...out[i], firstFrame: prevLast };
    }
  }
  return out;
}
