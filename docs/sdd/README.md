# SDD — 规范驱动开发

## 1. 目标函数

将 Monorepo 行为约束为：**先变更 `docs/sdd/` 内契约，再变更代码**。索引入口：[INDEX.md](./INDEX.md)。

## 2. 工件类型

| 类型 | 路径 | 用途 |
|------|------|------|
| SPEC | `specs/` | 验收标准、API 形状、错误语义 |
| ADR | `adr/` | 不可逆架构取舍 |
| 包注册表 | `packages.md` | 目录 → 职责 → 默认 Owner |
| 模板 | `templates/` | 新建 SPEC/ADR 时复制 |

## 3. 变更流水线（有序）

```text
需求/issue → 新建或修订 specs/*.md → （可选）adr/*.md → 实现 → INDEX.md 与根 README 快照同步
```

跨包特性：**单条 SPEC** 必须写明 Nest / Python / Client / Legacy Next 的边界与事件名。

## 4. 可扩展性

| 维度 | 规则 |
|------|------|
| 新增包 | 更新 `packages.md`、pnpm workspace、根 README 拓扑表 |
| 替换栈（例：火山调用迁回 Python） | 先 ADR：任务生命周期、Socket 归属、env 前缀 |
| 版本化 API | SPEC 内标注 path/version；客户端与 Nest 同步 bump |
| 自动化 | `.cursor/rules/sdd.mdc` 约束 Agent：开工前加载 INDEX + 相关 SPEC |

## 5. 与仓库根 README 的关系

根 README：默认命令、端口、环境变量表、已实现能力快照。  
**不以根 README 替代 SPEC**；冲突时以 SPEC/ADR 为准。
