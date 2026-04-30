import { Router } from "express";
import { z } from "zod";
import type { Server as SocketIOServer } from "socket.io";
import { PythonBridgeService } from "../services/PythonBridgeService";

const ShotSchema = z.object({
  id: z.string(),
  order: z.number().int().min(1),
  description: z.string().default(""),
  prompt: z.string().min(1),
  referenceImage: z.string().optional(),
  lastFrame: z.string().optional(),
  modelType: z.enum(["seedance2.0", "seedance2.0fast"]).default("seedance2.0")
});

const SubmitSchema = z.object({
  shots: z.array(ShotSchema).min(1)
});

export function createTasksRouter(opts: { io: SocketIOServer; repoRootDir: string }) {
  const router = Router();
  const bridge = new PythonBridgeService({
    repoRootDir: opts.repoRootDir,
    onEvent: (evt) => {
      // 统一通过 progress-update 推给前端
      opts.io.emit("progress-update", evt);
    }
  });

  router.post("/", async (req, res) => {
    const parsed = SubmitSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "invalid payload", issues: parsed.error.issues });

    // 立刻初始化 UI（工业规范：pending）
    opts.io.emit("progress-update", {
      event: "pipeline-init",
      shots: parsed.data.shots.map((s) => ({
        id: s.id,
        order: s.order,
        description: s.description,
        prompt: s.prompt,
        status: "pending"
      }))
    });

    // 逐镜头并行触发 Python（这里先串行，后续可接队列并发控制）
    for (const s of parsed.data.shots) {
      bridge.runTask({
        shotId: s.id,
        prompt: s.prompt,
        modelType: s.modelType,
        img_urls: s.referenceImage ? [s.referenceImage] : [],
        frame_image_url: s.lastFrame || null
      });
    }

    res.json({ ok: true });
  });

  return router;
}

