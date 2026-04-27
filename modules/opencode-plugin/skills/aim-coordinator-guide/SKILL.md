---
name: aim-coordinator-guide
description: Coordinator decision entry for AIM Task Pool maintenance; form an approvable POST /tasks/batch operations plan from Manager output, latest baseline facts, current Tasks, and rejected Task feedback before applying atomic Task Pool writes.
---

# aim-coordinator-guide

## 概述

这个 skill 是 AIM Coordinator 维护 Task Pool 时的决策入口。Coordinator 的产物不是泛化分析报告，也不是直接执行开发工作，而是一个等待用户批准的 `POST /tasks/batch` operations 计划。Manager 评估信号的产品语义见 `docs/manager-evaluation-signal.md`。

`POST /tasks/batch` operations 用来对同一个 `project_id` 的 Task Pool 做原子写入。每一项只能是 `create` 或 `delete`；用户批准后，一次性提交到服务端，任一 operation 失败则整体回滚。

## 何时使用

- 需要根据 AIM Manager 输出、最新基线、当前 Task Pool 与 rejected Task 反馈决定 Task Pool 后续写入时。
- 需要判断应新增哪些 Task、删除哪些未完成 Task，或用 rejected Task 失败原因重新规划后续写入时。
- 需要把 Coordinator 判断收敛成可审批的 Task Pool batch operations 时。

## 何时不使用

- 不用它直接执行 Developer Task、修改代码、创建 PR 或跟进 Developer 生命周期。
- 不用它替代 `aim-verify-task-spec` 判断候选 Task Spec 是否仍可执行。
- 不用它替代 `aim-create-tasks`；不得直接调用 `POST /tasks` 逐条写入。
- 不用它实现真实 Coordinator 调度器、后台 worker 或自动执行器。

## 必需输入

- AIM Manager 的最新输出：差距分析、坐标系、迭代方向建议、开放问题。
- 最新 `origin/main` 基线事实：README、代码、文档、已合并 PR 与可只读验证的当前状态。
- 当前 Task Pool：所有未完成 Task 的标题、Spec、状态、依赖、已知阻塞与目标边界。
- rejected Task 反馈：失败原因、失败发生的基线事实、是否暴露了前提缺失或目标歧义。

如果这些输入缺失到影响目标、范围、验收、边界或优先级，必须升级给 Director 澄清；不得创建澄清类 Developer Task 来替代目标层决策。

## 输出：POST /tasks/batch operations

Coordinator 必须输出一个可审批的 `POST /tasks/batch` operations 计划，不能只输出建议、分析或讨论文本。

每个条目必须包含：

- `type`：只能是 `create` 或 `delete`。
- `reason`：为什么这个写入能推进最新基线，或为什么旧 Task 应从未完成视图移除。
- `source`：触发依据，例如 Manager 差距、最新基线事实、Task Pool 冲突、rejected Task 失败原因。

`Create` 条目还必须包含：

- `task.task_id`：调用方生成并传入的 UUID。
- `task.title`：候选 Task 标题。
- `task.spec`：完整五段式候选 Task Spec，而不是标题或实现提示。
- `dependencies`：候选 Task 创建时应携带的 Task 依赖；如果没有依赖，写空列表。
- `source_metadata`：来源信息，例如 Manager 评估、Coordinator session 或 rejected 反馈。

`Delete` 条目还必须包含：

- `task_id`：要删除的未完成 Task UUID。
- `delete_reason`：删除依据，例如已被最新基线吸收、被更清晰的替代 Task 覆盖、与当前 README 或 Manager 方向冲突、或已不可执行。

## Batch 规则

- 顶层必须包含唯一 `project_id`，不得跨 project 原子写入。
- `operations` 按数组顺序执行。
- 同一 batch 内禁止重复 `task_id`，避免顺序依赖。
- `create.task.task_id` 必须是调用方传入的 UUID。
- `delete` 只允许删除未完成 Task；禁止删除 `resolved` / `rejected` 终态 Task。

## Create 判断规则

产生 `Create` 写入意图的条件：

- Manager 输出指出 README 目标与最新基线之间存在可执行差距。
- 当前 Task Pool 没有覆盖该差距，或已有 Task 的范围不足以推进该差距。
- rejected Task 暴露了可通过后续基线增量修复的前提缺口。
- 最新基线出现了新的事实，需要补一个明确的后续迭代 Task 才能继续逼近 README。

`Create` 禁止项：

- 禁止用含糊目标、开放问题或需要 Director 决策的内容生成 Developer Task。
- 禁止把 README 或 Manager 输出不清晰的问题包装成“澄清类 Developer Task”。
- 禁止跳过 `aim-verify-task-spec` 自行认定候选 Spec 可创建。
- 禁止未经用户批准直接创建 Task。
- 禁止直接调用 `POST /tasks` 逐条写入；批准后的原子写入必须通过 `POST /tasks/batch`。

## Delete 判断规则

产生 `Delete` 写入意图的条件：

- 未完成 Task 的内容已被最新基线吸收，不再代表待推进差距。
- 未完成 Task 被更清晰、更小或更准确的 Task 覆盖。
- 未完成 Task 与当前 README、Manager 方向或最新基线事实冲突。
- 未完成 Task 已不可执行，且等待后续基线自然恢复不再合理。
- rejected Task 反馈表明旧 Task 的失败原因已经使其原目标失效。

`Delete` 禁止项：

- 禁止删除已 resolved 的 Task 来维护历史记录；Task Pool 是未完成视图，不是历史系统。
- 禁止只因旧 Task 排序较低、暂时不优先或实现较难就删除。
- 禁止在没有明确 `target_task_id` 和 `delete_reason` 时执行删除。
- 禁止把 `Delete` 当作静默放弃；必须说明它如何让 Task Pool 更贴合最新基线。

## Rejected 反馈闭环

rejected Task 的失败原因是新的基线规划输入。Coordinator 必须先判断失败原因属于哪一类：

- 前提缺失但可修复：产生修复前提的 `Create`，并说明它如何解除失败原因。
- 原 Task 已失效：产生 `Delete`，必要时再用更准确的 `Create` 替代。
- README、Manager 输出或优先级不清晰：升级给 Director 澄清，不产生 Developer Task。
- 失败原因超出当前 README 目标：不创建 scope 外 Task，必要时记录为 Director 决策输入。

不得把 rejected Task 反馈简单重试为同一个 Task，也不得忽略失败原因继续创建同类失效任务。

## 批准后路由

用户批准 `POST /tasks/batch` operations 后：

1. 对每个 `create`，先使用 `aim-verify-task-spec` 校验 `task.spec`。
2. 只有所有 `create` 校验结论均可继续推进时，才提交 `POST /tasks/batch`。
3. 对每个 `delete`，只在目标 Task 未完成且删除原因明确时保留在 batch 中。
4. 如果任一 `create` 校验失败，停止提交 batch，并把失败原因反馈给 Coordinator 重新规划。

Coordinator 不得在这个阶段接管 Developer 生命周期；已创建的 Task 后续执行必须由 `aim-developer-guide` 覆盖。

## README / Manager 不清晰门禁

如果 README 或 Manager 输出的不清晰会影响以下任一内容，Coordinator 必须升级给 Director 澄清：

- Task Spec 的目标。
- Task Spec 的范围。
- Task Spec 的验收方式。
- Task Spec 的边界或 Non-Goal。
- Task 之间的优先级或依赖方向。

升级时输出具体不清晰点、为什么它会改变 Task Pool 写入、以及需要 Director 决策的问题。不得创建澄清类 Developer Task，也不得用自己的猜测填补 Director 输入。

## 自检清单

- [ ] 输出是 `POST /tasks/batch` operations，而不是泛化分析报告。
- [ ] 每个 operation 都是 `create` 或 `delete`。
- [ ] 每个 `create` 都有调用方生成的 UUID 和完整五段式候选 Task Spec。
- [ ] 没有直接调用 `POST /tasks` 逐条写入，也没有跳过用户批准。
- [ ] 每个 `delete` 都有明确 `task_id` 和 `delete_reason`。
- [ ] rejected Task 失败原因已被纳入后续规划。
- [ ] README 或 Manager 输出不清晰且会影响目标、范围、验收、边界或优先级时，已升级 Director 澄清。
- [ ] 没有修改 Developer 生命周期规则，也没有把 Coordinator Guide 扩展成调度器或执行器。
