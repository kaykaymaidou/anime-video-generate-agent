export type ModelType = "seedance2.0" | "seedance2.0fast";
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

