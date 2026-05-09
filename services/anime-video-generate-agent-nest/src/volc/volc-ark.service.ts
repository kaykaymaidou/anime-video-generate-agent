import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { buildCreateBodyFromWorkerTask, type WorkerTaskInput } from "./seedance-body.builder";
import { taskSnapshotFromVolcJson } from "./task-snapshot";
import { VolcHttpError } from "./volc-http.error";
import { throwVolcAsHttpException } from "./volc-user-facing";

@Injectable()
export class VolcArkService {
  private readonly log = new Logger(VolcArkService.name);

  constructor(private readonly config: ConfigService) {}

  private baseUrl(): string {
    return (
      this.config.get<string>("VOLC_ARK_BASE_URL") ?? "https://ark.cn-beijing.volces.com/api/v3"
    ).replace(/\/$/, "");
  }

  private apiKey(): string {
    return String(this.config.get<string>("SEEDANCE_API_KEY") ?? "").trim();
  }

  private modelEp(): string {
    return String(this.config.get<string>("VOLC_SEEDANCE_PRO_MODEL") ?? "").trim();
  }

  assertConfigured() {
    if (!this.apiKey()) {
      throw new ServiceUnavailableException("SEEDANCE_API_KEY missing");
    }
    if (!this.modelEp()) {
      throw new ServiceUnavailableException("VOLC_SEEDANCE_PRO_MODEL missing");
    }
  }

  buildBodyFromWorker(task: WorkerTaskInput, modelEndpointId?: string): Record<string, unknown> {
    const ep = (modelEndpointId ?? "").trim() || this.modelEp();
    return buildCreateBodyFromWorkerTask(task, ep, process.env);
  }

  private retryableSeedance(status: number, snippet: string): boolean {
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

  /** 底层 POST，抛出 VolcHttpError 以便创建任务时做 Seedance Endpoint 降级 */
  async postContentsGenerationTask(body: Record<string, unknown>): Promise<string> {
    this.assertConfigured();
    const url = `${this.baseUrl()}/contents/generations/tasks`;
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
    let json: Record<string, unknown> = {};
    if (text.trim()) {
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw VolcHttpError.fromResponse(res.status, text);
      }
    }
    const id = json.id;
    if (typeof id !== "string" || !id) {
      throw VolcHttpError.fromResponse(res.status, text || '{"error":"missing id"}');
    }
    return id;
  }

  /**
   * curl 等价：POST "${VOLC_ARK_BASE_URL}/contents/generations/tasks"
   */
  async createGenerationTask(body: Record<string, unknown>): Promise<string> {
    try {
      return await this.postContentsGenerationTask(body);
    } catch (e) {
      throwVolcAsHttpException(e);
    }
  }

  /**
   * 先走 VOLC_SEEDANCE_PRO_MODEL（1.5 Pro）；额度/限流类错误时改走 VOLC_SEEDANCE_FALLBACK_MODEL（如 1.0 Pro Endpoint）。
   */
  async createFromWorkerPayload(task: WorkerTaskInput): Promise<string> {
    this.assertConfigured();
    const primary = this.modelEp();
    const fallback = String(this.config.get<string>("VOLC_SEEDANCE_FALLBACK_MODEL") ?? "").trim();
    try {
      const body = this.buildBodyFromWorker(task, primary);
      this.log.debug(`Volc create task model=${String(body.model)}`);
      return await this.postContentsGenerationTask(body);
    } catch (e) {
      if (
        e instanceof VolcHttpError &&
        fallback &&
        this.retryableSeedance(e.status, `${e.message}\n${e.bodySnippet}`)
      ) {
        this.log.warn(`Seedance primary failed (${e.status}); retry with fallback endpoint`);
        const body2 = this.buildBodyFromWorker(task, fallback);
        return await this.postContentsGenerationTask(body2);
      }
      throwVolcAsHttpException(e);
    }
  }

  async getGenerationTask(taskId: string): Promise<Record<string, unknown>> {
    this.assertConfigured();
    const url = `${this.baseUrl()}/contents/generations/tasks/${encodeURIComponent(taskId)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.apiKey()}` },
    });
    const text = await res.text();
    if (!res.ok) {
      throwVolcAsHttpException(VolcHttpError.fromResponse(res.status, text));
    }
    let json: Record<string, unknown> = {};
    if (text.trim()) {
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        throwVolcAsHttpException(VolcHttpError.fromResponse(res.status, text));
      }
    }
    return taskSnapshotFromVolcJson(json);
  }

  async deleteGenerationTask(taskId: string): Promise<void> {
    this.assertConfigured();
    const url = `${this.baseUrl()}/contents/generations/tasks/${encodeURIComponent(taskId)}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.apiKey()}` },
    });
    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      throwVolcAsHttpException(VolcHttpError.fromResponse(res.status, text));
    }
  }
}
