# anime-video-generate-agent-client

## 1. 定义


| 字段   | 值                                                                       |
| ---- | ----------------------------------------------------------------------- |
| 运行时  | 浏览器 SPA（React 19 + Vite）                                                |
| 对外后端 | `services/anime-video-generate-agent-nest`（HTTP、`/exports`、Socket.io）   |
| 开发代理 | `vite.config.ts`：将 `/api`、`/exports`、Socket 路径转发至 `VITE_GATEWAY_ORIGIN` |


本包不承担业务编排与密钥存储；状态同步依赖 Nest 返回体与 Socket 事件。

## 2. 职责边界

- **摄入**：用户输入剧本、分镜编辑、参考图与模板选择。
- **透出**：任务进度（按 `taskId` / `activeProgressTaskId` 过滤）、用量轮询（TanStack Query）、成片预览 URL。
- **排除**：视频模型直连、队列、账本持久化、FFmpeg 执行（均由 Nest 承担）。

## 3. 可扩展性


| 扩展方向        | 挂载点                                                                                |
| ----------- | ---------------------------------------------------------------------------------- |
| 新页面 / 工作流步骤 | `src/pages/`、`src/App.tsx` 路由表                                                     |
| 新后端契约       | `src/lib/api-client.ts`、`src/api/`、`vite.config.ts` 代理规则                           |
| 客户端状态       | Zustand：`src/store/`；持久化键前缀 `anime-video-generate-agent-`*                         |
| 本地缓存策略      | TanStack Query：`src/lib/query-client.ts`、各 `use*Queries` / `use*Mutations`         |
| UI 组件库      | `src/components/ui/`（shadcn 风格）；业务块置于 `components/features/`                       |
| E2E         | `tests/e2e/`（Playwright）；可对新路由追加 `data-testid` 与 spec                              |
| 时间线互操作      | `src/lib/export-timeline.ts`、`import-anime-timeline.ts`：新增字段须与 Nest `Shot` 契约并行版本化 |


替换网关 origin（多环境、隧道）仅依赖环境变量，无需改打包产物路径。

代码模式（Socket 状态机、引用计数、Facade）：[docs/CODE_PATTERNS.md](./docs/CODE_PATTERNS.md)。

## 4. 命令


| 命令              | 行为                                     |
| --------------- | -------------------------------------- |
| `pnpm dev`      | Vite dev；建议从仓库根执行 `pnpm dev` 与 Nest 对齐 |
| `pnpm build`    | `tsc -b` + `vite build`                |
| `pnpm test`     | Vitest                                 |
| `pnpm test:e2e` | Playwright                             |


## 5. 配置


| 变量                    | 用途                                                   |
| --------------------- | ---------------------------------------------------- |
| `VITE_GATEWAY_ORIGIN` | Nest 基地址（与 `NEST_PORT` 一致），例 `http://127.0.0.1:4010` |


## 6. 为何默认 Vite，而非 Next.js

| 维度 | Vite + React（当前） | Next.js App Router |
|------|----------------------|---------------------|
| 产物形态 | 纯 SPA，全部交互在浏览器 | RSC/SSR/路由一体化，默认多一层服务端渲染决策 |
| 与本仓库后端关系 | 静态资源 + `VITE_GATEWAY_ORIGIN`；**唯一业务后端为 Nest** | 容易在 Route Handler 再写一层 BFF，与「Nest 唯一编排」冲突 |
| 长连接 / 编辑器 | HMR 轻、代理配置短；时间轴类页面多为 Client | 可行但构建与边界约束更重 |
| SEO | 弱（后台工具无需默认 SEO） | 强（落地页、文档站） |

**结论**：当前产品是 **重客户端编辑器 + Socket 进度**，默认选 Vite 可降低宿主复杂度；不是「Next 不适合」，而是 **默认栈要避免双 BFF**。

### 何时值得迁到 Next（或增量接入）

- 需要 **SSR/SEO** 的对外站点与同仓共存（例如营销页、文档）。
- 团队规范 **全栈必须 Next**，但仍坚持：**页面可以 Next，HTTP/WebSocket 业务仍只打 Nest**（Next 不写生成类 `/api`，或仅转发）。
- 若要将编辑器迁入 Next：视为 **单独里程碑**——路由拆分、`socket-client` 单例生命周期与 SSR 边界需重做；**未在本迭代默认迁移**，以避免大规模回滚风险。

## 7. 上游文档

- 仓库总览与环境：[../../README.md](../../README.md)
- SDD 索引：[../../docs/sdd/INDEX.md](../../docs/sdd/INDEX.md)
- 默认栈契约：[../../docs/sdd/specs/SPEC-001-nest-vite-volc-http.md](../../docs/sdd/specs/SPEC-001-nest-vite-volc-http.md)