import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * POST /tokenization — 分词（计价 / RAG 切块参考）
 * @see https://www.volcengine.com/docs/82379/1528728
 */
@Injectable()
export class VolcTokenizationService {
  private readonly log = new Logger(VolcTokenizationService.name);

  constructor(private readonly config: ConfigService) {}

  private baseUrl(): string {
    return (
      this.config.get<string>("VOLC_ARK_BASE_URL") ?? "https://ark.cn-beijing.volces.com/api/v3"
    ).replace(/\/$/, "");
  }

  private apiKey(): string {
    return String(this.config.get<string>("SEEDANCE_API_KEY") ?? "").trim();
  }

  /**
   * 请求体字段以控制台文档为准；此处传常见字段，失败时仅打日志。
   */
  async countTokens(text: string, model?: string): Promise<number | null> {
    const key = this.apiKey();
    if (!key || !text.trim()) return null;
    const m =
      model?.trim() ||
      this.config.get<string>("VOLC_TOKENIZATION_MODEL")?.trim() ||
      this.config.get<string>("VOLC_CHAT_MODEL_MINI")?.trim() ||
      this.config.get<string>("VOLC_CHAT_MODEL_PRO")?.trim();
    if (!m) return null;

    const url = `${this.baseUrl()}/tokenization`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: m,
          text,
        }),
      });
      const raw = await res.text();
      if (!res.ok) {
        this.log.debug(`tokenization HTTP ${res.status}: ${raw.slice(0, 200)}`);
        return null;
      }
      const json = JSON.parse(raw) as Record<string, unknown>;
      const total = json.total_tokens ?? json.token_count ?? json.count;
      return typeof total === "number" ? total : null;
    } catch (e) {
      this.log.debug(`tokenization error: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }
}
