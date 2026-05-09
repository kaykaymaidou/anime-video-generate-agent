# SPEC-001：默认栈 Nest + Vite，火山 Ark HTTP

**状态**：active  
**范围**：`services/anime-video-generate-agent-nest`、`apps/anime-video-generate-agent-client`、`scripts/dev.mjs`

## 背景

降低链路层级：前端不经过 Next BFF；由 Nest 直呼方舟 REST（与 cURL 同源）。

## 需求

1. 根目录 **`pnpm dev`**（`scripts/dev.mjs`）默认仅启动 Nest（`NEST_PORT`）与 Vite；不经 Python、不经 Next。
2. Nest 使用 `SEEDANCE_API_KEY`、`VOLC_SEEDANCE_PRO_MODEL`、`VOLC_ARK_BASE_URL` 调用：
   - `POST /contents/generations/tasks`
   - `GET /contents/generations/tasks/{id}`
   - `DELETE /contents/generations/tasks/{id}`
3. 视频模型产品线：**Seedance 1.5 Pro**（`modelType` 校验 `seedance1.5pro`；实际 `model` 字段为 Endpoint ID）。
4. 前端：
   - `POST /api/agent` 提交生成任务；
   - Socket.io 接收 `progress-update`（含 `pipeline-init`、`task_snapshot`、`result`、`error` 等）；
   - **任务隔离**：事件应带 `taskId`；客户端仅处理与当前提交一致的 `taskId`，避免并行/重连串台（实现见工作区 store）。
5. Vite 开发：
   - **`/api`** 代理至 `VITE_GATEWAY_ORIGIN`（须与 Nest 监听地址一致，常见 `http://127.0.0.1:4010`）；
   - **`/exports`** 代理至同一 origin，用于播放 **FFmpeg 合成成片**（见 SPEC-004）。
6. Nest 静态资源：`/exports/` 挂载本地 `storage/exports/`（成片 MP4）。

## 验收标准

- [ ] 配置有效密钥时，`POST /api/agent` 可触发创建任务并收到 Socket 进度直至 `result` 或明确 `error`。
- [ ] `GET http://127.0.0.1:<NEST_PORT>/health` 返回 200。
- [ ] 开发环境下，浏览器可通过 **同源** `/api/*`、`/exports/*` 访问 Nest（经 Vite 代理）。
- [ ] `pnpm dev -- --legacy` 仍可启动旧栈（Python + Next + Vite），行为由 legacy 文档描述（可与本 SPEC 并行维护直至下线）。

## 非目标（本 SPEC 不包含）

- BullMQ/Redis 持久化队列（后续 SPEC）。
- Python 重新作为唯一火山网关（需新 ADR）。

## 关联规范

- **SPEC-004**：`/api/timeline/concat`、用量 API、`/exports` 细节。

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05 | 初稿，对齐当前实现 |
| 2026-05 | 补充 `/exports` 代理、`taskId` 过滤、SPEC-004 关联 |
