# Auto-Drama 工业级 AI 短剧生成平台

Monorepo（pnpm workspace）结构：

- `auto-drama-server/`：Node.js（ESM）+ Express + Socket.io + TypeScript（业务编排与网关）
- `auto-drama-client/`：React 18 + Vite + TypeScript（可视化分镜编辑器、成本仪表盘）
- `auto-drama-ai/`：Python（豆包 Ark + Seedance 视频生成封装与测试）

## 具体实现格式（协议与约定）

### 架构职责

- **前端（`auto-drama-client/`）**：分镜（Storyboard）编辑、提交生成、实时展示进度/日志/成本、预览视频。
- **业务后端（`auto-drama-server/`）**：API 网关 + 任务编排；通过 Socket.io 向前端推送实时事件；通过子进程桥接 Python AI 服务。
- **AI 服务（`auto-drama-ai/`）**：封装 Seedance（2.0/2.0 Fast）调用与轮询；按标准化事件流输出进度/成本/结果。

### Node ↔ Python：stdin/stdout JSON 事件流（JSONL）

- **输入**：Node 通过 `stdin` 向 `auto-drama-ai/src/main.py` 写入 1 个 JSON（任务描述）。
- **输出**：Python 通过 `stdout` 按行输出 JSON（JSONL），Node 逐行解析并转发到 Socket.io。

事件格式约定（示例）：

```json
{"event":"pipeline-init","taskId":"t_123","shots":[{"id":"s1","order":1,"prompt":"...","modelType":"seedance2"}]}
{"event":"shot-progress","taskId":"t_123","shotId":"s1","progress":35,"message":"polling"}
{"event":"cost-update","taskId":"t_123","amount":2.5,"currency":"CNY","provider":"seedance2"}
{"event":"shot-result","taskId":"t_123","shotId":"s1","videoUrl":"https://..."}
{"event":"task-complete","taskId":"t_123","status":"succeeded"}
{"event":"error","taskId":"t_123","code":"SEEDANCE_FAILED","message":"..."}
```

> 说明：以上是**对外稳定协议**；内部实现可演进，但事件名/字段尽量保持向后兼容。

### 前端 ↔ 后端：API 与 Socket 事件

- **HTTP API（示例）**
  - `POST /api/storyboard/submit`：提交故事板镜头数组开始生成（每个镜头包含 `id/prompt/referenceImage/lastFrame/modelType` 等）。
  - `POST /api/tasks`：提交任务（兼容旧任务入口，具体以 `auto-drama-server/src/routes` 为准）。
- **Socket 事件（示例）**
  - `pipeline-init`：任务初始化（含镜头列表、脚本分析/合规扫描结果等）
  - `shot-progress`：单镜头进度/日志
  - `shot-result`：单镜头生成结果（`videoUrl`）
  - `cost-update`：成本流水（用于前端成本仪表盘入账）
  - `task-complete`：任务完成
  - `error`：错误事件

### 环境变量（常用）

- **通用**
  - `PYTHON_BIN`：Python 可执行文件路径（Windows 可显式配置）
- **Seedance**
  - `SEEDANCE_API_KEY`
  - `VOLC_ARK_BASE_URL`（如使用豆包 Ark 进行剧本/提示词优化）
  - `VOLC_VIDEO_CREATE_PATH` / `VOLC_VIDEO_GET_PATH` / `VOLC_VIDEO_CANCEL_PATH`
  - `VOLC_SEEDANCE_2_MODEL` / `VOLC_SEEDANCE_2_FAST_MODEL`

## 本地启动

安装依赖：

```bash
pnpm -C jimeng-drama-studio install
```

开发模式（前后端并行）：

```bash
pnpm -C jimeng-drama-studio dev
```

默认端口：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3001`

## 测试

在仓库根目录执行（会递归跑三个 workspace 的测试）：

```bash
pnpm -C jimeng-drama-studio test
```

