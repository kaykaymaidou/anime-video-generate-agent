import { stripSurrogates } from "./text.util";

export interface WorkerTaskInput {
  prompt?: string;
  modelType?: string;
  duration?: number;
  resolution?: string;
  ratio?: string;
  seed?: number;
  watermark?: boolean;
  camera_fixed?: boolean;
  reference_image_urls?: string[];
  img_urls?: string[];
  first_frame_url?: string;
  last_frame_url?: string;
}

function validateParams(resolution: string, duration: number, modelType: string) {
  if (modelType !== "seedance1.5pro") {
    throw new Error("model_type must be seedance1.5pro");
  }
  if (duration < 2 || duration > 12) {
    throw new Error("duration must be 2..12 seconds");
  }
  if (!["1080p", "720p", "480p"].includes(resolution)) {
    throw new Error("resolution must be 1080p/720p/480p");
  }
}

/**
 * POST /contents/generations/tasks 请求体（与 Python build_content / 官方文档一致）
 */
export function buildCreateBodyFromWorkerTask(
  task: WorkerTaskInput,
  modelEndpointId: string,
  env: NodeJS.ProcessEnv
): Record<string, unknown> {
  let reference_image_urls = task.reference_image_urls;
  const img_urls = task.img_urls ?? [];
  if (reference_image_urls == null && img_urls.length > 0) {
    reference_image_urls = img_urls;
  }

  const duration = Number(task.duration ?? 5);
  const resolution = String(task.resolution ?? "720p").toLowerCase();
  const ratio = String(task.ratio ?? "16:9");
  const model_type = String(task.modelType ?? "seedance1.5pro");
  const seedRaw = task.seed;
  const seed =
    seedRaw !== undefined && seedRaw !== null && String(seedRaw).trim() !== ""
      ? Number(seedRaw)
      : -1;

  const prompt = stripSurrogates(String(task.prompt ?? ""));
  validateParams(resolution, duration, model_type);

  const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];

  const firstUrl = task.first_frame_url?.trim();
  if (firstUrl) {
    content.push({
      type: "image_url",
      image_url: { url: firstUrl },
      role: "first_frame"
    });
  }

  const lastUrl = task.last_frame_url?.trim();
  if (lastUrl) {
    content.push({
      type: "image_url",
      image_url: { url: lastUrl },
      role: "last_frame"
    });
  }

  if (reference_image_urls?.length) {
    for (const url of reference_image_urls.slice(0, 4)) {
      content.push({
        type: "image_url",
        image_url: { url },
        role: "reference_image"
      });
    }
  } else if (img_urls.length > 0 && !firstUrl) {
    for (const url of img_urls.slice(0, 1)) {
      content.push({
        type: "image_url",
        image_url: { url },
        role: "first_frame"
      });
    }
  }

  const body: Record<string, unknown> = {
    model: modelEndpointId,
    content,
    resolution,
    ratio,
    duration,
    camera_fixed: Boolean(task.camera_fixed)
  };

  if (seed >= 0) body.seed = Math.floor(seed);

  const cb = String(env.VOLC_SEEDANCE_CALLBACK_URL ?? "").trim();
  if (cb) body.callback_url = cb;

  const wmEnv = String(env.VOLC_SEEDANCE_WATERMARK ?? "").trim().toLowerCase();
  if (wmEnv === "1" || wmEnv === "true" || wmEnv === "yes") body.watermark = true;
  else if (wmEnv === "0" || wmEnv === "false" || wmEnv === "no") body.watermark = false;
  else if (task.watermark) body.watermark = true;

  const ga = String(env.VOLC_SEEDANCE_GENERATE_AUDIO ?? "").trim().toLowerCase();
  if (ga === "1" || ga === "true" || ga === "yes") body.generate_audio = true;
  else if (ga === "0" || ga === "false" || ga === "no") body.generate_audio = false;

  const rl = String(env.VOLC_SEEDANCE_RETURN_LAST_FRAME ?? "").trim().toLowerCase();
  if (rl === "1" || rl === "true" || rl === "yes") body.return_last_frame = true;

  return body;
}
