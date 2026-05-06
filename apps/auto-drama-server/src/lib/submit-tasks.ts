import path from "node:path";
import { NextResponse } from "next/server";
import type { Server as SocketIOServer } from "socket.io";
import { z } from "zod";

import { PythonBridgeService, type PythonBridgeOptions } from "@/lib/python-bridge";
import { v4 as uuidv4 } from "uuid";
import { emitProgress } from "@/lib/io-registry";

export type TaskBridge = { runTask: (task: unknown) => unknown };

export type TaskBridgeFactory = (opts: PythonBridgeOptions) => TaskBridge;

const ShotSchema = z.object({
  id: z.string(),
  order: z.number().int().min(1),
  description: z.string().default(""),
  prompt: z.string().min(1),
  referenceImage: z.string().optional(),
  lastFrame: z.string().optional(),
  modelType: z.enum(["seedance1.5pro"]).default("seedance1.5pro"),
  duration: z.number().int().min(2).max(12).optional(),
  resolution: z.enum(["480p", "720p", "1080p"]).optional(),
  ratio: z.string().optional(),
  fps: z.number().int().min(1).max(60).optional(),
  seed: z.number().int().optional(),
  watermark: z.boolean().optional(),
  camera_fixed: z.boolean().optional()
});

const SubmitSchema = z.object({
  taskId: z.string().optional(),
  shots: z.array(ShotSchema).min(1)
});

export type TaskSubmitBody = z.infer<typeof SubmitSchema>;

const eventLogBudgetByTask = new Map<string, number>();
function shouldLogTaskEvent(taskId: string, limit = 40): boolean {
  const n = (eventLogBudgetByTask.get(taskId) ?? 0) + 1;
  eventLogBudgetByTask.set(taskId, n);
  // 控制台只保留有限条，避免 18 镜头刷屏
  return n <= limit;
}

export function resolveMonorepoRoot(): string {
  return path.resolve(process.cwd(), "..", "..");
}

export function handleTaskSubmit(
  body: unknown,
  opts: { io: Pick<SocketIOServer, "emit">; repoRootDir?: string; bridgeFactory?: TaskBridgeFactory }
): NextResponse {
  const pipelineDebug =
    String(process.env.PIPELINE_DEBUG || "0").toLowerCase() === "1" ||
    String(process.env.PIPELINE_DEBUG || "0").toLowerCase() === "true";

  const parsed = SubmitSchema.safeParse(body);
  if (!parsed.success) {
    if (pipelineDebug) {
      // eslint-disable-next-line no-console
      console.log("[pipeline] invalid payload", parsed.error.issues);
    }
    return NextResponse.json({ message: "invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const taskId = parsed.data.taskId ?? uuidv4();

  const repoRootDir = opts.repoRootDir ?? resolveMonorepoRoot();

  // 里程碑：任务已被服务端接收
  emitProgress({ event: "log", taskId, message: "server accepted task; preparing python bridge" } as any);
  opts.io.emit("progress-update", { event: "log", taskId, message: "server accepted task; preparing python bridge" });
  // 默认也打印关键链路（避免“啥也没有输出”）
  // eslint-disable-next-line no-console
  console.log("[pipeline] accepted", { taskId, shots: parsed.data.shots.length });
  if (pipelineDebug) {
    // eslint-disable-next-line no-console
    console.log("[pipeline] accepted(debug)", { taskId, shots: parsed.data.shots.length, repoRootDir });
  }

  const factory = opts.bridgeFactory ?? ((o: PythonBridgeOptions) => new PythonBridgeService(o));
  const bridge = factory({
    repoRootDir,
    onEvent: (evt) => {
      emitProgress(evt);
      opts.io.emit("progress-update", evt);

      // 仅输出“Next 收到的事件摘要”，不打印 Python 原文
      if (pipelineDebug) {
        const e: any = evt as any;
        const ev = typeof e?.event === "string" ? e.event : "";
        const tId = typeof e?.taskId === "string" ? e.taskId : taskId;
        const sId = typeof e?.shotId === "string" ? e.shotId : undefined;
        if (tId && shouldLogTaskEvent(tId)) {
          // eslint-disable-next-line no-console
          console.log("[pipeline] event", {
            taskId: tId,
            shotId: sId,
            event: ev,
            progress: typeof e?.progress === "number" ? e.progress : undefined,
            message: typeof e?.message === "string" ? e.message : undefined,
            hasVideoUrl: typeof e?.video_url === "string"
          });
        }
      }
    }
  });

  emitProgress({
    event: "pipeline-init",
    taskId,
    shots: parsed.data.shots.map((s) => ({
      id: s.id,
      order: s.order,
      description: s.description,
      prompt: s.prompt,
      status: "pending"
    }))
  });
  opts.io.emit("progress-update", {
    event: "pipeline-init",
    taskId,
    shots: parsed.data.shots.map((s) => ({
      id: s.id,
      order: s.order,
      description: s.description,
      prompt: s.prompt,
      status: "pending"
    }))
  });

  for (const s of parsed.data.shots) {
    emitProgress({ event: "log", taskId, shotId: s.id, message: "spawning python worker for shot" } as any);
    opts.io.emit("progress-update", { event: "log", taskId, shotId: s.id, message: "spawning python worker for shot" });
    // eslint-disable-next-line no-console
    console.log("[pipeline] spawn python", { taskId, shotId: s.id, modelType: s.modelType, duration: s.duration });
    if (pipelineDebug) {
      // eslint-disable-next-line no-console
      console.log("[pipeline] spawn python(debug)", { taskId, shotId: s.id, modelType: s.modelType, duration: s.duration });
    }
    bridge.runTask({
      taskId,
      shotId: s.id,
      prompt: s.prompt,
      modelType: s.modelType,
      duration: s.duration,
      resolution: s.resolution,
      ratio: s.ratio,
      fps: s.fps,
      seed: s.seed,
      watermark: s.watermark,
      camera_fixed: s.camera_fixed,
      reference_image_urls: s.referenceImage ? [s.referenceImage] : undefined,
      last_frame_url: s.lastFrame || undefined
    });
  }

  return NextResponse.json({ ok: true, taskId });
}
