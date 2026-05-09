import type { ModelType, Shot } from "@/types";
import { v4 as uuidv4 } from "uuid";

function normalize(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function splitParagraphs(script: string): string[] {
  const s = normalize(script);
  if (!s) return [];
  return s
    .split(/\n{2,}/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseExplicitShots(script: string): string[] {
  const s = normalize(script);
  if (!s) return [];
  const lines = s.split("\n");
  const out: string[] = [];
  let cur: string[] | null = null;

  const shotRe = /^\s*镜头\s*\d+/;
  for (const line of lines) {
    if (shotRe.test(line)) {
      if (cur) out.push(cur.join("\n").trim());
      cur = [line.trim()];
      continue;
    }
    if (cur) cur.push(line);
  }
  if (cur) out.push(cur.join("\n").trim());
  return out.filter((x) => x.length > 0);
}

function tokenize(text: string): string[] {
  // 轻量 token：中文 2-4 字词 + 英文单词；用于相似度（不引入依赖）
  const tokens: string[] = [];
  const zh = text.match(/[\u4e00-\u9fa5]{2,4}/g) ?? [];
  const en = text.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [];
  tokens.push(...zh, ...en);
  return tokens;
}

function jaccard(a: string[], b: string[]) {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function topKContexts(paragraph: string, all: string[], k: number): string[] {
  const pTok = tokenize(paragraph);
  const scored = all
    .map((c) => ({ c, score: jaccard(pTok, tokenize(c)) }))
    .sort((x, y) => y.score - x.score);
  return scored.slice(0, k).map((x) => x.c);
}

export type RagStoryboardOptions = {
  modelType?: ModelType;
  duration?: number;
  resolution?: "480p" | "720p" | "1080p";
  ratio?: string;
  fps?: number;
  seed?: number;
  watermark?: boolean;
  camera_fixed?: boolean;
};

/**
 * 前端轻量 RAG 拆镜：
 * - 把剧本按段落拆成候选镜头
 * - 每个镜头检索最相似的上下文段落（topK），拼进 Prompt
 */
export function ragStoryboardFromScript(script: string, opts: RagStoryboardOptions = {}): Shot[] {
  const explicit = parseExplicitShots(script);
  const paragraphs = explicit.length > 0 ? explicit : splitParagraphs(script);
  if (paragraphs.length === 0) return [];

  const modelType: ModelType = opts.modelType ?? "seedance1.5pro";
  const duration = opts.duration ?? 5;
  const resolution = opts.resolution ?? "720p";
  const ratio = opts.ratio ?? "16:9";

  return paragraphs.slice(0, 20).map((p, i) => {
    const ctx = topKContexts(p, paragraphs, 3).filter((x) => x !== p).slice(0, 2);

    const promptParts = [
      "你是动漫短片分镜提示词助手。输出只含画面描述，不要解释。禁止真人实拍、写实摄影、纪录片风格。",
      "",
      "【当前镜头内容】",
      p,
      ctx.length ? "\n【检索到的相关上下文】\n" + ctx.join("\n---\n") : "",
      "",
      "【要求】",
      "- 主体外形色块、场景空间、动作情绪、镜头景别与运动、光影与动漫色调（赛璐璐或三渲二）",
      "- 避免写实皮肤毛孔；避免文字、字幕、logo",
    ].filter(Boolean);

    return {
      id: uuidv4(),
      order: i + 1,
      description: "",
      prompt: promptParts.join("\n"),
      status: "pending",
      modelType,
      duration,
      resolution,
      ratio,
    };
  });
}

