# 主题：这个仓库是干啥的

返回 [wiki 首页](../index.md)；前置来源：[根 README 摘要](../source-summary/root-readme.md)、[调度器摘要](../source-summary/scheduler.md)、[架构摘要](../source-summary/architecture.md)、[OpenCode 插件摘要](../source-summary/opencode-plugin.md)

## 一句话回答

这是一个围绕 **AIM 多 Agent 研发管理闭环** 的仓库：它试图把 README 驱动的目标状态，转成可调度的 Task / Session / worktree / PR 基线推进流程，并且当前已经落下 `contract / api / web / cli / opencode-plugin` 等基础模块与核心调度语义，而不只是停留在概念说明。依据见 [根 README 摘要](../source-summary/root-readme.md) 与 [调度器摘要](../source-summary/scheduler.md)。

## 来源事实

- README 把 AIM 定位为围绕“基线推进”的方法与产品方向，并明确当前仓库承载的是方法论与调度语义所依赖的现有基线。[来源摘要](../source-summary/root-readme.md)
- 调度文档把 Task 成功定义为 PR merge、worktree 清理、主工作区基线刷新三者同时完成，说明仓库关注的是完整研发闭环，而不是局部实现完成。[来源摘要](../source-summary/scheduler.md)
- 架构资料与当前代码入口共同证明仓库里已存在协议层、API 服务、Web 界面、CLI 与 OpenCode 插件模块。[来源摘要](../source-summary/architecture.md) [来源摘要](../source-summary/opencode-plugin.md)

## 综合判断

- **目标产品形态**：AIM 想成为一个 self-hosted 的独立产品，具备 server、GUI、CLI、OpenAPI 等入口。这一层主要来自 README 的愿景陈述，不能直接当成“全部已实现”。[来源摘要](../source-summary/root-readme.md)
- **当前仓库现实**：这个仓库更准确地说，是 AIM 的**多 Agent 研发管理闭环原型基线**。已能看到任务状态模型、SQLite 持久化、Task API、调度器骨架、Task dashboard 入口、CLI 任务命令与 OpenCode skill 插件等现实落点。[来源摘要](../source-summary/scheduler.md) [来源摘要](../source-summary/architecture.md) [来源摘要](../source-summary/opencode-plugin.md)
- 因此，若有人问“这个仓库是个什么项目”，当前最稳妥的答法不是“一个已经完整上线的 AIM 平台”，而是“一个围绕 AIM 调度语义与多 Agent 研发闭环搭建中的产品原型/基线仓库”。

## 不该怎么回答

- 不应把 README 里的未来 GUI / 产品形态直接表述成“都已完整落地”。
- 不应把它缩减成“只是一个 OpenAPI demo”或“只是 task CRUD 服务”，因为调度语义、worktree/PR 闭环和 OpenCode 集成边界已经是核心组成部分。[来源摘要](../source-summary/scheduler.md)

## 待验证项

- 若要进一步回答“当前无人值守程度已经到什么水平”，还需要补充核对 PR follow-up、review 处理与 merge 自动化的实现范围。见 [待确认事项](../maintenance/open-questions.md)。
