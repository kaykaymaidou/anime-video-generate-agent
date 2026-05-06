import type { Server as IOServer } from "socket.io";

let io: IOServer | undefined;
const backlog: unknown[] = [];
const progressDebug =
  String(process.env.PROGRESS_DEBUG || "0").toLowerCase() === "1" ||
  String(process.env.PROGRESS_DEBUG || "0").toLowerCase() === "true";

export type ProgressEmitter = Pick<IOServer, "emit">;

export function setIo(instance: IOServer) {
  io = instance;
  // flush backlog
  while (backlog.length > 0) {
    const msg = backlog.shift();
    if (msg) emitProgress(msg);
  }
}

export function getIo(): IOServer | undefined {
  return io;
}

function roomFor(payload: any) {
  const taskId = typeof payload?.taskId === "string" ? payload.taskId : "";
  return taskId ? `task:${taskId}` : null;
}

export function emitProgress(payload: unknown) {
  if (!io) {
    backlog.push(payload);
    if (backlog.length > 2000) backlog.splice(0, backlog.length - 2000);
    return;
  }
  const r = roomFor(payload as any);
  // 默认输出关键事件（非 heartbeat），用于端到端排障
  try {
    const p: any = payload as any;
    const ev = typeof p?.event === "string" ? p.event : "";
    if (ev && ev !== "heartbeat" && ev !== "pong" && ev !== "hello" && ev !== "hello-ack") {
      // eslint-disable-next-line no-console
      console.log("[progress.send]", {
        room: r ?? "*",
        event: ev,
        taskId: typeof p?.taskId === "string" ? p.taskId : undefined,
        shotId: typeof p?.shotId === "string" ? p.shotId : undefined,
        progress: typeof p?.progress === "number" ? p.progress : undefined
      });
    }
  } catch {}
  if (progressDebug) {
    const p: any = payload as any;
    // eslint-disable-next-line no-console
    console.log("[progress.emit]", {
      room: r ?? "*",
      event: typeof p?.event === "string" ? p.event : undefined,
      taskId: typeof p?.taskId === "string" ? p.taskId : undefined,
      shotId: typeof p?.shotId === "string" ? p.shotId : undefined,
      progress: typeof p?.progress === "number" ? p.progress : undefined,
      message: typeof p?.message === "string" ? p.message : undefined,
    });
  }
  if (r) io.to(r).emit("progress-update", payload);
  else io.emit("progress-update", payload);
}

/**
 * 始终可用的 progress emitter：
 * - Socket 未初始化时：先暂存，避免 API 503 阻塞主链路
 * - Socket 初始化后：自动补发 backlog
 */
export function getProgressEmitter(): ProgressEmitter {
  return {
    emit: (_event: string, payload: unknown) => {
      emitProgress(payload);
      return true as any;
    }
  } as ProgressEmitter;
}
