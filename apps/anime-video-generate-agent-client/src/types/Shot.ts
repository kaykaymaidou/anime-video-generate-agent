export type ModelType = "seedance1.5pro";
export type ShotStatus = "pending" | "generating" | "success" | "error";

export interface Shot {
  id: string;
  order: number;
  description: string;
  prompt: string;
  status: ShotStatus;
  videoUrl?: string | null;
  videoTakeUrls?: string[];
  referenceImage?: string | null;
  firstFrame?: string | null;
  lastFrame?: string | null;
  modelType: ModelType;
}

