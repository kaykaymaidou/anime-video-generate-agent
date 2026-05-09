# 规范索引（SDD）

> 新增功能：**先**在本目录 `specs/` 增加或修订条目，**再**提交实现 PR。

## 活跃规范

| ID | 标题 | 范围 | 状态 |
|----|------|------|------|
| SPEC-001 | [默认栈：Nest + Vite 与火山 HTTP](./specs/SPEC-001-nest-vite-volc-http.md) | Nest、前端、dev 脚本 | active |
| SPEC-002 | [Ark 文本拆镜 Token 预算](./specs/SPEC-002-token-budget.md) | legacy `/api/agent`、环境变量 | active |
| SPEC-003 | [方舟模型与 Nest LangChain Agent](./specs/SPEC-003-volc-agent-models.md) | Nest Volc、对话/视频、剧本辅助、动漫锁定 | active |
| SPEC-004 | [成片拼接、用量账本与静态导出](./specs/SPEC-004-timeline-usage-exports.md) | FFmpeg、`/exports`、`/api/usage` | active |

## ADR（架构决策）

| ID | 标题 |
|----|------|
| （待定） | 例如：Python 重新承担火山对接时的契约对齐 |

## 快速链接

- [Monorepo 根 README（入门与工程快照）](../../README.md)
- [Monorepo 包职责](./packages.md)
- [SDD 流程说明](./README.md)
- [功能规范模板](./templates/feature-spec.md)
- [ADR 模板](./templates/adr.md)
