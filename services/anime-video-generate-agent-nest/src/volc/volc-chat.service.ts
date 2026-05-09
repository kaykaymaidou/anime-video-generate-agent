import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as path from "node:path";

import { applyEnvFile, resolveAutoDramaNestRoot } from "../nest-env.loader";
import { VolcHttpError } from "./volc-http.error";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function responseFormatUnsupportedByModel(snippet: string): boolean {
  const s = snippet.toLowerCase();
  return (
    s.includes("response_format") ||
    (s.includes("json_object") && s.includes("not supported")) ||
    (s.includes("json_schema") && s.includes("not supported"))
  );
}

@Injectable()
export class VolcChatService implements OnModuleInit {
  private readonly log = new Logger(VolcChatService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const root = resolveAutoDramaNestRoot({ startDirs: [__dirname, process.cwd()], cwd: process.cwd() });
    if (root) applyEnvFile(path.join(root, ".env"), true);
  }

  private envOpt(key: string): string | undefined {
    const pe = process.env[key];
    if (pe != null && String(pe).trim() !== "") return String(pe).trim();
    const cfg = this.config.get<string>(key);
    if (cfg != null && String(cfg).trim() !== "") return String(cfg).trim();
    return undefined;
  }

  private baseUrl(): string {
    const u =
      this.envOpt("VOLC_ARK_BASE_URL") ?? "https://ark.cn-beijing.volces.com/api/v3";
    return u.replace(/\/$/, "");
  }

  private apiKey(): string {
    return this.envOpt("SEEDANCE_API_KEY") ?? "";
  }

  chatModelCascade(): string[] {
    const pro = this.envOpt("VOLC_CHAT_MODEL_PRO");
    const lite = this.envOpt("VOLC_CHAT_MODEL_LITE");
    const mini = this.envOpt("VOLC_CHAT_MODEL_MINI");
    const out = [pro, lite, mini].filter((x): x is string => Boolean(x));
    return [...new Set(out)];
  }

  assertConfigured() {
    if (!this.apiKey()) {
      throw new ServiceUnavailableException("SEEDANCE_API_KEY missing");
    }
    if (this.chatModelCascade().length === 0) {
      throw new ServiceUnavailableException(
        "缺少 VOLC_CHAT_MODEL_PRO / LITE / MINI 之一，检查 services/anime-video-generate-agent-nest/.env 后重启。"
      );
    }
  }

  private retryable(status: number, snippet: string): boolean {
    if (status === 429 || status === 503 || status === 402) return true;
    const s = snippet.toLowerCase();
    return (
      s.includes("quota") ||
      s.includes("limit") ||
      s.includes("insufficient") ||
      s.includes("额度") ||
      s.includes("限流") ||
      s.includes("rate")
    );
  }

  /**
   * 接入点不支持 json_object/json_schema 时设 VOLC_CHAT_SKIP_RESPONSE_FORMAT=1，
   * 请求从一开始就不带 response_format，避免先 400 再重试多一次延迟。
   */
  private skipResponseFormatByEnv(): boolean {
    const v = String(this.envOpt("VOLC_CHAT_SKIP_RESPONSE_FORMAT") ?? "").trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes" || v === "on";
  }

  /**
   * POST /chat/completions（对话 API）
   * @see https://www.volcengine.com/docs/82379/1494384
   */
  async createChatCompletion(body: Record<string, unknown>): Promise<{ content: string; modelUsed: string }> {
    this.assertConfigured();
    const url = `${this.baseUrl()}/chat/completions`;
    let reqBody: Record<string, unknown> = { ...body };
    if (this.skipResponseFormatByEnv() && reqBody.response_format != null) {
      const { response_format: _rf, ...rest } = reqBody;
      reqBody = rest;
    }
    const models = typeof reqBody.model === "string" && String(reqBody.model).trim()
      ? [String(reqBody.model).trim()]
      : this.chatModelCascade();

    let lastErr: VolcHttpError | null = null;
    outer: for (let i = 0; i < models.length; i += 1) {
      const model = models[i];
      let payload: Record<string, unknown> = { ...reqBody, model };

      for (let stripFmt = 0; stripFmt < 2; stripFmt += 1) {
        if (stripFmt === 1) {
          if (payload.response_format == null) continue outer;
          const { response_format: _rf, ...rest } = payload;
          payload = { ...rest, model };
        }

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey()}`,
          },
          body: JSON.stringify(payload),
        });
        const text = await res.text();
        let json: Record<string, unknown> = {};
        if (text.trim()) {
          try {
            json = JSON.parse(text) as Record<string, unknown>;
          } catch {
            /* leave json empty */
          }
        }

        if (!res.ok) {
          if (
            res.status === 400 &&
            stripFmt === 0 &&
            payload.response_format != null &&
            responseFormatUnsupportedByModel(text)
          ) {
            this.log.debug(`Chat model ${model}: response_format rejected by API; retrying without it`);
            continue;
          }

          const err = VolcHttpError.fromResponse(res.status, text);
          const detail = err.message + text;
          const canCascade = i < models.length - 1 && this.retryable(res.status, detail);
          if (canCascade) {
            this.log.warn(`Chat model ${model} failed (${res.status}); cascading…`);
            lastErr = err;
            continue outer;
          }
          throw err;
        }

        const choices = json.choices as Array<{ message?: { content?: string } }> | undefined;
        const content = choices?.[0]?.message?.content;
        if (typeof content !== "string" || !content.trim()) {
          throw VolcHttpError.fromResponse(
            res.status,
            text || '{"error":{"message":"empty choices","code":"InvalidResponse"}}'
          );
        }
        return { content: content.trim(), modelUsed: model };
      }
    }
    throw lastErr ?? VolcHttpError.fromResponse(502, '{"error":{"message":"Chat cascade exhausted"}}');
  }
}
