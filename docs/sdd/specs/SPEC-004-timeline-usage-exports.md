# SPEC-004：成片拼接、用量账本与静态导出

**状态**：active  
**范围**：`services/anime-video-generate-agent-nest`（FFmpeg 子进程、静态目录）、`apps/anime-video-generate-agent-client`（按钮与轮询）

## 背景

- 多镜 Seedance 产出为 **独立 URL**，交付级「一条成片」需在服务端 **拼接**（无 AI）。
- 运营需可见 **方舟返回的 `usage.cost`**，不必秒级实时，但应 **定时刷新** 并在生成完成时尽快对齐。

## 需求

### 1. FFmpeg 拼接

- `POST /api/timeline/concat`  
  - Body：`{ clips: Array<{ order: number; url: string }> }`，仅允许 `http(s)` URL。  
  - 行为：下载至临时目录 → concat demuxer → **`ffmpeg -c copy`** → 写入 `storage/exports/*.mp4`。  
  - 依赖：运行环境可执行 **`ffmpeg`**（或通过 `FFMPEG_PATH` 指定）。
- HTTP 静态挂载：**`/exports/`** → `storage/exports/`（见 `main.ts`）。
- 可选：`PUBLIC_HTTP_BASE` 用于 API 响应中返回 **绝对** 播放 URL。

### 2. 用量账本

- 每镜生成 **成功**（拿到 `video_url`）时，将方舟快照中的 **`usage.cost`** 记入内存账本（含 `taskId`、`shotId`、`modelType` 等）。
- `GET /api/usage/summary` → `{ totalCost, entryCount, lastEntryAt }`。
- `GET /api/usage/ledger?limit=` → 最近若干条，按时间倒序。
- **持久化**：当前为进程内结构；重启 Nest 清空（后续可用 SPEC/ADR 扩展 SQLite/Redis）。

### 3. 前端

- Vite 开发：`**/exports`** 与 **`/api`** 代理到同一网关 origin（`VITE_GATEWAY_ORIGIN`）。
- 控制台 / 成本页：TanStack Query **约 25s** `refetchInterval`；工作区 Socket **`result`** 后 **`invalidateQueries(['usage'])`**。

## 验收标准

- [ ] 至少两段有效成片 URL 时，`POST /api/timeline/concat` 返回可访问的 `/exports/....mp4`（同源或 `PUBLIC_HTTP_BASE`）。
- [ ] 生成成功后 `GET /api/usage/summary` 的 `entryCount` 递增，`ledger` 含对应 `shotId`/`cost`。
- [ ] 未安装 ffmpeg 时接口返回明确错误（进程 spawn 失败或退出码非 0）。

## 非目标

- 统一编码参数的 **重编码** 拼接（`-c copy` 失败时的自动 fallback，可后续 SPEC）。
- 用量账本跨实例一致性（需外部存储时再开 ADR）。

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05 | 初稿，对齐 Nest + 前端当前实现 |
