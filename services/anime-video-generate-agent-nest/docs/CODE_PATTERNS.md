# Nest — 代码模式说明

Nest 默认 **面向对象 + 依赖注入**；本服务在此基础上固定下列模式，降低模块间随意引用。

## 1. 模块化（Modularity）

| 模块 | 职责 |
|------|------|
| `VolcModule` | 方舟 HTTP、对话、图片等供应商适配 |
| `WorkflowModule` | Agent、拆镜、剧本顾问、时间线、用量 |
| `RealtimeModule` | Socket.io 网关 |

新增横切能力时优先 **新建 Module** 或 **扩展现有 Module 的 provider**，避免在 `main.ts` 堆逻辑。

## 2. 依赖倒置（DIP）

- **`IProgressBroadcaster`**：`workflow` 中需要推送进度时 **只依赖接口**，实现类为 `ProgressGateway`。便于单元测试注入 Fake、或日后改为消息队列扇出。
- **火山调用**：业务服务依赖 `VolcArkService` 等 **封装类**，不直接在各处 `fetch`，便于替换 SDK/HTTP 实现。

## 3. 策略式组合（Strategy-like）

- **`prompt-policy.ts`**：`composeSeedancePrompt`、知识层合并——不同「画风 / 介质」分支集中在策略函数内，而非散落在 Controller。
- **流水线分支**：`VOLC_AGENT_PIPELINE` 等开关决定 LangChain 路径；新增供应商时在 pipeline 层扩展，而非复制 Controller。

## 4. Gateway = 传输适配器

`ProgressGateway` 仅负责 **Socket.io 房间与广播**；任务状态机主体在 `AgentService` / `AnimeAgentPipelineService`。传输层不包含业务不变式。

## 5. 扩展顺序建议

1. 改 `docs/sdd/specs/` 契约  
2. 扩展 Volc 或 Workflow provider  
3. 最后改 Gateway 事件形状（保持 `taskId` 维度稳定）
