function digVideoUrl(x: unknown): string {
  if (x == null) return "";
  if (typeof x === "string" && x.startsWith("http")) return x;
  if (typeof x === "object" && x !== null && !Array.isArray(x)) {
    const o = x as Record<string, unknown>;
    for (const k of ["video_url", "url", "download_url"]) {
      const v = o[k];
      if (typeof v === "string" && v.startsWith("http")) return v;
    }
    for (const v of Object.values(o)) {
      const u = digVideoUrl(v);
      if (u) return u;
    }
  }
  if (Array.isArray(x)) {
    for (const it of x) {
      const u = digVideoUrl(it);
      if (u) return u;
    }
  }
  return "";
}

/** 将方舟 GET task 的 JSON 转为前端/bridge 使用的快照结构 */
export function taskSnapshotFromVolcJson(raw: Record<string, unknown>): Record<string, unknown> {
  const status = String(raw.status ?? "");
  const ark_task_id = typeof raw.id === "string" ? raw.id : undefined;

  const contentRaw = raw.content as Record<string, unknown> | undefined;
  let video_url = String(contentRaw?.video_url ?? "").trim();
  let last_frame_url = String(contentRaw?.last_frame_url ?? "").trim();
  const file_url = String(contentRaw?.file_url ?? "").trim();

  const topLast = raw.last_frame_url;
  if (!last_frame_url && typeof topLast === "string") last_frame_url = topLast.trim();
  if (!video_url) {
    const dug = digVideoUrl(raw);
    if (dug) video_url = dug;
  }

  const usage =
    raw.usage && typeof raw.usage === "object" && raw.usage !== null
      ? { ...(raw.usage as Record<string, unknown>) }
      : {};

  let tool_usage: unknown[] = [];
  const tools = raw.tools;
  if (Array.isArray(tools)) {
    tool_usage = tools.map((t) =>
      typeof t === "object" && t !== null ? { ...(t as object) } : { type: String(t) }
    );
  }

  let error_out: Record<string, unknown> | undefined;
  const err = raw.error;
  if (err != null && typeof err === "object") {
    const e = err as Record<string, unknown>;
    error_out = {
      message: e.message,
      code: e.code
    };
  }

  return {
    status,
    ark_task_id,
    model: raw.model,
    content: {
      video_url,
      last_frame_url,
      file_url
    },
    usage,
    tool_usage,
    error: error_out,
    created_at: raw.created_at,
    updated_at: raw.updated_at
  };
}
