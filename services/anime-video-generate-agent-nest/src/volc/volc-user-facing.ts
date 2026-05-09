import { HttpException, HttpStatus } from "@nestjs/common";

import { ARK_INFERENCE_ERROR_DOC_URL, presentArkInferenceError } from "./ark-inference-errors";
import { VolcHttpError } from "./volc-http.error";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** 将方舟 HTTP 状态映射为对外 HTTP API 状态（避免把 500 原样暴露为 500，可按需调整） */
export function httpStatusFromVolc(status: number): number {
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 429) {
    return status;
  }
  if (status >= 500 && status <= 599) {
    return HttpStatus.BAD_GATEWAY;
  }
  return HttpStatus.BAD_GATEWAY;
}

export function volcFailurePayload(err: unknown): Record<string, unknown> {
  if (err instanceof VolcHttpError) {
    const pres = presentArkInferenceError({
      httpStatus: err.status,
      code: err.arkCode,
      codeN: err.arkCodeN,
      rawMessage: err.arkMessage ?? err.message,
    });
    return {
      userMessage: pres.title,
      hint: pres.hint,
      ark_code: pres.code ?? err.arkCode,
      volc_code_n: pres.codeN ?? err.arkCodeN,
      doc_url: pres.docUrl ?? ARK_INFERENCE_ERROR_DOC_URL,
      raw_message: err.arkMessage ?? err.message,
      http_status: err.status,
    };
  }
  if (err instanceof HttpException) {
    const res = err.getResponse();
    if (isRecord(res) && typeof res.userMessage === "string") {
      return {
        ...res,
        doc_url: typeof res.doc_url === "string" ? res.doc_url : ARK_INFERENCE_ERROR_DOC_URL,
      };
    }
    const msg = typeof res === "string" ? res : err.message;
    return {
      userMessage: "请求失败",
      hint: msg.slice(0, 400),
      doc_url: ARK_INFERENCE_ERROR_DOC_URL,
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  return {
    userMessage: "请求失败",
    hint: msg.slice(0, 400),
    doc_url: ARK_INFERENCE_ERROR_DOC_URL,
  };
}

export function throwVolcAsHttpException(err: unknown): never {
  if (err instanceof VolcHttpError) {
    throw new HttpException(volcFailurePayload(err), httpStatusFromVolc(err.status));
  }
  throw err;
}
