# anime-video-generate-agent-server

## 1. 定义


| 字段   | 值                                                      |
| ---- | ------------------------------------------------------ |
| 运行时  | Node（Next.js App Router + 自定义 `server.ts` Socket 宿主）   |
| 激活条件 | 仅当仓库根执行 `pnpm dev -- --legacy` 时由 `scripts/dev.mjs` 拉起 |
| 默认栈  | **未启用**：正常开发路径为 Nest + Vite，不经本包                       |


## 2. 职责边界

- 过渡期 **BFF / Socket**：部分 `/api` 与浏览器长连接（若仍路由至此）。
- **排除**：新特性默认不得在本包实现；契约变更须落在 `docs/sdd/specs/` 并由 Nest 或客户端承接。

## 3. 可扩展性


| 扩展方向              | 约束                                                                               |
| ----------------- | -------------------------------------------------------------------------------- |
| 保留 legacy 路由      | 修改须标注 DEPRECATED，并在 SPEC 中写明下线条件与 Nest 等价路径                                      |
| Python 子进程桥       | `src/lib/python-bridge.ts`：仓库根下 AI 包路径为 `services/anime-video-generate-agent-ai` |
| Agent / Prompt 策略 | `src/lib/agent/`：与 Nest `workflow`、`volc` 模块语义冲突时以 Nest 为准                       |
| 切换生成后端            | `VIDEO_TASK_BACKEND` 等环境变量（legacy 语义）；默认栈已直连 Nest                                |


将 Next 收缩为「静态站点 + OAuth 回调」时：删除业务 `/api`，保留单一上游 `VITE_GATEWAY_ORIGIN` 指向 Nest，本包可降级为边缘路由层。

## 4. 命令

以本目录 `package.json` 的 `scripts` 为准；日常不从本目录单独启动全栈。

## 5. 上游文档

- [SPEC-001](../../docs/sdd/specs/SPEC-001-nest-vite-volc-http.md)
- [SPEC-002](../../docs/sdd/specs/SPEC-002-token-budget.md)（legacy `/api/agent` 侧）

