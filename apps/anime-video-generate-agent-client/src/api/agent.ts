import { requestJson } from "@/lib/http";

export type ScriptReviewResponse = {
  summary: string;
  missing_visual_elements: string[];
  suggestions: string[];
  format_notes: string[];
};

export type StoryboardPreviewShot = {
  order: number;
  description: string;
  prompt: string;
  duration?: number;
  resolution?: string;
  ratio?: string;
  fps?: number;
};

export type AnimeStylePresetId = "cel_jp" | "guoman_paint" | "ink_manga" | "chibi";

export function postScriptReview(script: string) {
  return requestJson<ScriptReviewResponse>("/api/agent/script-review", {
    method: "POST",
    body: JSON.stringify({ script }),
  });
}

export type StoryboardPreviewBody = {
  script: string;
  /** 预留知识库片段：将与服务端 AUTO_DRAMA_KB_SNIPPET 合并后注入导演 Agent */
  knowledgeContext?: string;
  /** 与 VOLC_AGENT_CONTEXT_CACHE 配合跨请求复用方舟上下文（客户端持久化项目 ID） */
  contextCacheKey?: string;
  /** 与网关 Socket `subscribe-task` 一致；服务端按阶段向该房间推送进度 */
  progressTaskId?: string;
  /** 与提交生成一致：写入 composeSeedancePrompt 的人设一致层 */
  consistencyNotes?: string;
  animeStylePreset?: AnimeStylePresetId;
  animePromptBoost?: "manga_storyboard" | "none";
  inheritCrossShotStyle?: boolean;
  /** 服务端拆镜 JSON 的 maxItems，影响导演/分镜 Schema 上限 */
  storyboardMaxShots?: number;
};

export function postStoryboardPreview(body: StoryboardPreviewBody) {
  return requestJson<{ shots: StoryboardPreviewShot[] }>("/api/agent/storyboard-preview", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** 与 Editor 提交字段一致，避免与 store 中 Shot 可选字段强耦合 */
export type SubmitAgentShotPayload = {
  id: string;
  order: number;
  description: string;
  prompt: string;
  modelType: string;
  duration?: number;
  resolution?: string;
  ratio?: string;
  fps?: number;
  seed?: number;
  watermark?: boolean;
  camera_fixed?: boolean;
  referenceImage?: string;
  firstFrame?: string;
  lastFrame?: string;
};

export type SubmitAgentPayload = {
  taskId: string;
  script: string;
  /** 服务端会附加到每个镜头的 Seedance 提示词，用于角色与画风一致 */
  consistencyNotes?: string;
  /** 与 consistency 分层注入；后续可换向量检索，现可为手动粘贴的设定原文 */
  knowledgeContext?: string;
  /** 拆镜与全流程共用上下文缓存键（须与预览一致） */
  contextCacheKey?: string;
  /** 日系赛璐璐 / 国漫厚涂 / 水墨漫 / Q 版 */
  animeStylePreset?: AnimeStylePresetId;
  /** 漫画分镜构图语法增强 */
  animePromptBoost?: "manga_storyboard" | "none";
  /** 跨镜头继承上一镜基底要点，减轻跳变 */
  inheritCrossShotStyle?: boolean;
  /** 与拆镜预览一致：覆盖单次流水线最大镜头数（越高越容易细拆衔接镜，消耗越大） */
  storyboardMaxShots?: number;
  shots: SubmitAgentShotPayload[];
};

export function postAgentSubmit(body: SubmitAgentPayload) {
  return requestJson<{ ok: boolean; taskId?: string }>("/api/agent", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
