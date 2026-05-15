import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";

import { parseStoryboardMaxShotsInput, resolveStoryboardShotBounds } from "../volc/storyboard-schema";
import type { IProgressBroadcaster } from "../realtime/progress-broadcaster.interface";
import { ProgressGateway } from "../realtime/progress.gateway";
import { VolcArkService } from "../volc/volc-ark.service";
import { volcFailurePayload } from "../volc/volc-user-facing";
import { AnimeAgentPipelineService } from "./anime-agent.pipeline.service";
import { mergeKnowledgeLayers, defaultKnowledgeSnippetFromEnv } from "./prompt-policy";
import { ScriptIntentService, type ScriptIntentAnalysis } from "./script-intent.service";
import { DirectorAgentService } from "./workflow-engines.service";
import { refineAgentRequest, type RefinedShot } from "./refine-agent";
import { ShotContinuityPassService } from "./shot-continuity-pass.service";
import { isPrAShotContinuityEnabled, propagateAdjacentFirstFrames } from "./shot-continuity.util";
import { UsageLedgerService } from "./usage-ledger.service";

@Injectable()
export class AgentService {
  private readonly log = new Logger(AgentService.name);
  private readonly progress: IProgressBroadcaster;

  constructor(
    private readonly volc: VolcArkService,
    progressGateway: ProgressGateway,
    private readonly director: DirectorAgentService,
    private readonly animePipeline: AnimeAgentPipelineService,
    private readonly scriptIntent: ScriptIntentService,
    private readonly usageLedger: UsageLedgerService,
    private readonly shotContinuity: ShotContinuityPassService
  ) {
    this.progress = progressGateway;
  }

  async handleAgent(body: unknown): Promise<{ ok: boolean; taskId: string }> {
    const maybe = body as Record<string, unknown>;
    const taskId =
      typeof maybe.taskId === "string" && maybe.taskId.trim() ? maybe.taskId.trim() : uuidv4();

    const emit = (evt: Record<string, unknown>) => {
      const merged = { ...evt };
      if (merged.taskId == null) merged.taskId = taskId;
      this.progress.broadcastProgress(merged);
    };

    emit({ event: "agent-plan", message: "Nest workflow accepted request" });
    this.director.emitWorkflowMilestones(taskId, emit);

    const script = typeof maybe.script === "string" ? maybe.script.trim() : "";
    const storyboardMaxShots = parseStoryboardMaxShotsInput(maybe.storyboardMaxShots);
    const shotBoundsForIntent = resolveStoryboardShotBounds(storyboardMaxShots);
    let bodyForRefine: unknown = body;

    let intentSnapshot: ScriptIntentAnalysis | null = null;
    if (script && this.animePipeline.isEnabled()) {
      try {
        intentSnapshot = await this.scriptIntent.analyze(script, shotBoundsForIntent);
        if (intentSnapshot) {
          emit({
            event: "agent-intent",
            intent: intentSnapshot.intent,
            evolution_stages: intentSnapshot.evolution_stages,
            seconds_per_shot: intentSnapshot.seconds_per_shot,
            reference_image_queries: intentSnapshot.reference_image_queries,
            message:
              intentSnapshot.evolution_stages.length >= 2
                ? `意图 ${intentSnapshot.intent}：${intentSnapshot.evolution_stages.join("→")} · 每镜约 ${intentSnapshot.seconds_per_shot}s`
                : `意图 ${intentSnapshot.intent}`,
          });
        }
      } catch (e) {
        this.log.warn(`script intent skipped: ${e instanceof Error ? e.message : String(e)}`);
        intentSnapshot = null;
      }
    }

    if (script && this.animePipeline.isEnabled()) {
      try {
        emit({
          event: "agent-langchain-start",
          message: "LangChain：导演 → 结构化分镜 → 质检（方舟对话模型 + 降级链）",
        });
        const kbRaw = typeof maybe.knowledgeContext === "string" ? maybe.knowledgeContext.trim() : "";
        const kbMerged = mergeKnowledgeLayers(defaultKnowledgeSnippetFromEnv(), kbRaw || undefined);
        const ctxKey =
          typeof maybe.contextCacheKey === "string" && maybe.contextCacheKey.trim()
            ? maybe.contextCacheKey.trim()
            : undefined;
        const { shots: llmShots } = await this.animePipeline.run({
          script,
          ...(kbMerged ? { ragContext: kbMerged } : {}),
          intentAnalysis: intentSnapshot,
          ...(ctxKey ? { contextCacheKey: ctxKey } : {}),
          ...(storyboardMaxShots != null ? { storyboardMaxShots } : {}),
        });
        const existing = Array.isArray(maybe.shots) ? maybe.shots : [];
        const merged = llmShots.map((s, idx) => {
          const match =
            existing.find((x: { order?: number }) => Number(x?.order) === s.order) ?? existing[idx];
          const base =
            match && typeof match === "object" ? (match as Record<string, unknown>) : {};
          return {
            ...base,
            order: s.order,
            description: s.description,
            prompt: s.prompt,
            ...(s.duration != null ? { duration: s.duration } : {}),
            ...(s.resolution ? { resolution: s.resolution } : {}),
            ...(s.ratio ? { ratio: s.ratio } : {}),
            ...(s.fps != null ? { fps: s.fps } : {}),
          };
        });
        bodyForRefine = {
          ...maybe,
          script,
          shots: merged,
          ...(storyboardMaxShots != null ? { storyboardMaxShots } : {}),
          ...(intentSnapshot && intentSnapshot.evolution_stages.length >= 2
            ? {
                intentStages: intentSnapshot.evolution_stages,
                intentSecondsPerShot: intentSnapshot.seconds_per_shot,
              }
            : {}),
        };
        emit({ event: "agent-langchain-done", shotCount: merged.length });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`LangChain pipeline fallback to local refine: ${msg}`);
        const ux = volcFailurePayload(e);
        emit({
          event: "agent-langchain-error",
          message: ux.userMessage,
          hint: ux.hint,
          ark_code: ux.ark_code,
          volc_code_n: ux.volc_code_n,
          doc_url: ux.doc_url,
        });
        bodyForRefine =
          intentSnapshot && intentSnapshot.evolution_stages.length >= 2
            ? {
                ...maybe,
                intentStages: intentSnapshot.evolution_stages,
                intentSecondsPerShot: intentSnapshot.seconds_per_shot,
              }
            : body;
      }
    }

    const refined = refineAgentRequest(bodyForRefine);
    if (!refined.ok) {
      emit({
        event: "agent-error",
        message: "invalid agent payload",
        issues: refined.error.issues,
      });
      throw new BadRequestException({
        message: "invalid agent payload",
        issues: refined.error.issues,
      });
    }

    let shotsOut = refined.data.shots;
    if (isPrAShotContinuityEnabled()) {
      const afterFrames = propagateAdjacentFirstFrames(shotsOut);
      emit({
        event: "agent-pr-a-frames",
        message: "PR-A：已尝试上一镜 lastFrame → 下一镜 firstFrame 对齐",
        frames: afterFrames.map((s) => ({
          order: s.order,
          hasFirstFrame: Boolean(s.firstFrame?.trim()),
          hasLastFrame: Boolean(s.lastFrame?.trim()),
        })),
      });
      shotsOut = await this.shotContinuity.applyTextBridging(afterFrames);
      emit({
        event: "agent-pr-a-text",
        message: "PR-A：已对无首帧锚点的镜头尝试全局文本衔接（若对话模型不可用则跳过）",
      });
    }

    emit({ event: "agent-refined", shots: shotsOut });

    emit({
      event: "pipeline-init",
      shots: shotsOut.map((s) => ({
        id: s.id,
        order: s.order,
        description: s.description,
        prompt: s.prompt,
        status: "pending",
      })),
    });

    for (const shot of shotsOut) {
      void this.runShot(taskId, shot, emit);
    }

    return { ok: true, taskId };
  }

  private async runShot(
    taskId: string,
    shot: RefinedShot,
    emit: (e: Record<string, unknown>) => void
  ) {
    try {
      emit({
        event: "log",
        shotId: shot.id,
        message: "submitting shot via nest → 火山 Ark HTTP",
      });

      this.volc.assertConfigured();
      const arkTaskId = await this.volc.createFromWorkerPayload({
        prompt: shot.prompt,
        modelType: shot.modelType,
        duration: shot.duration,
        resolution: shot.resolution,
        ratio: shot.ratio,
        seed: shot.seed,
        watermark: shot.watermark,
        camera_fixed: shot.camera_fixed,
        reference_image_urls: shot.referenceImage ? [shot.referenceImage] : undefined,
        first_frame_url: shot.firstFrame,
        last_frame_url: shot.lastFrame,
      });

      emit({
        event: "log",
        shotId: shot.id,
        message: `ark task created ${arkTaskId}`,
        ark_task_id: arkTaskId,
      });

      const timeoutSec = Math.max(30, Number(process.env.SEEDANCE_POLL_TIMEOUT_S || 600));
      const pollMs = Math.max(1500, Number(process.env.PY_GATEWAY_POLL_MS || 2000));
      const deadline = Date.now() + timeoutSec * 1000;
      const started = Date.now();

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, pollMs));
        const snap = (await this.volc.getGenerationTask(arkTaskId)) as Record<string, unknown>;
        emit({
          event: "task_snapshot",
          taskId,
          shotId: shot.id,
          ark_task_id: snap.ark_task_id ?? arkTaskId,
          status: snap.status,
          content: snap.content,
          usage: snap.usage,
          tool_usage: snap.tool_usage,
          error: snap.error,
        });

        const st = String(snap.status || "").toLowerCase();
        const content = snap.content as { video_url?: string } | undefined;
        const videoUrl = content?.video_url;
        if (st === "succeeded" && videoUrl) {
          const usage = snap.usage as { cost?: number } | undefined;
          const cost = typeof usage?.cost === "number" ? usage.cost : 0;
          this.usageLedger.recordShot({
            taskId,
            shotId: shot.id,
            cost,
            modelType: shot.modelType,
            videoUrl,
          });
          emit({ event: "progress", progress: 100, message: "视频生成完成", shotId: shot.id });
          emit({ event: "result", video_url: videoUrl, shotId: shot.id, cost });
          emit({ event: "done", shotId: shot.id });
          return;
        }
        if (st === "failed" || st === "cancelled") {
          const err = snap.error as { message?: string } | undefined;
          emit({ event: "error", shotId: shot.id, message: err?.message || st });
          return;
        }
        const elapsed = Date.now() - started;
        const pseudo = Math.min(88, 8 + Math.floor(elapsed / Math.max(1000, timeoutSec * 25)));
        emit({
          event: "progress",
          progress: pseudo,
          message: `状态: ${st || "running"}`,
          shotId: shot.id,
          kind: "gateway-poll",
          backend: "nest",
        });
      }
      emit({ event: "error", shotId: shot.id, message: "轮询超时" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.error(msg);
      const ux = volcFailurePayload(e);
      emit({
        event: "error",
        shotId: shot.id,
        message: ux.userMessage,
        hint: ux.hint,
        ark_code: ux.ark_code,
        volc_code_n: ux.volc_code_n,
        doc_url: ux.doc_url,
      });
    }
  }
}
