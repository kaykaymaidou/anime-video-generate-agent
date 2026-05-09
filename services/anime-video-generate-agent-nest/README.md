# anime-video-generate-agent-nest

## 1. 定义

Nest 以 **面向对象的 Provider/Module + DI** 组织代码；跨模块协作优先 **接口（如 `IProgressBroadcaster`）+ 实现类** 以减少耦合。模式细节见 [docs/CODE_PATTERNS.md](./docs/CODE_PATTERNS.md)。

| 字段 | 值 |
|------|-----|
| 运行时 | NestJS（HTTP + Socket.io） |
| 上游视频 | 火山方舟 Seedance REST（`Volc*` 模块封装） |
| 静态输出 | `storage/exports/` → HTTP 前缀 `/exports/` |
| 编排 | Workflow 模块（Agent、拆镜、任务快照、用量账本）；可选 LangChain 流水线 |

## 2. 职责边界

- **承担**：任务创建与轮询、`composeSeedancePrompt` 与 `prompt-policy`、Socket `progress-update`、FFmpeg 拼接（`timeline-concat`）、`GET /api/usage/*`。
- **不承担**：浏览器路由、SPA 构建产物、Python 解释器内嵌推理（除非显式桥接 legacy）。

## 3. 模块拓扑（扩展入口）

| 区域 | 路径示例 | 扩展方式 |
|------|-----------|----------|
| HTTP 控制器 | `src/workflow/*.controller.ts`、`src/volc/*.controller.ts` | 新增路由 → 注册 `WorkflowModule` / `VolcModule` |
| 火山调用 | `src/volc/volc-ark*.ts`、`seedance-body.builder.ts` | 新模型字段：对齐官方 schema 后扩展 builder；勿在 `text` 内塞非文档参数 |
| Agent / 拆镜 | `src/workflow/refine-agent.ts`、`anime-agent.pipeline.service.ts` | 增加阶段：扩展 LangGraph 节点名与 `VOLC_AGENT_PIPELINE` 分支 |
| 实时 | `src/realtime/progress.gateway.ts` | 新事件：约定 payload 与前端 `socket-client` 过滤键 |
| 配置 | `src/app.module.ts`（`envFilePath`）、`.env.example` | 新密钥：向后兼容顺序加载 AI 包 `.env` |
| 环境探测 | `src/nest-env.loader.ts` | 支持自仓库根或包根启动；兼容旧 `package.json` name |

## 4. 可扩展性（系统级）

- **替换视频供应商**：在 `VolcModule` 侧新增 Adapter，保持任务快照结构与 Socket 契约不变；更新 SPEC 与集成测试。
- **队列化**：当前为进程内并行；引入 BullMQ 时 Worker 消费与 `AgentService` 创建路径对齐，持久化 `taskId` → 前端过滤键不变。
- **存储**：成片默认本地静态目录；替换为 OSS 时在拼接服务返回绝对 URL（`PUBLIC_HTTP_BASE`）或签名 URL。
- **账本**：内存 ledger；扩展为 DB 时在 `usage-ledger.service.ts` 置换实现，保持 `/api/usage/*` 响应形状。

## 5. 命令

| 命令 | 行为 |
|------|------|
| `pnpm dev` / `nest start --watch` | 开发 |
| `pnpm build` | `nest build` → `dist/` |
| `pnpm start` | `node dist/main.js` |

## 6. 契约文档

| 文档 | 内容 |
|------|------|
| [SPEC-001](../../docs/sdd/specs/SPEC-001-nest-vite-volc-http.md) | 默认栈、代理、端口 |
| [SPEC-003](../../docs/sdd/specs/SPEC-003-volc-agent-models.md) | 模型与 Agent |
| [SPEC-004](../../docs/sdd/specs/SPEC-004-timeline-usage-exports.md) | 拼接、用量、`/exports` |

环境与端口见仓库根 [README.md](../../README.md)。
