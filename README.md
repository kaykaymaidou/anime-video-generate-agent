# anime-video-generate-agent

| 字段 | 值 |
|------|-----|
| 仓库 npm `name` | `anime-video-generate-agent`（private） |
| 包路径 | `apps/anime-video-generate-agent-*`、`services/anime-video-generate-agent-*` |
| 默认栈 | Nest（BFF） + Vite（SPA）；不经 Next、不经 Python |

---

## 规范来源（SDD）

| 资源 | 路径 |
|------|------|
| 流程 | [docs/sdd/README.md](./docs/sdd/README.md) |
| 索引 | [docs/sdd/INDEX.md](./docs/sdd/INDEX.md) |
| 包边界 | [docs/sdd/packages.md](./docs/sdd/packages.md) |

实现与 **SPEC/ADR** 冲突时，以文档为准并回溯修订 README 快照段落。

---

## 拓扑与数据流

```text
Browser (Vite SPA)
  → 代理 /api、/exports、Socket.io → Nest :4010
       → 方舟 Seedance HTTP（创建/查询/删除任务）
       → FFmpeg（可选拼接）→ storage/exports → /exports/
       → Socket progress-update（taskId 维度）
```

| 组件 | 路径 | 职能摘要 |
|------|------|----------|
| 前端 | `apps/anime-video-generate-agent-client` | UI、Query、Zustand、时间线导入导出 |
| BFF | `services/anime-video-generate-agent-nest` | HTTP、WS、Workflow、用量账本、静态成片 |
| Python | `services/anime-video-generate-agent-ai` | 可选；`pnpm dev -- --legacy` |
| Next | `apps/anime-video-generate-agent-server` | Legacy 网关；新功能默认不写此处 |

---

## 可扩展性（仓库级）

| 轴 | 扩展方式 | 约束 |
|----|----------|------|
| 视频上游 | 在 Nest `VolcModule` 增加适配层 | 保持任务快照字段与 Socket 载荷可映射 |
| 任务队列 | BullMQ/Redis Worker | ADR 先行；`taskId` 与前端过滤语义不变 |
| 持久化 | 账本/任务落库 | 替换 `usage-ledger` 等内存实现；HTTP 契约稳定 |
| 前端宿主 | Next 仅托管路由或官网 | API/WS 仍指向 Nest；禁止业务逻辑分叉 |
| Agent 图 | LangChain / 自建阶段机 | 节点与 `VOLC_AGENT_PIPELINE` 开关对齐 SPEC-003 |
| 合规与密钥 | env 与 ConfigModule | 新变量写入 `.env.example` + SPEC |

---

## 默认开发

```bash
pnpm install
pnpm dev
```

| 进程 | 默认地址 | 变量 |
|------|-----------|------|
| Nest | `http://127.0.0.1:4010` | `NEST_PORT` |
| Vite | `http://localhost:5173` 起 | `VITE_GATEWAY_ORIGIN` → Nest |

Legacy（Python + Next + Vite）：

```bash
pnpm dev -- --legacy
```

修饰符：`--skip-py`、`--skip-gateway`、`--fake`（语义见 `scripts/dev.mjs`）。

---

## Nest 主要 HTTP 面（默认栈）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/agent`、`/api/workflow/agent` | 编排提交；进度走 Socket |
| POST | `/api/agent/script-review` | 剧本顾问（文本 JSON） |
| POST | `/api/agent/storyboard-preview` | LangChain 拆镜；需 `VOLC_AGENT_PIPELINE` |
| POST | `/api/timeline/concat` | FFmpeg 拼接；`transition`: `none` \| `fade` |
| GET | `/api/usage/summary`、`/api/usage/ledger` | 用量聚合 |

详情与字段：[SPEC-003](./docs/sdd/specs/SPEC-003-volc-agent-models.md)、[SPEC-004](./docs/sdd/specs/SPEC-004-timeline-usage-exports.md)。

---

## 环境变量（常用）

| 变量 | 角色 |
|------|------|
| `SEEDANCE_API_KEY`、`VOLC_SEEDANCE_PRO_MODEL`、`VOLC_ARK_BASE_URL` | 方舟调用 |
| `VOLC_AGENT_PIPELINE` | LangChain 拆镜：`off` 关闭 |
| `AUTO_DRAMA_KB_SNIPPET` | 与请求 `knowledgeContext` 合并注入 Seedance 侧 |
| `AGENT_RAG_CONTEXT_SNIPPET` | 导演阶段可选静态片段 |
| `PUBLIC_HTTP_BASE` | 成片绝对 URL 前缀（可选） |
| `FFMPEG_PATH`、`FFPROBE_PATH` | 拼接与探测 |
| `TIMELINE_CONCAT_MAX_CLIPS`、`TIMELINE_FADE_MAX_CLIPS` | 拼接上限 |

Nest 读取 `services/anime-video-generate-agent-nest/.env`，并回退 `services/anime-video-generate-agent-ai/.env`（若存在）。

---

## 方舟 Seedance HTTP（最小创建示例）

与 [方舟 OpenAPI](https://www.volcengine.com/docs/82379/1521309) 一致；`model` 为控制台 Endpoint ID。

```bash
export ARK_BASE="${VOLC_ARK_BASE_URL:-https://ark.cn-beijing.volces.com/api/v3}"
export ARK_KEY="${SEEDANCE_API_KEY}"
export EP_ID="${VOLC_SEEDANCE_PRO_MODEL}"

curl -sS "${ARK_BASE}/contents/generations/tasks" \
  -H "Authorization: Bearer ${ARK_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"${EP_ID}\",\"content\":[{\"type\":\"text\",\"text\":\"…\"}],\"resolution\":\"720p\",\"ratio\":\"16:9\",\"duration\":5}"
```

查询：`GET ${ARK_BASE}/contents/generations/tasks/{task_id}`。删除：官方文档取消任务接口。

---

## 能力边界快照

### 已实现（工程）

- Seedance 单栈；`prompt-policy` / `composeSeedancePrompt` 动漫介质锁定与画风预设。
- 分镜预览与生成共用提示词封装；可选跨镜摘要；角色库与镜头模板（前端）。
- Socket 按任务过滤；时间线 JSON 导入导出；`POST /api/timeline/concat`（含可选 `fade`）。
- 用量：`usage.cost` 聚合至控制台轮询接口。

### 明确不在当前范围

| 项 | 说明 |
|----|------|
| 多厂商视频 API | 非 Seedance 路由未接入 |
| BullMQ 默认启用 | 进程内并行；队列为路线图 |
| 全自动配音/字幕成片 | 合成轨无内建音字画桌 |
| 视觉一致性自动质检 Agent | 依赖提示词、参考图与人工 |

完整条目以各 SPEC 为准。

---

## 测试

```bash
pnpm test
pnpm test:py
```

Python 单包：

```bash
cd services/anime-video-generate-agent-ai
pip install -r requirements.txt
pytest
```

---

## 分包 README

| 包 | 文档 |
|----|------|
| Client | [apps/anime-video-generate-agent-client/README.md](./apps/anime-video-generate-agent-client/README.md) |
| Nest | [services/anime-video-generate-agent-nest/README.md](./services/anime-video-generate-agent-nest/README.md) |
| AI | [services/anime-video-generate-agent-ai/README.md](./services/anime-video-generate-agent-ai/README.md) |
| Server (legacy) | [apps/anime-video-generate-agent-server/README.md](./apps/anime-video-generate-agent-server/README.md) |
