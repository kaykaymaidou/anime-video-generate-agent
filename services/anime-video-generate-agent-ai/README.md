# anime-video-generate-agent-ai

## 1. 定义

| 字段 | 值 |
|------|-----|
| 语言 | Python 3 |
| 激活条件 | `pnpm dev -- --legacy` 时由根脚本拉起；**默认栈不依赖** |
| 交付物 | FastAPI 网关（`http_gateway.py`）、Seedance 调用封装、`main.py` CLI/stdin 契约 |

## 2. 职责边界

- 提供与历史 Next / 脚本兼容的 **HTTP 与进程间** 任务入口。
- **不承担**：默认路径下的 Nest 直连火山逻辑；并与 Nest 共享 env 键名集（见 Nest `app.module.ts` `envFilePath`）。

## 3. 可扩展性

| 扩展方向 | 挂载点 |
|----------|--------|
| 新 HTTP 路由 | `src/http_gateway.py`：保持与 Nest `/api/v1/tasks` 语义一致或显式版本化 |
| Seedance 请求体 | `src/seedance_client_sdk.py` / `seedance_client.py`：字段与方舟 OpenAPI 同步 |
| 本地冒烟 | `src/smoke_seedance_task.py`：CI 或密钥校验 |
| 假任务模式 | `AUTO_DRAMA_FAKE`：用于无密钥集成测试；与 `scripts/dev.mjs` legacy 行为对齐 |
| 切换为唯一后端 | 须 ADR：定义任务 ID、轮询间隔、Socket 由谁推送；禁止静默分叉契约 |

Python 与 Nest 并存时：**单一事实来源**为 `docs/sdd/specs/`；代码侧重复逻辑以 spec 中的请求/响应 JSON 为准收敛。

## 4. 命令

以本目录 `package.json` 的 `py:*` / 根目录 `pnpm test:py` 为准；依赖见 `requirements.txt`。

## 5. 上游文档

- [SPEC-001](../../docs/sdd/specs/SPEC-001-nest-vite-volc-http.md)
- [packages.md](../../docs/sdd/packages.md)
