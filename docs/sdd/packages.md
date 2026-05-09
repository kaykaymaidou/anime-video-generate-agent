# Monorepo 包职责（SDD Owner）

用于规格文档里写「本变更影响哪些包」时的参照。

| 路径 | 角色 | 典型 Spec 归属 |
|------|------|----------------|
| `services/anime-video-generate-agent-nest` | 默认 BFF：HTTP、Socket.io、Workflow、火山 Ark HTTP、**FFmpeg 拼接**、**用量账本**、`/exports` 静态 | SPEC-001 / SPEC-003 / SPEC-004 |
| `apps/anime-video-generate-agent-client` | React + Vite：工作区（剧本/分镜/生成）、控制台与成本页（`/api/usage` 轮询）、TanStack Query | SPEC-001 / SPEC-004 |
| `services/anime-video-generate-agent-ai` | Python：FastAPI 网关、`seedance_client_sdk`；**`pnpm dev -- --legacy`** | Python HTTP / stdin 契约、与 Nest 切换边界 |
| `apps/anime-video-generate-agent-server` | Legacy：Next + Socket（`pnpm dev -- --legacy`） | 仅 legacy；新功能默认不写此处 |

## 契约优先级（默认栈）

1. Nest 暴露（节选）：  
   - `POST /api/agent`、`POST /api/workflow/agent`  
   - `POST /api/agent/script-review`、`POST /api/agent/storyboard-preview`  
   - `POST /api/timeline/concat`  
   - `GET /api/usage/summary`、`GET /api/usage/ledger`  
   - `GET /health`；可选 `POST/GET/DELETE /api/v1/tasks`（与旧网关对齐）  
   - 静态：`GET /exports/*`（成片文件）
2. 前端经 Vite 代理 **`/api/*`** 与 **`/exports/*`**，Socket 直连 **`VITE_GATEWAY_ORIGIN`**（与 Nest 实际端口一致）。

切换 Python 为火山唯一入口时，须在 **新 SPEC + ADR** 中重写上表并废弃冲突段落。
