/**
 * 进化链镜头拆分（LangChain 失败时的本地兜底）+ 注入导演/分镜上下文。
 * 亚古兽主链表述综合中文百科与维基社群常用口径（非运行时联网检索）。
 */

import { envInt } from "../volc/storyboard-schema";

/** 数码宝贝亚古兽系常见主进化链（便于「进化短片」按幕拆分） */
const AGUMON_MAIN_CHAIN = [
  "黑球兽",
  "滚球兽",
  "亚古兽",
  "暴龙兽",
  "机械暴龙兽",
  "战斗暴龙兽",
] as const;

/**
 * 从用户输入推断有序形态列表；无法推断则返回 null。
 */
export function inferEvolutionStages(script: string): string[] | null {
  const s = script.trim();
  if (!s) return null;

  const arrowParts = s
    .split(/\s*(?:→|⟶|->|➝|=>)\s*/u)
    .map((x) => x.replace(/^[,，、。\s]+|[,，、。\s]+$/g, "").trim())
    .filter(Boolean);
  if (arrowParts.length >= 3) {
    return arrowParts.slice(0, 12);
  }

  if (
    /亚古兽/u.test(s) &&
    /战斗暴龙兽/u.test(s) &&
    (/进化|進化|evo/i.test(s) || /视频|短片|pv/i.test(s))
  ) {
    return [...AGUMON_MAIN_CHAIN];
  }

  return null;
}

/**
 * 注入导演/分镜阶段：约束「一模一幕」且勿粘贴用户原句。
 */
export function evolutionKnowledgeSnippetForScript(script: string): string | undefined {
  const stages = inferEvolutionStages(script);
  if (!stages || stages.length < 2) return undefined;
  const chain = stages.join("→");
  const digimonNote =
    /亚古兽/u.test(script) && /战斗暴龙兽/u.test(script)
      ? " 「机械暴龙兽」在资料里常与「金属暴龙兽」混称，画面统一为一种红色恐龙进化至紫灰机械龙造型即可。"
      : "";
  return (
    `【进化链参考（必须按序拆幕）】${chain}。` +
    `每条 narrativeBeat 对应一个形态或关键转折；相邻形态之间务必插入「进化过渡」节拍（光效/剪影/形体渐变），不要直接从形态 A 硬切到形态 B 的静止画面。` +
    `鼓励节拍数多于形态数：如「形态亮相站稳 →（可选）招式/氛围 → 进化过渡 → 下一形态亮相」。` +
    `description 仅允许简短剧情标签（如「成长期：亚古兽」），禁止写入用户原始口令或整段需求全文；` +
    `prompt 仅用镜头画面语言（景别/动作/光效/动漫材质）。` +
    digimonNote
  );
}

export function evolutionShotDefaultDurationSec(): number {
  return envInt("ARK_EVOLUTION_SHOT_DURATION_SEC", 5, { min: 2, max: 12 });
}

export function buildEvolutionStageParagraph(stage: string, index: number, total: number): string {
  return [
    `动漫纪录片式进化镜头 ${index + 1}/${total}，当前形态：${stage}。`,
    "画面：进化光环与发光数码粒子缠绕形体，剪影拉长再凝聚实体；镜头可半身→全身或侧面环绕；",
    "背景偏抽象数据空间或夜色剪影；影院级动漫体积光与色边；前后镜头外形差异明显以体现进化。",
    "禁止字幕、水印与 logo。",
  ].join("");
}
