import { spawn } from "node:child_process";
import readline from "node:readline";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type PythonEvent =
  | { event: "log"; message: string; shotId?: string }
  | { event: "progress"; progress: number; message?: string; shotId?: string }
  | { event: "cost"; amount: number; currency: string; shotId?: string }
  | { event: "result"; video_url: string; shotId?: string }
  | { event: "error"; message: string; shotId?: string };

export interface PythonBridgeOptions {
  repoRootDir: string;
  pythonBin?: string;
  onEvent: (evt: PythonEvent) => void;
}

export class PythonBridgeService {
  private repoRootDir: string;
  private pythonBin: string;
  private onEvent: (evt: PythonEvent) => void;

  constructor(opts: PythonBridgeOptions) {
    this.repoRootDir = opts.repoRootDir;
    this.pythonBin = opts.pythonBin || process.env.PYTHON_BIN || "python";
    this.onEvent = opts.onEvent;
  }

  runTask(task: unknown) {
    const jobId = randomUUID();
    const script = path.join(this.repoRootDir, "auto-drama-ai", "src", "main.py");
    const proc = spawn(this.pythonBin, [script], {
      cwd: this.repoRootDir,
      stdio: ["pipe", "pipe", "pipe"]
    });

    const rl = readline.createInterface({ input: proc.stdout });
    rl.on("line", (line) => {
      const text = String(line || "").trim();
      if (!text) return;
      try {
        const evt = JSON.parse(text) as PythonEvent;
        if ((evt as any)?.event) this.onEvent(evt);
      } catch {
        this.onEvent({ event: "log", message: text });
      }
    });

    proc.stderr.on("data", (buf) => {
      const msg = String(buf || "").trim();
      if (msg) this.onEvent({ event: "log", message: `py.stderr: ${msg}` });
    });

    proc.on("exit", (code) => {
      if (code && code !== 0) this.onEvent({ event: "error", message: `python exited code=${code}` });
    });

    proc.stdin.write(JSON.stringify(task));
    proc.stdin.end();

    return { jobId };
  }
}

