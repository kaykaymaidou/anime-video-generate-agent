/**
 * 错误码 → 用户可读文案
 * - 方舟推理：https://www.volcengine.com/docs/82379/1299023?lang=zh
 * - 火山引擎 OpenAPI 公共错误码（签名 / 管控面等）：https://www.volcengine.com/docs/6369/68677?lang=zh
 */

export const ARK_INFERENCE_ERROR_DOC_URL =
  "https://www.volcengine.com/docs/82379/1299023?lang=zh";

export const VOLC_ENGINE_PUBLIC_ERROR_DOC_URL =
  "https://www.volcengine.com/docs/6369/68677?lang=zh";

export type ArkUserFacingError = {
  title: string;
  hint: string;
  code?: string;
  /** 引擎侧数值错误码（如 100010），便于工单 */
  codeN?: number;
  /** 优先展示的文档链接 */
  docUrl?: string;
};

/** 方舟推理等业务返回的 error.code（字符串） */
const ARK_CODE_MAP: Record<string, { title: string; hint: string }> = {
  InvalidParameter: {
    title: "参数不合法",
    hint: "请检查模型、接入点 ID、分辨率等字段是否符合方舟接口文档。",
  },
  "InvalidEndpoint.ClosedEndpoint": {
    title: "推理接入点不可用",
    hint: "该接入点已被关闭或暂时不可用，请稍后重试或到控制台检查接入点状态。",
  },
  AuthenticationError: {
    title: "鉴权失败（API Key）",
    hint: "API Key 无效或未上传，请检查环境变量里的密钥是否与控制台一致。",
  },
  AccountOverdueError: {
    title: "账号欠费",
    hint: "请前往火山引擎控制台充值或结清账单后再试。",
  },
  "InvalidEndpoint.NotFound": {
    title: "接入点不存在",
    hint: "推理接入点 ID 错误或已删除，请核对 VOLC_*_MODEL 等 Endpoint 配置。",
  },
  "RateLimitExceeded.EndpointRPMExceeded": {
    title: "接入点 RPM 超限",
    hint: "每分钟请求次数超限，请稍后再试或降低并发。",
  },
  "RateLimitExceeded.EndpointTPMExceeded": {
    title: "接入点 TPM 超限",
    hint: "每分钟 Token 用量超限，请稍后再试或缩短单次上下文。",
  },
  ModelAccountRpmRateLimitExceeded: {
    title: "模型 RPM 超限",
    hint: "当前账号在该模型上的每分钟请求已达上限，请稍后重试。",
  },
  ModelAccountTpmRateLimitExceeded: {
    title: "模型 TPM 超限",
    hint: "当前账号在该模型上的每分钟 Token 已达上限，请稍后或换用降级模型。",
  },
  QuotaExceeded: {
    title: "额度已用尽",
    hint: "免费试用或套餐额度已用完，请到方舟控制台开通或升级计费。",
  },
  ModelLoadingError: {
    title: "模型加载中",
    hint: "服务正在加载模型，请稍后重试（常见于冷启动或长时间未用的接入点）。",
  },
  ServerOverloaded: {
    title: "服务端繁忙",
    hint: "当前资源紧张，请稍后重试；突发流量时较常见。",
  },
  /** 视频/多模态生成：提示词等文本触发输入侧敏感校验（非 HTTP 字段名写错） */
  InputTextSensitiveContentDetected: {
    title: "文本未通过内容安全审核",
    hint:
      "方舟判定当前提交的中文/英文描述可能命中敏感规则（含误判）。请改写镜头 Prompt、侧栏「画风一致」或剧本用词，减少暴力、色情、涉政、违禁品等表述；与接口字段是否与文档一致无关。若仅为动漫打斗场面，可改为更含蓄的镜头语言（剪影、光影、不含血腥特写等）。",
  },
};

/**
 * 火山引擎 OpenAPI 公共错误码（与文档 Code / CodeN 一致）
 * @see https://www.volcengine.com/docs/6369/68677?lang=zh
 */
const PLATFORM_CODE_MAP: Record<string, { title: string; hint: string; codeN: number }> = {
  MissingParameter: {
    title: "缺少必要参数",
    hint: "关键参数缺失（如 OpenAPI 的 Action、Version；或请求头/签名所需字段）。请对照对应产品 API 文档补齐参数，建议使用官方 SDK 构造请求。",
    codeN: 100002,
  },
  MissingRequestInfo: {
    title: "缺少请求必要信息",
    hint: "缺少请求必要信息（例如 X-Date 等）。请检查请求头是否完整。",
    codeN: 100004,
  },
  InvalidTimestamp: {
    title: "请求时间戳无效",
    hint: "签名已过期或设备时间异常。请将本机时间校准为 UTC，并按 ISO 8601：`YYYYMMDD'T'HHMMSS'Z'`。",
    codeN: 100006,
  },
  ServiceNotFound: {
    title: "服务不存在",
    hint: "请求的 Service 名称不正确。请对照产品 API 文档检查 Service 字段。",
    codeN: 100007,
  },
  InvalidActionOrVersion: {
    title: "接口或版本不存在",
    hint: "Action 或 Version 与文档不符。请核对 OpenAPI 文档中的接口名与版本号。",
    codeN: 100008,
  },
  InvalidAccessKey: {
    title: "Access Key 无效",
    hint: "AK 不合法或含有多余空格。请检查 Access Key Id 与 Secret。",
    codeN: 100009,
  },
  SignatureDoesNotMatch: {
    title: "签名不匹配",
    hint: "服务端计算的签名与请求不一致。请使用官方 SDK 或对照签名示例检查 SigningKey、CanonicalRequest 等步骤。",
    codeN: 100010,
  },
  AccessDenied: {
    title: "访问被拒绝",
    hint: "当前身份无权执行该操作：若为 OpenAPI 子用户，请在 IAM 中授予对应策略；若为方舟 API Key，请检查模型/资源白名单与账号权限。",
    codeN: 100013,
  },
  InternalError: {
    title: "引擎内部错误",
    hint: "火山引擎侧内部错误，请稍后重试；频繁出现请通过控制台工单联系。",
    codeN: 100014,
  },
  InternalServiceTimeout: {
    title: "内部服务超时",
    hint: "上游执行超时。请稍后重试；持续出现请工单联系。",
    codeN: 100016,
  },
  FlowLimitExceeded: {
    title: "OpenAPI 流控超限",
    hint: "当前 OpenAPI 请求速率超过流控上限，请降低 QPS；提升限额可申请工单。",
    codeN: 100018,
  },
  ServiceUnavailableTemp: {
    title: "服务暂时熔断",
    hint: "服务处于熔断/繁忙状态，请稍后重试；频繁出现请工单联系。",
    codeN: 100019,
  },
  InternalServiceError: {
    title: "内部服务异常（网关）",
    hint: "OpenAPI 网关或后端返回 502 类故障，请稍后重试；频繁出现请工单联系。",
    codeN: 100023,
  },
  InvalidAuthorization: {
    title: "Authorization 头格式错误",
    hint: "Authorization 构造不正确（如缺少 Region 等）。建议使用 SDK 或对照签名文档修正。",
    codeN: 100024,
  },
  InvalidCredential: {
    title: "Credential 格式错误",
    hint: "Authorization 中的 Credential 字段不合法。请检查 AK 是否在允许字符集内。",
    codeN: 100025,
  },
  InvalidSecretToken: {
    title: "STS 临时凭证无效",
    hint: "AssumeRole 临时凭证可能过期或签名错误。请重新获取 STS 并使用 SDK 签名。",
    codeN: 100026,
  },
};

/** 按 CodeN 查找（优先于歧义的字符串 Code） */
const CODE_N_MAP: Record<number, { title: string; hint: string; code: string }> = {};
for (const [key, v] of Object.entries(PLATFORM_CODE_MAP)) {
  CODE_N_MAP[v.codeN] = { title: v.title, hint: v.hint, code: key };
}

const HTTP_FALLBACK: Record<number, { title: string; hint: string }> = {
  400: {
    title: "请求无效",
    hint: "请对照方舟文档检查 JSON 字段；若响应 error.code 为 InputTextSensitiveContentDetected，实为文本审核未通过而非参数结构错误。",
  },
  401: { title: "鉴权失败", hint: "请检查 API Key 或 AK/SK、签名是否正确。" },
  403: { title: "禁止访问", hint: "可能是欠费、IAM 权限不足或资源无授权。" },
  404: { title: "资源不存在", hint: "请检查 Service、Action、接入点或任务 ID。" },
  429: { title: "请求过于频繁或额度不足", hint: "请稍后重试，或区分 OpenAPI 流控与方舟 RPM/TPM。" },
  500: { title: "服务端错误", hint: "请稍后重试。" },
  502: { title: "网关或服务异常", hint: "可能是 OpenAPI 502 或上游故障，请稍后重试。" },
  503: { title: "服务暂时不可用", hint: "请稍后重试。" },
  504: { title: "网关超时", hint: "内部链路超时，请稍后重试。" },
};

function normalizeApiMessage(raw?: string): string {
  if (!raw) return "";
  return raw.replace(/\s*Request ID:\s*[a-f0-9-]+\s*$/i, "").trim();
}

function presentAmbiguousStringCode(args: {
  code: string;
  httpStatus?: number;
  rawMessage?: string;
}): ArkUserFacingError | null {
  const { code, httpStatus, rawMessage } = args;
  const detail = normalizeApiMessage(rawMessage);

  // MissingParameter：两套文档都有，合并说明
  if (code === "MissingParameter") {
    const hint =
      "缺少必填参数：方舟 Bearer 调用请检查 body 字段；OpenAPI 签名调用请检查 Action、Version 等。" +
      "详见方舟推理错误码与火山引擎公共错误码文档。";
    return {
      title: "缺少必要参数",
      hint: detail ? `${hint}（详情：${detail.slice(0, 220)}）` : hint,
      code,
      docUrl: ARK_INFERENCE_ERROR_DOC_URL,
    };
  }

  // AccessDenied：IAM vs 方舟资源权限
  if (code === "AccessDenied") {
    const row = PLATFORM_CODE_MAP.AccessDenied;
    const hint = detail ? `${row.hint}（详情：${detail.slice(0, 220)}）` : row.hint;
    return {
      title: row.title,
      hint,
      code,
      codeN: row.codeN,
      docUrl: VOLC_ENGINE_PUBLIC_ERROR_DOC_URL,
    };
  }

  // InternalServiceError：方舟与 OpenAPI 共用字符串，按 HTTP 粗分文档
  if (code === "InternalServiceError") {
    const preferPlatform = httpStatus === 502;
    const title = preferPlatform ? "内部服务异常（网关）" : "服务端内部异常";
    const hint = preferPlatform
      ? `${PLATFORM_CODE_MAP.InternalServiceError.hint}${detail ? `（详情：${detail.slice(0, 220)}）` : ""}`
      : `${"方舟推理或上游服务异常，请稍后重试。"}${detail ? `（详情：${detail.slice(0, 220)}）` : ""}`;
    return {
      title,
      hint,
      code,
      codeN: preferPlatform ? PLATFORM_CODE_MAP.InternalServiceError.codeN : undefined,
      docUrl: preferPlatform ? VOLC_ENGINE_PUBLIC_ERROR_DOC_URL : ARK_INFERENCE_ERROR_DOC_URL,
    };
  }

  return null;
}

/**
 * 根据方舟 / 引擎返回的 code、CodeN、HTTP 状态生成用户可读文案
 */
export function presentArkInferenceError(args: {
  httpStatus?: number;
  code?: string;
  codeN?: number;
  rawMessage?: string;
}): ArkUserFacingError {
  const detailAll = normalizeApiMessage(args.rawMessage);

  if (args.codeN != null && Number.isFinite(args.codeN) && CODE_N_MAP[args.codeN]) {
    const row = CODE_N_MAP[args.codeN];
    const hint = detailAll ? `${row.hint}（详情：${detailAll.slice(0, 280)}）` : row.hint;
    return {
      title: row.title,
      hint,
      code: row.code,
      codeN: args.codeN,
      docUrl: VOLC_ENGINE_PUBLIC_ERROR_DOC_URL,
    };
  }

  const code = args.code?.trim();
  if (code) {
    const ambiguous = presentAmbiguousStringCode({
      code,
      httpStatus: args.httpStatus,
      rawMessage: args.rawMessage,
    });
    if (ambiguous) return ambiguous;

    if (PLATFORM_CODE_MAP[code]) {
      const row = PLATFORM_CODE_MAP[code];
      const hint = detailAll ? `${row.hint}（详情：${detailAll.slice(0, 280)}）` : row.hint;
      return {
        title: row.title,
        hint,
        code,
        codeN: row.codeN,
        docUrl: VOLC_ENGINE_PUBLIC_ERROR_DOC_URL,
      };
    }

    if (ARK_CODE_MAP[code]) {
      const m = ARK_CODE_MAP[code];
      const hint = detailAll ? `${m.hint}（详情：${detailAll.slice(0, 280)}）` : m.hint;
      return {
        title: m.title,
        hint,
        code,
        docUrl: ARK_INFERENCE_ERROR_DOC_URL,
      };
    }
  }

  const st = args.httpStatus ?? 0;
  if (st && HTTP_FALLBACK[st]) {
    const m = HTTP_FALLBACK[st];
    const hint = detailAll ? `${m.hint}（详情：${detailAll.slice(0, 280)}）` : m.hint;
    return {
      title: m.title,
      hint,
      code,
      docUrl: st === 502 || st === 504 ? VOLC_ENGINE_PUBLIC_ERROR_DOC_URL : ARK_INFERENCE_ERROR_DOC_URL,
    };
  }

  const detail = detailAll || "未知错误";
  return {
    title: "调用火山引擎接口失败",
    hint: detail.slice(0, 400),
    code,
    docUrl: ARK_INFERENCE_ERROR_DOC_URL,
  };
}
