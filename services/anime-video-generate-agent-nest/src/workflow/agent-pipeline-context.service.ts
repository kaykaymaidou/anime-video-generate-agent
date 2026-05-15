import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { VolcArkAdvancedService } from "../volc/volc-ark-advanced.service";
import { VolcHttpError } from "../volc/volc-http.error";
import { ContextCacheSessionStore } from "./context-cache-session.store";
import { truthyEnv } from "./env-flag.util";

const CONTEXT_PREFIX_BOOT_SYS =
  "以下为同一动漫短片项目的固定上下文（剧本与知识库）。后续你是导演、分镜或质检 Agent 时，不要要求用户重复粘贴全文；必要时引用「上下文缓存中的剧本与知识库」即可。";

/**
 * 方舟 common_prefix 上下文缓存：创建、会话持久化、复用判定。
 * 与「导演/分镜/质检」业务解耦，仅负责 IO 与 TTL。
 */
@Injectable()
export class AgentPipelineContextService {
  private readonly log = new Logger(AgentPipelineContextService.name);

  constructor(
    private readonly arkAdv: VolcArkAdvancedService,
    private readonly ctxStore: ContextCacheSessionStore,
    private readonly config: ConfigService
  ) {}

  isContextCacheEnabled(): boolean {
    if (truthyEnv("VOLC_AGENT_CONTEXT_CACHE_DISABLE")) return false;
    const raw = String(
      this.config.get<string>("VOLC_AGENT_CONTEXT_CACHE") ?? process.env.VOLC_AGENT_CONTEXT_CACHE ?? ""
    )
      .trim()
      .toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  }

  ttlSeconds(): number {
    const n = Number(this.config.get<string>("VOLC_CHAT_CONTEXT_TTL") ?? process.env.VOLC_CHAT_CONTEXT_TTL ?? 3600);
    if (!Number.isFinite(n)) return 3600;
    return Math.min(604_800, Math.max(3600, Math.round(n)));
  }

  isReuseEnabled(): boolean {
    if (!this.isContextCacheEnabled()) return false;
    if (truthyEnv("VOLC_AGENT_CONTEXT_CACHE_REUSE_DISABLE")) return false;
    const raw = String(
      this.config.get<string>("VOLC_AGENT_CONTEXT_CACHE_REUSE") ?? process.env.VOLC_AGENT_CONTEXT_CACHE_REUSE ?? "1"
    )
      .trim()
      .toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  }

  shouldInvalidateReuse(e: unknown): boolean {
    if (!(e instanceof VolcHttpError)) return false;
    if (e.status === 403) return true;
    const blob = `${e.message}\n${e.bodySnippet}`.toLowerCase();
    return (
      blob.includes("context") &&
      (blob.includes("invalid") || blob.includes("expired") || blob.includes("state") || blob.includes("not found"))
    );
  }

  persistSession(sessionKey: string | undefined, script: string, rag: string, contextId: string | null): void {
    if (!this.isContextCacheEnabled() || !sessionKey?.trim() || !contextId) return;
    const fp = this.ctxStore.fingerprint(script, rag);
    this.ctxStore.set(sessionKey.trim(), {
      contextId,
      fingerprint: fp,
      expiresAt: Date.now() + this.ttlSeconds() * 1000,
    });
  }

  invalidateSession(sessionKey: string): void {
    this.ctxStore.invalidate(sessionKey);
  }

  async establishArkContext(opts: {
    script: string;
    rag: string;
    primaryModel: string;
    sessionKey?: string;
    forceNew?: boolean;
  }): Promise<{ contextId: string | null; reusedFromStore: boolean }> {
    if (!this.isContextCacheEnabled()) {
      return { contextId: null, reusedFromStore: false };
    }
    const fp = this.ctxStore.fingerprint(opts.script, opts.rag);
    const key = opts.sessionKey?.trim();
    if (!opts.forceNew && this.isReuseEnabled() && key) {
      const hit = this.ctxStore.get(key);
      if (hit && hit.fingerprint === fp) {
        this.log.debug(`pipeline context cache session hit (${key.slice(0, 10)}…)`);
        return { contextId: hit.contextId, reusedFromStore: true };
      }
    }

    try {
      const prefixUser = [
        opts.rag ? `【知识库/设定片段】\n${opts.rag}` : "",
        "\n【用户剧本/创意】\n",
        opts.script,
      ]
        .filter(Boolean)
        .join("\n");
      const created = await this.arkAdv.createContextCache({
        model: opts.primaryModel,
        mode: "common_prefix",
        ttl: this.ttlSeconds(),
        messages: [
          { role: "system", content: CONTEXT_PREFIX_BOOT_SYS },
          { role: "user", content: prefixUser },
        ],
      });
      const id = created.id;
      const cid = typeof id === "string" && id.trim() ? id.trim() : null;
      if (cid) {
        this.log.debug(`pipeline context cache created ${cid.slice(0, 16)}… ttl=${this.ttlSeconds()}s`);
      }
      if (cid && key) {
        this.persistSession(key, opts.script, opts.rag, cid);
      }
      return { contextId: cid, reusedFromStore: false };
    } catch (e) {
      this.log.warn(
        `VOLC_AGENT_CONTEXT_CACHE: create failed, fallback to plain chat — ${e instanceof Error ? e.message : String(e)}`
      );
      return { contextId: null, reusedFromStore: false };
    }
  }
}
