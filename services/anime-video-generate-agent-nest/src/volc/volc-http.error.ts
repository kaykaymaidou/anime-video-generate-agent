import { parseVolcErrorBody } from "./volc-error-parse";

/** Ark / 火山 OpenAPI HTTP 非 2xx：带状态码与解析出的 code / CodeN */
export class VolcHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly bodySnippet: string,
    readonly arkCode?: string,
    readonly arkMessage?: string,
    readonly arkCodeN?: number
  ) {
    super(message);
    this.name = "VolcHttpError";
  }

  static fromResponse(status: number, text: string): VolcHttpError {
    const p = parseVolcErrorBody(text);
    const msg = (p.message || text || `HTTP ${status}`).slice(0, 1200);
    return new VolcHttpError(msg, status, text.slice(0, 2400), p.code, p.message, p.codeN);
  }
}
