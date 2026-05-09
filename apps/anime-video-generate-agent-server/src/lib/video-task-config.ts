/**
 * Next 提交视频任务时，选择走 Python HTTP 网关 / stdin，或走 Nest 网关（与 Python 相同 `/v1/tasks` 契约）。
 *
 * VIDEO_TASK_BACKEND=nest  →  HTTP 基址 NEST_API_URL（默认 http://127.0.0.1:4010）
 * VIDEO_TASK_BACKEND=py   →  若设置 PY_GATEWAY_URL 则 HTTP，否则 stdin 子进程（默认）
 *
 * 兼容旧行为：未设置 VIDEO_TASK_BACKEND 时，仅看 PY_GATEWAY_URL（有则 HTTP，无则 stdin）。
 */

export type VideoTaskBackendMode = "py-http" | "py-stdin" | "nest-http";

export function resolveVideoTaskBackend(): VideoTaskBackendMode {
  const explicit = (process.env.VIDEO_TASK_BACKEND || process.env.NEXT_VIDEO_TASK_BACKEND || "")
    .trim()
    .toLowerCase();

  if (explicit === "nest" || explicit === "nestjs") {
    return "nest-http";
  }

  if (explicit === "py" || explicit === "python") {
    const pyUrl = process.env.PY_GATEWAY_URL?.trim();
    return pyUrl ? "py-http" : "py-stdin";
  }

  if (explicit === "py-http" || explicit === "python-http") {
    return process.env.PY_GATEWAY_URL?.trim() ? "py-http" : "py-stdin";
  }

  if (explicit === "py-stdin" || explicit === "python-stdin") {
    return "py-stdin";
  }

  const pyUrl = process.env.PY_GATEWAY_URL?.trim();
  return pyUrl ? "py-http" : "py-stdin";
}

/** HTTP 模式下的网关 origin（无尾部斜杠）；stdin 模式返回 undefined */
export function resolveVideoTaskGatewayBase(): string | undefined {
  const mode = resolveVideoTaskBackend();
  if (mode === "nest-http") {
    const base = (process.env.NEST_API_URL || process.env.NEST_GATEWAY_URL || "http://127.0.0.1:4010").trim();
    return base.replace(/\/$/, "") || undefined;
  }
  if (mode === "py-http") {
    const base = process.env.PY_GATEWAY_URL?.trim();
    return base ? base.replace(/\/$/, "") : undefined;
  }
  return undefined;
}

export function describeVideoTaskBackend(): string {
  const mode = resolveVideoTaskBackend();
  if (mode === "nest-http") return `nest-http (${resolveVideoTaskGatewayBase() || "?"})`;
  if (mode === "py-http") return `py-http (${resolveVideoTaskGatewayBase() || "?"})`;
  return "py-stdin";
}
