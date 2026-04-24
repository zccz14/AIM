# Source Summary: 根 README

返回 [wiki 首页](../index.md)；相关综合页：[仓库是什么](../topic/what-this-repo-is-for.md)、[当前基线与模块地图](../topic/baseline-and-module-map.md)、[关键边界与非目标](../topic/boundaries-and-non-goals.md)

## Raw sources

- [`README.md`](../../../README.md)

## 来源事实

- README 将 AIM 描述为一种把软件开发当作“基线迭代过程”来管理的方法与产品方向，而不是单个辅助工具。[raw](../../../README.md)
- README 里的目标产品形态包括独立 server、GUI、OpenAPI 与 CLI，但同时明确提醒：这些是**目标产品形态**，不应读成当前仓库已经完整落地。[raw](../../../README.md)
- README 明确当前首版聚焦“最小但完整的多 Agent 研发管理闭环”，核心关键词包括 Task、Session、worktree、PR、GitHub 集成与 OpenCode 集成。[raw](../../../README.md)
- README 给出了当前仓库的模块入口：`modules/contract`、`modules/api`、`modules/web`、`modules/cli`，并把调度定义指向 [`docs/scheduler.md`](../../scheduler.md)。[raw](../../../README.md)
- README 明确非目标：不是面向所有研发流程的通用 Agent 平台，不把任务成功弱化为“代码已写完”或“PR 已创建”。[raw](../../../README.md)

## 综合判断

- 根 README 同时承担了**产品愿景说明**与**当前仓库入口说明**两层职责；阅读时必须把“未来目标形态”和“现有基线”拆开理解，否则容易高估当前仓库完成度。
- 回答“仓库是干啥的”时，README 不能单独使用，必须与调度文档、架构边界和模块现实一起看。

## 待验证项

- README 提到的 AIM Manager 输出最终落在 repo 文件还是 SQLite，文中明确写为“尚不明确”，因此不能当作当前稳定实现事实。[raw](../../../README.md)
