export type ModelType = "seedance1.5pro";
export type ShotStatus = "pending" | "generating" | "success" | "error";

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
}

