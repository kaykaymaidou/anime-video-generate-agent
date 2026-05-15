/**
 * 平台级 Seedance 提示词策略：动漫介质锁定 + 可组合上下文（知识库 / 人设一致）。
 * 注意：所有最终进模型的镜头 prompt 都应经过 composeSeedancePrompt，避免客户端漏传。
 */

const MAX_BASE = 2800;
const MAX_KB = 1200;
const MAX_CONSISTENCY = 1200;

export type AnimeStylePreset = "cel_jp" | "guoman_paint" | "ink_manga" | "chibi";

const ANIME_STYLE_LINES: Record<AnimeStylePreset, string> = {
  cel_jp:
    "【二次元画风锁定】日系赛璐璐：清晰线稿、色块分明、切片高光；肤色用动漫粉橙调而非写实肌理；禁止真人皮肤毛孔与胶片颗粒突然写实化。",
  guoman_paint:
    "【二次元画风锁定】国漫厚涂：体面块转折明确、边缘可有笔触；保留动漫五官比例与发型符号，不做写实摄影肤质与景深剧照感。",
  ink_manga:
    "【二次元画风锁定】古风水墨漫：墨色层次与留白韵律；人物仍为动漫骨架与发型归纳，不要写实古装剧照或真人面孔。",
  chibi:
    "【二次元画风锁定】Q 版：二至三头身、手足简化且比例一致；符号化大眼圆脸；禁止同镜内突然变写实头身比。",
};

/** 漫画分镜 → 动漫镜头的构图语言（非真人影视正反打口径） */
export const MANGA_STORYBOARD_GRAMMAR = [
  "【漫画分镜语言】",
  "保留漫画页张力：可对角线构图、破格、压黑留白；特写（眼/手/道具）与大远景/俯瞰交替控节拍。",
  "邻接镜头注意轴线与动作方向连贯，像番组分镜而非电视剧口语正反打。",
].join("\n");

/** 文本层负面约束（Seedance 单段 text，无独立 negative 字段时并入 prompt） */
export const ANIME_NEGATIVE_PROMPT_BLOCK = [
  "【画面规避】",
  "崩脸、五官漂移、左右脸不对称突变；畸形肢体、多手多脚、手指粘连；",
  "线条杂乱糊成一团、无意义画面剧烈跳变；",
  "同一角色发型/服饰/主色块在无剧情原因时突变；",
  "禁止真人写实面孔、手机随手拍、新闻采访构图。",
].join("\n");

/** 追加在每条 Seedance 镜头 prompt 末尾，强制动漫介质（不可被业务开关关闭） */
export const ANIME_PLATFORM_LOCK = [
  "【介质锁定】仅输出二维或三维动漫渲染画面（番剧/动漫电影/PV 水准）；禁止真人实拍、写实摄影、纪录片、新闻画面、真实明星或真人指向。",
  "【视听语言】镜头景别/运动/节奏按商业动漫导演习惯；线条清晰、可控夸张与符号化表演；禁止画面内可读文字、字幕条与 logo。",
].join("\n");

export function clampPrompt(s: string, max = 3000): string {
  const t = (s || "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max);
}

/** 由剧本段落生成的「种子」分镜描述（尚不含锁定段），偏动漫分镜语言 */
export function buildAnimeParagraphPrompt(paragraph: string, ctx: string[]): string {
  const parts = [
    "你是动漫短片分镜提示词编剧。只输出画面描述，不要解释、不要场次标题。",
    "",
    "【当前镜头叙事】",
    paragraph,
    ctx.length ? "\n【相关上下文】\n" + ctx.join("\n---\n") : "",
    "",
    "【画面要求】",
    "- 主体外形（发型/服饰色块）、场景空间、动作与情绪、镜头景别与运动",
    "- 光影基调与色调；二维赛璐璐或三渲二等明确动漫材质，避免写实皮肤毛孔",
    "- 禁止台词字幕、水印、品牌 logo",
  ].filter(Boolean);
  return parts.join("\n").trim();
}

export type SeedancePromptParts = {
  /** 未来向量库 / MCP 检索片段；也可由网关注入环境变量 DEFAULT */
  knowledgeContext?: string;
  /** 用户或上游抽取的人设一致约束 */
  consistencyNotes?: string;
  /** 日系赛璐璐 / 国漫厚涂 / 水墨漫 / Q 版，全局统一降低画风跳变 */
  stylePreset?: AnimeStylePreset;
  /** 强调漫画式构图与番组分镜节奏 */
  useMangaStoryboardGrammar?: boolean;
};

/**
 * 合成顺序：基底 → 知识库 → 人设一致 → 画风预设 → 漫画分镜语法 → 负面规避 → 平台动漫锁定
 */
/** 跨镜继承：写入「人设一致」层，压缩上一镜基底 prompt 尾部作为承接锚点 */
export function buildCrossShotConsistencyBridge(prevBasePrompt: string): string {
  const tail = prevBasePrompt.trim().slice(-520);
  if (!tail) return "";
  return (
    "【跨镜连贯】同一主体轮廓比例、主色块（皮肤/甲胄/发光眼）、发型剪影须与上一镜一致，禁止无故更换物种或人设跳变。" +
    "画面须承接上一镜结尾的景别与动作惯性（像连环分镜而非跳剪短视频）。上一镜基底要点：" +
    tail
  );
}

export function composeSeedancePrompt(basePrompt: string, parts: SeedancePromptParts): string {
  let p = (basePrompt || "").trim();
  if (p.length > MAX_BASE) p = p.slice(0, MAX_BASE);

  const kb = (parts.knowledgeContext ?? "").trim();
  if (kb) p += `\n\n【知识库/设定补充】\n${kb.slice(0, MAX_KB)}`;

  const cons = (parts.consistencyNotes ?? "").trim();
  if (cons) p += `\n\n【角色与画风一致】\n${cons.slice(0, MAX_CONSISTENCY)}`;

  const preset = parts.stylePreset;
  if (preset && ANIME_STYLE_LINES[preset]) {
    p += `\n\n${ANIME_STYLE_LINES[preset]}`;
  }

  if (parts.useMangaStoryboardGrammar) {
    p += `\n\n${MANGA_STORYBOARD_GRAMMAR}`;
  }

  p += `\n\n${ANIME_NEGATIVE_PROMPT_BLOCK}`;
  p += `\n\n【平台动漫锁定】\n${ANIME_PLATFORM_LOCK}`;
  return clampPrompt(p);
}

/** 服务端默认知识库片段（可选）；上层向量库接入后可改为动态注入 */
export function defaultKnowledgeSnippetFromEnv(): string {
  return String(process.env.AUTO_DRAMA_KB_SNIPPET ?? "").trim();
}

export function mergeKnowledgeLayers(envSnippet: string, requestSnippet?: string): string | undefined {
  const r = (requestSnippet ?? "").trim();
  const e = (envSnippet ?? "").trim();
  if (!e && !r) return undefined;
  if (!e) return r.slice(0, MAX_KB);
  if (!r) return e.slice(0, MAX_KB);
  return `${e}\n---\n${r}`.slice(0, MAX_KB);
}
