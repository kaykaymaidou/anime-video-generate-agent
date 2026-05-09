# SPEC-003：方舟模型 Endpoint 与 Nest LangChain Agent

**状态**：active  
**范围**：`services/anime-video-generate-agent-nest`（`/api/agent`、火山 HTTP、`prompt-policy`、`refine-agent`）

## 对话 API

- 文档：<https://www.volcengine.com/docs/82379/1494384>
- 降级链（环境变量）：`VOLC_CHAT_MODEL_PRO` → `VOLC_CHAT_MODEL_LITE` → `VOLC_CHAT_MODEL_MINI`
- 触发降级：HTTP 429/503/402 或响应文案含 quota/limit/额度/限流等（实现见 `VolcChatService`）

## Seedance 视频

- 主：`VOLC_SEEDANCE_PRO_MODEL`（1.5 Pro）
- 备：`VOLC_SEEDANCE_FALLBACK_MODEL`（如 1.0 Pro Endpoint）
- 降级触发：与对话类似的额度/限流判定（`VolcArkService.createFromWorkerPayload`）

## 图片生成

- 文档：<https://www.volcengine.com/docs/82379/1541523>
- Endpoint：`VOLC_IMAGE_MODEL_SEEDREAM`；具体路径见 `VOLC_IMAGE_GENERATIONS_PATH`（默认占位）

## 分词

- 文档：<https://www.volcengine.com/docs/82379/1528728>
- `POST {VOLC_ARK_BASE_URL}/tokenization`（`VolcTokenizationService`）

## 平台动漫锁定与 Prompt 合成

- **`prompt-policy`**：`composeSeedancePrompt` 在每条进入 Seedance 的 prompt 末尾追加 **「平台动漫锁定」**（二维/三渲二动漫介质，排除真人实拍表述）；并与 **`consistencyNotes`**、**`knowledgeContext`**（及环境变量 **`AUTO_DRAMA_KB_SNIPPET`** 合并层）分层拼接后再 `clamp`。
- **`refine-agent`**（及 legacy Next 侧同源逻辑）：请求体支持 `consistencyNotes`、`knowledgeContext`；无 shots 时由剧本段落生成动漫向基底 prompt。

## 剧本辅助 API（仅文本 / 分镜预览，不提交视频）

- `POST /api/agent/script-review`：Body `{ script }` → 对话模型 JSON：`summary`、`missing_visual_elements`、`suggestions`、`format_notes`（顾问提示约束为 **动漫成片**，非真人实拍）。
- `POST /api/agent/storyboard-preview`：Body `{ script, knowledgeContext? }` → LangChain 流水线返回 `{ shots }`（需 **`VOLC_AGENT_PIPELINE`** 开启）。`knowledgeContext` 与 **`AUTO_DRAMA_KB_SNIPPET`** 合并后作为导演阶段上下文注入。

## LangChain

- 依赖：`@langchain/core` RunnableSequence（导演 → 分镜 → 质检）
- 开关：`VOLC_AGENT_PIPELINE=on|off`，或 `VOLC_AGENT_PIPELINE_DISABLE=1`
- RAG：`AGENT_RAG_CONTEXT_SNIPPET`（配置默认片段）；请求体 **`knowledgeContext`**（拆镜预览 / 提交生成均可扩展；预览已实现）

## 推理错误码与用户提示

- 方舟推理错误码：<https://www.volcengine.com/docs/82379/1299023?lang=zh>
- 火山引擎 **OpenAPI 公共错误码**（签名 / AK-SK / 流控等）：<https://www.volcengine.com/docs/6369/68677?lang=zh>（含 `CodeN` 如 100010）
- Nest：`parseVolcErrorBody` 同时识别 OpenAI 风格 `error` 与 `ResponseMetadata.Error`；`presentArkInferenceError` 按 **CodeN 优先**、再按字符串 **Code** 映射；`doc_url` 按错误类型指向方舟文档或引擎公共错误码文档。Socket / REST 附带 `ark_code`、`volc_code_n`、`doc_url`。
- 前端：`Editor` 展示标题、建议、字符串错误码、**CodeN** 与文档链接；统一 HTTP 客户端解析错误体。

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05 | 接入用户提供的 Endpoint ID 默认值写入 `.env.example` |
| 2026-05 | 剧本辅助 API、`knowledgeContext`、动漫锁定与 prompt-policy |
