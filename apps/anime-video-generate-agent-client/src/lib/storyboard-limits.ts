/** 常用拆镜上限档位（服务端仍会按 ARK_STORYBOARD_ABS_MAX_SHOTS 等环境变量封顶） */
export const STORYBOARD_MAX_SHOT_CHOICES = [6, 8, 10, 12, 14, 16, 18, 20, 24, 30] as const;

export type StoryboardMaxShotChoice = (typeof STORYBOARD_MAX_SHOT_CHOICES)[number];

export function clampClientStoryboardMaxShots(n: number): StoryboardMaxShotChoice {
  const choices = STORYBOARD_MAX_SHOT_CHOICES;
  const min = choices[0];
  const max = choices[choices.length - 1];
  if (!Number.isFinite(n)) return 12;
  const r = Math.round(n);
  if (r <= min) return min;
  if (r >= max) return max;
  return choices.reduce((prev, c) => (Math.abs(c - r) < Math.abs(prev - r) ? c : prev), choices[0]);
}
