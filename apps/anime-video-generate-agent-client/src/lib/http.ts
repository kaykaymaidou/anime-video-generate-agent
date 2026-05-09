export function resolveApiUrl(path: string): string {
  const raw = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const base = typeof raw === "string" ? raw.trim().replace(/\/$/, "") : "";
  if (!base) return path;
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

export type VolcApiErrorPayload = {
  userMessage?: string;
  hint?: string;
  ark_code?: string;
  volc_code_n?: number;
  doc_url?: string;
  raw_message?: string;
  http_status?: number;
};

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(resolveApiUrl(path), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let fallback = `API ${res.status}: ${text || res.statusText}`;
    try {
      const j = JSON.parse(text) as { message?: unknown };
      const m = j?.message;
      if (m && typeof m === "object" && m !== null) {
        const o = m as VolcApiErrorPayload;
        const title = typeof o.userMessage === "string" ? o.userMessage : fallback;
        const hint = typeof o.hint === "string" ? o.hint : "";
        const doc = typeof o.doc_url === "string" ? o.doc_url : "";
        const code = typeof o.ark_code === "string" ? o.ark_code : "";
        const codeN = typeof o.volc_code_n === "number" ? String(o.volc_code_n) : "";
        const lines = [
          title,
          hint,
          code ? `错误码：${code}` : "",
          codeN ? `CodeN：${codeN}` : "",
          doc ? `说明：${doc}` : "",
        ].filter(Boolean);
        fallback = lines.join("\n\n");
      } else if (typeof m === "string") {
        fallback = m;
      }
    } catch {
      /* keep fallback */
    }
    throw new Error(fallback);
  }

  return (await res.json()) as T;
}

export const apiFetch = requestJson;
