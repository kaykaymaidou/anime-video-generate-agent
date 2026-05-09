# SPEC-002：Ark 文本拆镜 Token 预算

**状态**：active  
**范围**：`apps/anime-video-generate-agent-server`（legacy `/api/agent`）、`ARK_*` 环境变量；**Nest** 侧 LangChain 拆镜的镜头数与剧本长度上限见 `services/anime-video-generate-agent-nest/src/volc/storyboard-schema.ts`（`getStoryboardShotBounds()`），与本 SPEC 策略同类但变量名以 Nest 代码为准。

## 背景

结构化拆镜（`json_schema` + 大模型）单次请求包含：系统提示、完整剧本、`response_format` 中的 Schema、以及多镜头 JSON 输出。**默认若要求 12–20 镜**，开发与反复调试会在极短时间内耗尽文本模型 token。

## 策略

1. **默认降低镜头上限**（仍可通过环境变量调高）。
2. **剧本截断**：超长剧本只送前 N 字符，避免上下文线性膨胀。
3. **可选跳过 Ark**：本地 `refine` 拆镜路径零文本 token（质量略降，适合联调视频链路）。
4. **模型自选**：用 `ARK_STORYBOARD_MODEL` 选用更小/更便宜机型（质量与成本权衡）。

视频生成（Seedance）计费通常与文本模型分开；本 SPEC 针对 **chat/completions 类 token**。

## 环境变量（legacy agent）

| 变量 | 默认 | 说明 |
|------|------|------|
| `ARK_STORYBOARD_SKIP` | 未设 | 设为 `1`/`true`/`yes`：不调用 Ark，直接走 `refineAgentRequest` |
| `ARK_STORYBOARD_MIN_SHOTS` | `3` | Schema `minItems` |
| `ARK_STORYBOARD_MAX_SHOTS` | `10` | Schema `maxItems` 与用户提示中的上限 |
| `ARK_STORYBOARD_MAX_SCRIPT_CHARS` | `12000` | 剧本最大送入字符数，超出截断 |
| `ARK_STORYBOARD_MODEL` | （代码内默认） | 覆盖默认文本模型 Endpoint |

## 验收

- [ ] 不设任何变量时，单次拆镜请求的镜头数不超过 `ARK_STORYBOARD_MAX_SHOTS` 默认。
- [ ] `ARK_STORYBOARD_SKIP=1` 时不发起 Ark `createChatCompletion`。
- [ ] 超长剧本被截断后仍能返回合法结构化结果或进入 refine 降级路径。

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05 | 初稿与实现对齐 |
| 2026-05 | 注明 Nest `storyboard-schema` 边界与本 SPEC 的对应关系 |
