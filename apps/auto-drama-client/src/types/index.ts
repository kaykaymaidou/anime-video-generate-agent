// ============================================
// Auto-Drama 全局类型定义
// ============================================

// --------------------------------------------
// 基础类型
// --------------------------------------------

/** 视频生成模型类型 */
export type ModelType = "seedance1.5pro";

/** 镜头状态 */
export type ShotStatus = "pending" | "generating" | "success" | "error";

/** 任务状态 */
export type TaskStatus = "idle" | "queued" | "running" | "succeeded" | "failed" | "cancelled";

/** 生成状态 */
export type GenerationStatus = "idle" | "generating" | "completed" | "error";

// --------------------------------------------
// 实体类型
// --------------------------------------------

/** 镜头（用于视频生成） */
export interface Shot {
  id: string;
  order: number;
  description: string;
  prompt: string;
  status: ShotStatus;
  videoUrl?: string | null;
  referenceImage?: string | null;
  lastFrame?: string | null;
  modelType: ModelType;
  duration?: number;
  resolution?: "480p" | "720p" | "1080p";
  ratio?: string;
  fps?: number;
  seed?: number;
  watermark?: boolean;
  camera_fixed?: boolean;
}

/** 解析后的镜头（用于 UI 显示） */
export interface ParsedShot {
  shotNumber: number;
  shotType: string;
  scene: string;
  description: string;
  dialogue?: string;
  action?: string;
  sound?: string;
}

/** 幕/章节 */
export interface Act {
  name: string;
  timeRange: string;
  shots: ParsedShot[];
}

/** 角色 */
export interface Character {
  name: string;
  traits: string;
  arc: string;
}

/** 剧本草稿 */
export interface ScriptDraft {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}

/** 成本记录 */
export interface CostRecord {
  id: string;
  shotId: string;
  amount: number;
  currency: string;
  createdAt: number;
}

// --------------------------------------------
// API 相关类型
// --------------------------------------------

/** 剧本拆镜结果 */
export interface ScriptToStoryboardResult {
  shots: Shot[];
  summary: string;
  acts: Act[];
}

/** Ark 分析结果 */
export interface ArkAnalysisResult {
  acts: {
    name: string;
    timeRange: string;
    summary: string;
    emotionalArc: string;
    shots: (ParsedShot & { prompt: string })[];
  }[];
  characters: Character[];
  suggestions: string[];
}

/** 剧本优化结果 */
export interface ScriptOptimizationResult {
  optimized: string;
  suggestions: string[];
}

/** 生成进度 */
export interface GenerationProgress {
  shotId: string;
  progress: number;
  status: ShotStatus;
  videoUrl?: string;
  message?: string;
}

/** Socket 消息数据 */
export interface SocketMessageData {
  event: string;
  shotId?: string;
  progress?: number;
  video_url?: string;
  message?: string;
  shots?: Shot[];
}

// --------------------------------------------
// 组件 Props 类型
// --------------------------------------------

/** 镜头卡片 Props */
export interface ShotCardProps {
  shot: Shot;
  parsedShot?: ParsedShot;
  selected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  onGenerate?: () => void;
}

/** 章节 Props */
export interface ActSectionProps {
  act: Act;
  shots: Shot[];
  selectedShotId: string | null;
  onSelectShot: (id: string) => void;
  onGenerateShot?: (id: string) => void;
}

