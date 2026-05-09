import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { VolcHttpError } from "./volc-http.error";

/**
 * 图片生成（Seedream 等）— 骨架实现，具体 body 以控制台文档为准。
 * @see https://www.volcengine.com/docs/82379/1541523
 */
@Injectable()
export class VolcImageService {
  private readonly log = new Logger(VolcImageService.name);

  constructor(private readonly config: ConfigService) {}

  private baseUrl(): string {
    return (
      this.config.get<string>("VOLC_ARK_BASE_URL") ?? "https://ark.cn-beijing.volces.com/api/v3"
    ).replace(/\/$/, "");
  }

  private apiKey(): string {
    return String(this.config.get<string>("SEEDANCE_API_KEY") ?? "").trim();
  }

  imageModel(): string {
    return String(this.config.get<string>("VOLC_IMAGE_MODEL_SEEDREAM") ?? "").trim();
  }

  /**
   * 占位：不同产品线路径可能是 /images/generations 等，请按控制台更新 path。
   */
  async generateSeedreamPlaceholder(prompt: string): Promise<Record<string, unknown>> {
    const model = this.imageModel();
    const key = this.apiKey();
    if (!model || !key) {
      throw new VolcHttpError("VOLC_IMAGE_MODEL_SEEDREAM or SEEDANCE_API_KEY missing", 400, "");
    }
    const path =
      this.config.get<string>("VOLC_IMAGE_GENERATIONS_PATH")?.trim() || "/images/generations";
    const url = `${this.baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        // n, size, response_format … 按文档补全
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw VolcHttpError.fromResponse(res.status, text);
    }
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      this.log.warn("Seedream response not JSON");
      return { raw: text };
    }
  }
}
