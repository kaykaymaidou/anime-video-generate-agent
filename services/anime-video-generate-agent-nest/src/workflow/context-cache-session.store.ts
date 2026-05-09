import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "node:crypto";

export type ContextCacheSessionEntry = {
  contextId: string;
  fingerprint: string;
  expiresAt: number;
};

/**
 * 进程内 LRU：按客户端传入的 contextCacheKey 复用方舟 context_id（须与 fingerprint 一致）。
 * 多实例部署时不共享；单机开发 / 单 Pod 足够。
 */
@Injectable()
export class ContextCacheSessionStore {
  private readonly entries = new Map<string, ContextCacheSessionEntry>();

  constructor(private readonly config: ConfigService) {}

  fingerprint(script: string, rag: string): string {
    return crypto.createHash("sha256").update(script, "utf8").update("\n").update(rag, "utf8").digest("hex");
  }

  private maxEntries(): number {
    const n = Number(
      this.config.get<string>("VOLC_CONTEXT_CACHE_STORE_MAX") ?? process.env.VOLC_CONTEXT_CACHE_STORE_MAX ?? 500
    );
    return Number.isFinite(n) && n > 8 ? Math.floor(n) : 500;
  }

  get(key: string): ContextCacheSessionEntry | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, e);
    return e;
  }

  set(key: string, v: ContextCacheSessionEntry): void {
    if (!this.entries.has(key) && this.entries.size >= this.maxEntries()) {
      const first = this.entries.keys().next().value;
      if (first) this.entries.delete(first);
    }
    this.entries.delete(key);
    this.entries.set(key, v);
  }

  invalidate(key: string): void {
    this.entries.delete(key);
  }
}
