/** Socket / 回调：拆镜流水线阶段通知 */
export type StoryboardPipelineStagePayload = {
  stage: string;
  progress: number;
  message: string;
};

/** LangChain 分镜流水线中的单条镜头（与 refine / Seedance 对齐） */
export type PipelineShot = {
  order: number;
  description: string;
  prompt: string;
  duration?: number;
  resolution?: "480p" | "720p" | "1080p";
  ratio?: "16:9" | "9:16" | "1:1";
  fps?: number;
};

export type DirectorBrief = {
  styleBible: string;
  narrativeBeats: string[];
};

/** Runnable / LangGraph 共享的可变状态 */
export type PipelineState = {
  script: string;
  ragContext?: string;
  director?: DirectorBrief;
  storyboard?: { shots: PipelineShot[] };
  /** LangGraph 补救回路：附加在分镜首轮请求末尾 */
  remedySuffix?: string;
};
