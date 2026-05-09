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


## 6. 上游文档

- 仓库总览与环境：[../../README.md](../../README.md)
- SDD 索引：[../../docs/sdd/INDEX.md](../../docs/sdd/INDEX.md)
- 默认栈契约：[../../docs/sdd/specs/SPEC-001-nest-vite-volc-http.md](../../docs/sdd/specs/SPEC-001-nest-vite-volc-http.md)