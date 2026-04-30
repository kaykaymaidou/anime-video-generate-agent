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
  modelType?: "seedance2.0" | "seedance2.0fast";
}

export interface CostLog {
  ts: number;
  description: string;
  amount: number;
  currency: "CNY";
}

