/** 动漫镜头语气模板：插入镜头 Prompt，配合服务端画风锁定与负面词 */

export type AnimeShotTemplate = {
  id: string;
  label: string;
  snippet: string;
};

export const ANIME_SHOT_TEMPLATES: AnimeShotTemplate[] = [
  {
    id: "fight_burst",
    label: "打斗爆发",
    snippet:
      "广角→急速推进；动态辅助线暗示冲击方向；角色剪影清晰；打击帧轻微夸大透视；背景速度线减弱写实景深；番剧打斗节奏。",
  },
  {
    id: "dialog_twoshot",
    label: "对白双人",
    snippet:
      "漫画格切分感的正反打；轴线一致；肩上架镜头交替；表情特写与中景切换；嘴型符号化不过度写实微表情。",
  },
  {
    id: "run_tracking",
    label: "奔跑跟随",
    snippet:
      "侧面或四分之三跟拍；腿脚循环夸张到位；头发与衣褶分层摆动；地面透视条纹暗示速度；镜头轻微 handheld 动漫感而非实拍抖动。",
  },
  {
    id: "look_back",
    label: "回眸定格",
    snippet:
      "肩背轮廓→甩发弧线→眼部特写三连切；瞳孔高光符号稳定；背景虚化用色块渐变而非写实浅景深；情绪停顿一拍。",
  },
  {
    id: "establish_wide",
    label: "大远景建立",
    snippet:
      "俯视或极低地平线的大远景；角色成小剪影压在前景符号（屋檐、栏杆）之下；信息分层像漫画扉页；不接真人航拍质感。",
  },
];
