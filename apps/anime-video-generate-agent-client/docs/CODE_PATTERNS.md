# Client — 代码模式说明

面向后续维护者：本包刻意使用的结构与模式，避免「到处散落却无命名」。

## 1. 分层

| 层 | 目录 | 职责 |
|----|------|------|
| 页面编排 | `src/pages/` | 组合 features、连接路由 |
| 功能块 | `src/components/features/` | 单一业务域 UI |
| 服务端状态 | TanStack Query | `src/api/`、`src/hooks/use*Queries.ts` |
| 客户端会话状态 | Zustand | `src/store/` |
| 传输 | `src/lib/api-client.ts`、`src/lib/socket-client.ts` | HTTP / WS，不含业务句子 |

## 2. Socket：引用计数 + 状态机 + Observer

- **Singleton + 引用计数**：`acquireSocketClient()` / `release()`，多 `useEffect` 共享一条连接。
- **连接状态机**：纯函数 `transitionSocketPhase`（`socket-connection.machine.ts`），引擎事件在 `socket-client.ts` 内驱动；调试可读 `getSocketConnectionPhase()`。
- **Observer**：页面注册 `progress-update`；处理器内用 **store 快照**（`getState()`）读最新 `taskId`，避免闭包陈旧。
- **竞态**：`useTaskProgress(taskId)` 用 **代数 generation** 丢弃过期 effect 的回调；并按 payload.`taskId` 过滤。
- **生成批次 ingress**：`useTaskStore.progressIngressGeneration` 在 `beginShotGeneration` / `abortShotGeneration` / 整批 `resolveShotGeneration` 完成时递增；`Editor` 对全局进度监听使用 `shouldAcceptAgentProgressEvent`（`socket-progress-guards.ts`）：
  - **idle**：丢弃一切带 `taskId` 的包（迟到 `result`/`error`）
  - **active**：丢弃 `taskId !== activeProgressTaskId` 的串台包

禁止长期持有 `createSocketClient()`（已 `@deprecated`）：其会增加 refCount 且不释放。

## 3. HTTP：Facade

`api-client` / `src/api/*.ts` 对外部 REST 做薄封装；页面不直接拼 `fetch` URL，便于 mock 与契约变更。

## 4. 与 Nest 的边界

业务规则、鉴权、队列、FFmpeg **不得**出现在 client；此处仅有展示与乐观 UI。
