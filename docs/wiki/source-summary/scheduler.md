# Source Summary: 调度器与任务闭环

返回 [wiki 首页](../index.md)；相关综合页：[仓库是什么](../topic/what-this-repo-is-for.md)、[当前基线与模块地图](../topic/baseline-and-module-map.md)、[关键边界与非目标](../topic/boundaries-and-non-goals.md)

## Raw sources

- [`docs/scheduler.md`](../../scheduler.md)
- [`docs/task-model.md`](../../task-model.md)
- [`modules/api/src/task-scheduler.ts`](../../../modules/api/src/task-scheduler.ts)
- [`modules/api/src/task-session-coordinator.ts`](../../../modules/api/src/task-session-coordinator.ts)
- [`modules/api/src/task-repository.ts`](../../../modules/api/src/task-repository.ts)
- [`modules/api/src/task-database.ts`](../../../modules/api/src/task-database.ts)
- [`modules/api/src/routes/tasks.ts`](../../../modules/api/src/routes/tasks.ts)

## 来源事实

- 调度文档把 Task 定义为“一个基线迭代增量”，并把完整执行单元定义为：从最新基线出发，创建 worktree，验证、实现、测试、提 PR、跟进 checks/review、merge、清理 worktree、刷新本地基线。[raw](../../scheduler.md)
- Task 成功标准被定义得很严格：PR 已 merge、对应 worktree 已清理、主工作区本地基线已刷新，三者缺一不可。[raw](../../scheduler.md)
- 调度文档强调 `dependencies` 是软提示，不是硬门禁；真正的继续推进条件是最新基线能否满足 `Task Spec` 的 `Assumptions`。[raw](../../scheduler.md) [raw](../../task-model.md)
- API 代码里已存在任务调度与任务持久化实现：`task-scheduler.ts` 负责扫描未完成任务与继续 session，`task-repository.ts`/`task-database.ts` 负责 SQLite 持久化，`routes/tasks.ts` 暴露 `/tasks`、`/tasks/{taskId}`、`/tasks/{taskId}/spec`、`/resolve`、`/reject` 等接口。[raw](../../../modules/api/src/task-scheduler.ts) [raw](../../../modules/api/src/task-repository.ts) [raw](../../../modules/api/src/routes/tasks.ts)
- API 运行入口支持任务调度器：`server.ts` 中读取 `TASK_SCHEDULER_ENABLED`、`OPENCODE_*` 环境变量，创建 task repository、session coordinator 与 scheduler。[raw](../../../modules/api/src/server.ts)

## 综合判断

- 当前仓库不是只在讨论调度理念；它已经围绕 Task / Session / worktree / PR 闭环落下了服务端状态模型与调度骨架。
- 回答“仓库是干啥的”时，可以稳定表述为：这是一个围绕**多 Agent 研发任务闭环编排**的原型仓库，而不是普通 CRUD 脚手架。

## 待验证项

- 调度文档描述了更完整的无人值守出站与跟进语义，但当前 source sample 只证明了 scheduler、repository、task routes 与 session coordinator 骨架已存在；PR 跟进到自动 merge 的完整实现细节，本次未逐文件核实。
