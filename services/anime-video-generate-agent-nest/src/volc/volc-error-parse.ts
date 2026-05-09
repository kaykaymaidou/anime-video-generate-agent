/** 从方舟 OpenAI 风格响应或火山 OpenAPI ResponseMetadata 中解析错误 */

export type ParsedVolcApiError = {
  code?: string;
  message?: string;
  type?: string;
  /** 引擎公共错误码数值（文档 CodeN） */
  codeN?: number;
};

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function parseVolcErrorBody(text: string): ParsedVolcApiError {
  if (!text?.trim()) return {};
  try {
    const json = JSON.parse(text) as Record<string, unknown>;

    /** OpenAPI：`ResponseMetadata.Error`（签名校验、管控类） */
    const rm = json.ResponseMetadata;
    if (rm && typeof rm === "object") {
      const errObj = (rm as Record<string, unknown>).Error;
      if (errObj && typeof errObj === "object") {
        const e = errObj as Record<string, unknown>;
        return {
          code: typeof e.Code === "string" ? e.Code : undefined,
          message: typeof e.Message === "string" ? e.Message : undefined,
          codeN: num(e.CodeN),
        };
      }
    }

    if (json.error && typeof json.error === "object") {
      const e = json.error as Record<string, unknown>;
      return {
        code: typeof e.code === "string" ? e.code : undefined,
        message: typeof e.message === "string" ? e.message : undefined,
        type: typeof e.type === "string" ? e.type : undefined,
        codeN: num(e.code_n) ?? num(e.CodeN),
      };
    }

    return {
      code: typeof json.code === "string" ? json.code : undefined,
      message:
        typeof json.message === "string"
          ? json.message
          : typeof json.detail === "string"
            ? json.detail
            : undefined,
      codeN: num(json.code_n) ?? num(json.CodeN),
    };
  } catch {
    return { message: text.slice(0, 500) };
  }
}
