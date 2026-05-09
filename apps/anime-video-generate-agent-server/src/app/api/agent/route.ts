import { NextResponse } from "next/server";

import { getProgressEmitter } from "@/lib/io-registry";
import { handleTaskSubmit } from "@/lib/submit-tasks";
import { refineAgentRequest } from "@/lib/agent/refine-storyboard";
import {
  arkStructuredStoryboardFromScript,
  shouldSkipArkStoryboard,
} from "@/lib/ark/storyboard";

export const runtime = "nodejs";

/**
 * 智能体编排入口（MVP）：
 * - 前端可先做 RAG 拆镜，带 shots + 火山视频参数提交到这里
 * - 这里统一发出 agent-plan 事件，并复用 /api/tasks 的执行通路
 */
export async function POST(req: Request) {
  const io = getProgressEmitter();

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ message: "invalid JSON" }, { status: 400 });
  }

  const maybe = json as any;
  const taskId = typeof maybe?.taskId === "string" ? maybe.taskId : undefined;

  io.emit("progress-update", {
    event: "agent-plan",
    taskId,
    message: "agent accepted request; refining storyboard"
  });

  // 若传入 script，则先用 Ark 文本模型做结构化拆镜（JSON Schema 强约束）
  let enriched: unknown = json;
  const script = typeof maybe?.script === "string" ? maybe.script.trim() : "";
  const hasShots = Array.isArray(maybe?.shots) && maybe.shots.length > 0;

  // 有 script 时默认走 Ark 结构化拆镜；ARK_STORYBOARD_SKIP=1 时跳过以节省 token（SPEC-002）
  if (script && !shouldSkipArkStoryboard()) {
    try {
      io.emit("progress-update", { event: "agent-ark", taskId, message: "calling Ark structured storyboard model" });
      const out = await arkStructuredStoryboardFromScript({ script });
      const byOrder = new Map<number, any>();
      if (hasShots) {
        for (const s of maybe.shots) {
          const o = Number(s?.order);
          if (Number.isFinite(o)) byOrder.set(o, s);
        }
      }
      enriched = {
        taskId,
        script,
        shots: out.shots.map((s) => ({
          // 复用前端已有 uuid（如果存在），否则交由 refine 生成
          id: byOrder.get(s.order)?.id,
          order: s.order,
          description: s.description,
          prompt: s.prompt,
          duration: s.duration,
          resolution: s.resolution,
          ratio: s.ratio,
          fps: s.fps
        }))
      };
    } catch (e: any) {
      io.emit("progress-update", {
        event: "agent-ark-error",
        taskId,
        message: e?.message || "Ark storyboard failed; falling back to local refinement"
      });
      enriched = json;
    }
  } else if (script && shouldSkipArkStoryboard()) {
    io.emit("progress-update", {
      event: "agent-ark-skipped",
      taskId,
      message: "ARK_STORYBOARD_SKIP：跳过 Ark 拆镜，使用本地 refine",
    });
  }

  const refined = refineAgentRequest(enriched);
  if (!refined.ok) {
    io.emit("progress-update", {
      event: "agent-error",
      taskId,
      message: "invalid agent payload",
      issues: refined.error.issues
    });
    return NextResponse.json({ message: "invalid agent payload", issues: refined.error.issues }, { status: 400 });
  }

  io.emit("progress-update", {
    event: "agent-refined",
    taskId,
    shots: refined.data.shots,
  });

  // 关键：把 taskId 透传到 submit，保证房间一致
  return handleTaskSubmit({ taskId, shots: refined.data.shots }, { io });
}

