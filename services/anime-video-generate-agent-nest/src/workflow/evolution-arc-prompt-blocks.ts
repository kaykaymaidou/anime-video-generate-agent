import type { ScriptIntentAnalysis } from "./script-intent.service";

/** 导演阶段：进化弧形态链不得被模型压缩跳过 */
export function evolutionArcDirectorConstraint(
  intent: ScriptIntentAnalysis | null | undefined,
  maxShots: number
): string {
  if (!intent || intent.intent !== "evolution_arc" || intent.evolution_stages.length < 2) return "";
  const stages = intent.evolution_stages;
  const chain = stages.join(" → ");
  const minBeats = stages.length * 2 - 1;
  return (
    `【进化弧硬约束】有序形态（禁止跳过、禁止合并省略）：${chain}。\n` +
    `narrativeBeats 建议不少于 ${minBeats} 条且不超过 ${maxShots} 条：` +
    `每个形态至少一条「亮相/建档」节拍；每两个相邻形态之间至少一条「进化过渡」节拍（光茧/剪影蜕变/数码粒子缠绕/形体同屏渐变）。\n` +
    `即使用户口语只提到片段（如亚古兽→战斗暴龙兽），也必须按上述完整形态链拆节拍，不得从列表中期形态直接跳到末期而无过渡期。\n` +
    `可在过渡前后插入微动作镜（站稳、环顾、蓄力）以增加衔接细腻度。`
  );
}

/** 分镜阶段：与 evolutionArcDirectorConstraint 对齐的可执行拆镜约束 */
export function evolutionArcStoryboardConstraint(
  intent: ScriptIntentAnalysis | null | undefined,
  maxShots: number
): string {
  if (!intent || intent.intent !== "evolution_arc" || intent.evolution_stages.length < 2) return "";
  const stages = intent.evolution_stages;
  const minRecommended = Math.min(maxShots, stages.length * 2 - 1);
  return (
    `【进化弧拆镜铁律】形态清单（每一条 shots 的 description 或 prompt 须能对应以下某一形态或明确过渡段，不得遗漏早期形态）：${stages.join(" → ")}。\n` +
    `shots 条数强烈建议 ${minRecommended}～${maxShots}；在相邻形态之间插入过渡镜；单条 prompt 禁止一次性完成跨越两级以上的进化。\n` +
    `description 推荐含形态名或「进化过渡：甲→乙」。`
  );
}
