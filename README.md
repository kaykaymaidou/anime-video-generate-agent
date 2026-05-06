# Auto-Drama Monorepo

pnpm workspace：前端与网关为 TypeScript；视频推理为 Python（火山方舟 Seedance Ark SDK）。

## 目录结构

- `apps/auto-drama-client`：React + Vite（文生视频工作区、分镜与成本页）
- `apps/auto-drama-server`：Next.js App Router + **自定义 Node 入口**（`server.ts`）承载 Socket.io；HTTP `/api/*` 路由委托 Next Route Handlers
- `services/auto-drama-ai`：Python（`main.py` stdin JSON → stdout JSONL；`seedance_client_sdk.py` 调用 Ark）

## Node ↔ Python

Node 子进程执行 `services/auto-drama-ai/src/main.py`，stdin 写入单个任务 JSON；stdout 每行一条 JSON，网关通过 Socket.io 频道 `progress-update` 转发给浏览器。

## 环境变量

复制 `services/auto-drama-ai/.env.example` 为 `services/auto-drama-ai/.env`，填入 `SEEDANCE_API_KEY` 与各模型 **Endpoint ID**（`VOLC_SEEDANCE_PRO_MODEL` / `FAST` / `LITE`）。

网关侧可选：`PORT`（默认 3999）、`CLIENT_ORIGIN`（默认 `http://localhost:5173`，逗号分隔多来源）、`PYTHON_BIN`。

## 本地开发

在仓库根目录：

```bash
pnpm install
pnpm dev
```

`pnpm dev` 会：
- 自动创建/复用 `services/auto-drama-ai/.venv`
- 安装 `services/auto-drama-ai/requirements.txt`
- 并行启动（默认同一个终端里三个子进程）：
  - `services/auto-drama-ai` **Python HTTP 网关**（FastAPI + Uvicorn，`/v1/tasks` 创建/查询；默认 `http://127.0.0.1:8799`，占用时自动换端口，并设置 `PY_GATEWAY_URL` 给 Next）
  - `apps/auto-drama-server`（Next + Socket.io）
  - `apps/auto-drama-client`（Vite）
- 使用 `pnpm dev -- --skip-py` 则跳过 venv/依赖与 Python 网关；`pnpm dev -- --skip-gateway` 只不启网关（Next 走 stdin 子进程调 Python）；`pnpm dev -- --fake` 为本地假数据模式，不启网关。

默认端口：

- 前端：Vite 可能为 `http://localhost:5173` 起，若被占用会递增
- Next + Socket：`http://localhost:3999` 起，若被占用会递增（`VITE_GATEWAY_ORIGIN` 会随实际端口设置）
- Python 网关：`http://127.0.0.1:8799` 起，若被占用会递增

## 测试

```bash
pnpm test
```

Python：

```bash
cd services/auto-drama-ai
pip install -r requirements.txt
pytest
```

也可以在根目录运行：

```bash
pnpm test:py
```
