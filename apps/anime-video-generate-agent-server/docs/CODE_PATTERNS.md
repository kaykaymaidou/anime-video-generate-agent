# Legacy Server — 代码模式说明

本包在 **默认栈之外** 运行；模式目标为「收缩边界」而非扩张功能。

## 1. 适配器（Adapter）

- **`python-bridge`**：将 Next 进程与 `services/anime-video-generate-agent-ai` 对齐 stdin/HTTP 契约。
- **`submit-tasks` / `video-task-config`**：统一点击「生成」后的后端选择（Nest vs Python），避免路由处理函数内散落条件。

## 2. 防腐层

`src/lib/agent/` 与 Nest `workflow` **语义冲突时以 Nest 为准**；此处修改仅限 legacy 兼容窗口期内。

## 3. 消亡路径

新契约先在 Nest 实现 → 客户端默认直连 Nest → 本包路由标注 DEPRECATED → SPEC 记载移除日期。
