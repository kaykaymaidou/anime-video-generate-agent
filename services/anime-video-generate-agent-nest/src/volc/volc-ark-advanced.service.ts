import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { VolcHttpError } from "./volc-http.error";

/**
 * 方舟 OpenAPI v3 扩展能力（与 chat/completions 并存）。
 *
 * - 上下文缓存创建：文档 https://www.volcengine.com/docs/82379/1528789?lang=zh
 * - 带缓存对话（Context + Chat）：与 BytePlus/方舟「Context Caching Conversation」一致，默认 POST …/context/chat/completions
 * - 上传文件：文档 https://www.volcengine.com/docs/82379/1870405?lang=zh
 * - Responses 创建 / 查询：文档 https://www.volcengine.com/docs/82379/1569618?lang=zh 、 https://www.volcengine.com/docs/82379/1783709?lang=zh
 *
 * 默认 path 可按控制台实际域名调整；若 404 请对照最新文档设置 VOLC_ARK_CONTEXT_* / VOLC_ARK_FILES_PATH。
 */
@Injectable()
export class VolcArkAdvancedService {
  private readonly log = new Logger(VolcArkAdvancedService.name);

  constructor(private readonly config: ConfigService) {}

  private baseUrl(): string {
    return (
      this.config.get<string>("VOLC_ARK_BASE_URL") ?? "https://ark.cn-beijing.volces.com/api/v3"
    ).replace(/\/$/, "");
  }

  private apiKey(): string {
    return String(this.config.get<string>("SEEDANCE_API_KEY") ?? "").trim();
  }

  private assertApiKey(): void {
    if (!this.apiKey()) {
      throw new ServiceUnavailableException("SEEDANCE_API_KEY missing");
    }
  }

  private relPath(key: string, fallback: string): string {
    const v = String(this.config.get<string>(key) ?? "").trim().replace(/^\/+/, "");
    return v || fallback;
  }

  private async postJson(urlPath: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.assertApiKey();
    const url = `${this.baseUrl()}/${urlPath.replace(/^\/+/, "")}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey()}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw VolcHttpError.fromResponse(res.status, text);
    }
    if (!text.trim()) return {};
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw VolcHttpError.fromResponse(res.status, text);
    }
  }

  private async getJson(urlPath: string): Promise<Record<string, unknown>> {
    this.assertApiKey();
    const url = `${this.baseUrl()}/${urlPath.replace(/^\/+/, "")}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.apiKey()}` },
    });
    const text = await res.text();
    if (!res.ok) {
      throw VolcHttpError.fromResponse(res.status, text);
    }
    if (!text.trim()) return {};
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw VolcHttpError.fromResponse(res.status, text);
    }
  }

  /**
   * 创建上下文缓存，返回中含 id（如 ctx-xxx），供 contextChatCompletion 使用。
   * body：model、messages、mode（session | common_prefix）、ttl 等，见官方文档。
   */
  async createContextCache(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const path = this.relPath("VOLC_ARK_CONTEXT_CREATE_PATH", "context/caching");
    const json = await this.postJson(path, body);
    const id = json.id;
    if (typeof id === "string" && id.trim()) {
      this.log.debug(`context cache created: ${id.slice(0, 24)}…`);
    }
    return json;
  }

  /**
   * 使用 context_id 调用对话（与常规 chat/completions 字段大半一致，但不支持 tools 等，见文档）。
   */
  async contextChatCompletion(body: Record<string, unknown>): Promise<{
    content: string;
    modelUsed: string;
    raw: Record<string, unknown>;
  }> {
    const path = this.relPath("VOLC_ARK_CONTEXT_CHAT_PATH", "context/chat/completions");
    const json = await this.postJson(path, body);
    const choices = json.choices as Array<{ message?: { content?: string } }> | undefined;
    const content = choices?.[0]?.message?.content;
    const modelUsed = String(json.model ?? body.model ?? "");
    if (typeof content !== "string" || !content.trim()) {
      throw VolcHttpError.fromResponse(502, JSON.stringify(json).slice(0, 2400));
    }
    return { content: content.trim(), modelUsed, raw: json };
  }

  /** 上传文件，返回结构以方舟为准（通常含 id）。purpose 默认可用环境变量覆盖。 */
  async uploadFile(params: {
    buffer: Buffer;
    filename: string;
    purpose?: string;
  }): Promise<Record<string, unknown>> {
    this.assertApiKey();
    const path = this.relPath("VOLC_ARK_FILES_PATH", "files");
    const url = `${this.baseUrl()}/${path.replace(/^\/+/, "")}`;
    const purpose =
      params.purpose ??
      (String(this.config.get<string>("VOLC_ARK_FILE_PURPOSE") ?? "").trim() || "user_data");
    const form = new FormData();
    form.append("purpose", purpose);
    const bytes = Uint8Array.from(params.buffer);
    form.append("file", new Blob([bytes]), params.filename);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey()}` },
      body: form,
    });
    const text = await res.text();
    if (!res.ok) {
      throw VolcHttpError.fromResponse(res.status, text);
    }
    if (!text.trim()) return {};
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw VolcHttpError.fromResponse(res.status, text);
    }
  }

  /** POST /responses — 创建模型响应（可配合官方 caching / previous_response_id 等字段）。 */
  async createResponse(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const path = this.relPath("VOLC_ARK_RESPONSES_PATH", "responses");
    return this.postJson(path, body);
  }

  /** GET /responses/{id} — 查询模型响应。 */
  async getResponse(responseId: string): Promise<Record<string, unknown>> {
    const base = this.relPath("VOLC_ARK_RESPONSES_PATH", "responses");
    const id = encodeURIComponent(responseId.trim());
    return this.getJson(`${base}/${id}`);
  }
}
