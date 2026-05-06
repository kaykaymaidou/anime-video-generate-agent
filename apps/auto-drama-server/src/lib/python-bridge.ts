import { spawn } from "node:child_process";
import readline from "node:readline";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type PythonEvent =
  | { event: "log"; message: string; shotId?: string; taskId?: string; ark_task_id?: string }
  | { event: "progress"; progress: number; message?: string; shotId?: string; taskId?: string }
  | { event: "cost"; amount: number; currency: string; shotId?: string; taskId?: string }
  | { event: "result"; video_url: string; shotId?: string; taskId?: string; cost?: number }
  | { event: "error"; message: string; shotId?: string; taskId?: string }
  | {
      event: "task_snapshot";
      shotId?: string;
      taskId?: string;
      ark_task_id?: string;
      status?: string;
      content?: unknown;
      usage?: unknown;
      tool_usage?: unknown;
      error?: unknown;
    }
  | { event: "done"; shotId?: string; taskId?: string };

export interface PythonBridgeOptions {
  repoRootDir: string;
  pythonBin?: string;
  onEvent: (evt: PythonEvent) => void;
}

export class PythonBridgeService {
  private repoRootDir: string;
  private pythonBin: string;
  private onEvent: (evt: PythonEvent) => void;
  private debugLevel: "off" | "event" | "raw";
  private gatewayUrl?: string;

  constructor(opts: PythonBridgeOptions) {
    this.repoRootDir = opts.repoRootDir;
    this.pythonBin = opts.pythonBin || process.env.PYTHON_BIN || "python";
    this.onEvent = opts.onEvent;
    this.gatewayUrl = process.env.PY_GATEWAY_URL?.trim() || undefined;
    const raw = String(process.env.PY_BRIDGE_DEBUG || "0").toLowerCase().trim();
    if (raw === "raw") this.debugLevel = "raw";
    else if (raw === "event" || raw === "1" || raw === "true") this.debugLevel = "event";
    else this.debugLevel = "off";
  }

  runTask(task: unknown) {
    const t = (task ?? {}) as any;
    const shotId = typeof t?.shotId === "string" ? t.shotId : typeof t?.id === "string" ? t.id : undefined;
    const taskId = typeof t?.taskId === "string" ? t.taskId : typeof t?.task_id === "string" ? t.task_id : undefined;

    if (this.gatewayUrl) {
      void this.runTaskViaGateway(task, taskId, shotId);
      return { jobId: randomUUID() };
    }

    const jobId = randomUUID();
    const script = path.join(this.repoRootDir, "services", "auto-drama-ai", "src", "main.py");
    if (this.debugLevel !== "off") {
      // eslint-disable-next-line no-console
      console.log("[py-bridge] spawn", { jobId, taskId, shotId, pythonBin: this.pythonBin, script });
    }
    const proc = spawn(this.pythonBin, ["-X", "utf8", script], {
      cwd: this.repoRootDir,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        // 强制 UTF-8，避免 Windows 下 stdout/stderr 乱码（例如 “轮询超时” 变成 ��）
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8"
      }
    });

    const rl = readline.createInterface({ input: proc.stdout });
    rl.on("line", (line) => {
      const text = String(line || "").trim();
      if (!text) return;
      if (this.debugLevel === "raw") {
        // eslint-disable-next-line no-console
        console.log(`[py.stdout] ${text}`);
      }
      try {
        const evt = JSON.parse(text) as PythonEvent;
        if ((evt as { event?: string })?.event) {
          // 确保 taskId/shotId 贯穿，便于前端定位 + 房间路由
          const patched = { ...evt } as any;
          if (taskId && !patched.taskId) patched.taskId = taskId;
          if (shotId && !patched.shotId) patched.shotId = shotId;
          if (this.debugLevel !== "off") {
            // eslint-disable-next-line no-console
            console.log("[py.event]", {
              event: patched.event,
              taskId: patched.taskId,
              shotId: patched.shotId,
              progress: patched.progress,
              message: patched.message
            });
          }
          this.onEvent(patched);
        }
      } catch {
        this.onEvent({ event: "log", message: text, ...(taskId ? { taskId } : {}), ...(shotId ? { shotId } : {}) } as any);
      }
    });

    proc.stderr.on("data", (buf) => {
      const msg = String(buf || "").trim();
      if (msg) {
        if (this.debugLevel === "raw") {
          // eslint-disable-next-line no-console
          console.log(`[py.stderr] ${msg}`);
        }
        this.onEvent(
          { event: "log", message: `py.stderr: ${msg}`, ...(taskId ? { taskId } : {}), ...(shotId ? { shotId } : {}) } as any
        );
      }
    });

    proc.on("exit", (code) => {
      if (this.debugLevel !== "off") {
        // eslint-disable-next-line no-console
        console.log("[py-bridge] exit", { jobId, taskId, shotId, code });
      }
      if (code && code !== 0) {
        this.onEvent(
          { event: "error", message: `python exited code=${code}`, ...(taskId ? { taskId } : {}), ...(shotId ? { shotId } : {}) } as any
        );
      }
    });

    proc.stdin.write(JSON.stringify(task));
    proc.stdin.end();

    return { jobId };
  }

  private async runTaskViaGateway(task: unknown, taskId?: string, shotId?: string) {
    const base = this.gatewayUrl!.replace(/\/$/, "");
    const pollMs = Math.max(1500, Number(process.env.PY_GATEWAY_POLL_MS || 2000));
    const timeoutSec = Math.max(30, Number(process.env.SEEDANCE_POLL_TIMEOUT_S || 600));
    const deadline = Date.now() + timeoutSec * 1000;
    const started = Date.now();

    const emit = (evt: Record<string, unknown>) => {
      const o = { ...evt } as PythonEvent & Record<string, unknown>;
      if (taskId && o.taskId == null) (o as any).taskId = taskId;
      if (shotId && o.shotId == null) (o as any).shotId = shotId;
      if ((o as any).event) this.onEvent(o as PythonEvent);
    };

    const readErr = (data: unknown): string => {
      if (!data || typeof data !== "object") return "request failed";
      const d = data as { detail?: unknown };
      if (typeof d.detail === "string") return d.detail;
      if (Array.isArray(d.detail)) return JSON.stringify(d.detail);
      return "request failed";
    };

    try {
      const res = await fetch(`${base}/v1/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(task)
      });
      const data = (await res.json()) as { ark_task_id?: string };
      if (!res.ok) throw new Error(readErr(data));
      const arkTaskId = data.ark_task_id;
      if (!arkTaskId) throw new Error("gateway returned no ark_task_id");
      emit({ event: "log", message: `ark task created ${arkTaskId}`, ark_task_id: arkTaskId });

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, pollMs));
        const gr = await fetch(`${base}/v1/tasks/${encodeURIComponent(arkTaskId)}`);
        const snap = (await gr.json()) as Record<string, unknown>;
        if (!gr.ok) throw new Error(readErr(snap));

        emit({
          event: "task_snapshot",
          ark_task_id: (snap.ark_task_id as string) || arkTaskId,
          status: snap.status as string | undefined,
          content: snap.content,
          usage: snap.usage,
          tool_usage: snap.tool_usage,
          error: snap.error
        });

        const st = String(snap.status || "").toLowerCase();
        const content = snap.content as { video_url?: string } | undefined;
        const videoUrl = content?.video_url;
        if (st === "succeeded" && videoUrl) {
          const usage = snap.usage as { cost?: number } | undefined;
          const cost = typeof usage?.cost === "number" ? usage.cost : 0;
          emit({ event: "progress", progress: 100, message: "视频生成完成" });
          emit({ event: "result", video_url: videoUrl, cost });
          emit({ event: "done" });
          return;
        }
        if (st === "failed" || st === "cancelled") {
          const err = snap.error as { message?: string } | undefined;
          emit({ event: "error", message: err?.message || st });
          return;
        }
        const elapsed = Date.now() - started;
        const pseudo = Math.min(88, 8 + Math.floor(elapsed / Math.max(1000, timeoutSec * 25)));
        emit({ event: "progress", progress: pseudo, message: `状态: ${st || "running"}` });
      }
      emit({ event: "error", message: "轮询超时" });
    } catch (e: unknown) {
      emit({ event: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }
}
