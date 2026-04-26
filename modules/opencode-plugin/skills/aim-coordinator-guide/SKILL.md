---
name: aim-coordinator-guide
description: Coordinator decision entry for AIM Task Pool maintenance; form an approvable Task Write Bulk list from Manager output, latest baseline facts, current Tasks, and rejected Task feedback before routing approved writes through existing validation and creation skills.
---

# aim-coordinator-guide

## 概述

这个 skill 是 AIM Coordinator 维护 Task Pool 时的决策入口。Coordinator 的产物不是泛化分析报告，也不是直接执行开发工作，而是一个等待用户批准的 `Task Write Bulk` list。Manager 评估信号的产品语义见 `docs/manager-evaluation-signal.md`，Task Write Bulk 的独立输出契约见 `docs/task-write-bulk.md`。

`Task Write Bulk` list 用来表达 Task Pool 写入意图。每一项只能是 `Create` 或 `Delete`，可以混排，但必须显式声明依赖关系；用户批准后，按依赖顺序把每一项路由到对应流程。它是 Coordinator 阅读与审批产物，不是服务端 API schema、SQLite schema 或后台自动执行协议。

## 何时使用

- 需要根据 AIM Manager 输出、最新基线、当前 Task Pool 与 rejected Task 反馈决定 Task Pool 后续写入时。
- 需要判断应新增哪些 Task、删除哪些未完成 Task，或用 rejected Task 失败原因重新规划后续写入时。
- 需要把 Coordinator 判断收敛成可审批、可排序、可路由的 Task Pool Bulk Write 意图时。

## 何时不使用

- 不用它直接执行 Developer Task、修改代码、创建 PR 或跟进 Developer 生命周期。
- 不用它替代 `aim-verify-task-spec` 判断候选 Task Spec 是否仍可执行。
- 不用它替代 `aim-create-tasks`；不得直接调用 `POST /tasks`。
- 不用它实现真实 Coordinator 调度器、后台 worker、数据库 schema、服务端 bulk API 或自动执行器。

## 必需输入

- AIM Manager 的最新输出：差距分析、坐标系、迭代方向建议、开放问题。
- 最新 `origin/main` 基线事实：README、代码、文档、已合并 PR 与可只读验证的当前状态。
- 当前 Task Pool：所有未完成 Task 的标题、Spec、状态、依赖、已知阻塞与目标边界。
- rejected Task 反馈：失败原因、失败发生的基线事实、是否暴露了前提缺失或目标歧义。

如果这些输入缺失到影响目标、范围、验收、边界或优先级，必须升级给 Director 澄清；不得创建澄清类 Developer Task 来替代目标层决策。

## 输出：Task Write Bulk list

Coordinator 必须输出一个 `Task Write Bulk` list，不能只输出建议、分析或讨论文本。

每个条目必须包含：

- `id`：本次 bulk 内唯一的临时标识，用于表达依赖。
- `action`：只能是 `Create` 或 `Delete`。
- `depends_on`：本次 bulk 内必须先完成的条目 `id` 列表；没有依赖时写空列表。
- `reason`：为什么这个写入能推进最新基线，或为什么旧 Task 应从未完成视图移除。
- `source`：触发依据，例如 Manager 差距、最新基线事实、Task Pool 冲突、rejected Task 失败原因。

`Create` 条目还必须包含：

- `candidate_task_spec`：完整五段式候选 Task Spec，而不是标题或实现提示。
- `project_path`：目标仓库路径。
- `dependencies`：候选 Task 创建时应携带的 Task 依赖；如果没有依赖，写空列表。
- `verification_route`：固定写明批准后先经 `aim-verify-task-spec` 独立校验，通过后再进入 `aim-create-tasks`。

`Delete` 条目还必须包含：

- `target_task_id`：要删除的未完成 Task。
- `delete_reason`：删除依据，例如已被最新基线吸收、被更清晰的替代 Task 覆盖、与当前 README 或 Manager 方向冲突、或已不可执行。
- `replacement`：如果由新 `Create` 替代，写替代条目的 `id`；没有替代时写 `null`。

## 依赖顺序规则

- `depends_on` 只能引用同一个 `Task Write Bulk` list 中的条目 `id`。
- 批准后必须按依赖拓扑顺序执行；一个条目的依赖未完成前，不得执行该条目。
- 当 `Delete` 依赖某个替代 `Create` 时，必须先完成替代 Task 的验证与创建，再删除旧 Task。
- 当 `Create` 依赖某个失效 Task 的删除时，必须先确认删除原因和目标 Task，再进入候选 Spec 校验。
- 如果依赖关系形成环，bulk 不可执行；必须重写 bulk，而不是猜测顺序。
- 本 skill 只表达人工批准后的执行顺序，不改变 API 契约中 `dependencies` 的服务端语义，也不要求服务端自动执行 bulk。

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
- 禁止直接调用 `POST /tasks`；批准后的创建必须路由到 `aim-create-tasks`。

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

用户批准 `Task Write Bulk` list 后：

1. 按 `depends_on` 拓扑顺序处理条目。
2. 对每个 `Create`，先派发独立 Sub Agent 使用 `aim-verify-task-spec` 校验 `candidate_task_spec`。
3. 只有校验结论为可继续推进时，才使用 `aim-create-tasks` 创建 AIM Task。
4. 对每个 `Delete`，只在目标 Task 与删除原因明确时执行相应 Task Pool 写入流程。
5. 如果任一 `Create` 校验失败，停止执行依赖它的后续条目，并把失败原因反馈给 Coordinator 重新规划。

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

- [ ] 输出是 `Task Write Bulk` list，而不是泛化分析报告。
- [ ] 每个条目都是 `Create` 或 `Delete`，并有明确 `depends_on`。
- [ ] 每个 `Create` 都有完整五段式候选 Task Spec，并路由到 `aim-verify-task-spec` 与 `aim-create-tasks`。
- [ ] 没有直接调用 `POST /tasks`，也没有跳过用户批准。
- [ ] 每个 `Delete` 都有明确 `target_task_id` 和 `delete_reason`。
- [ ] rejected Task 失败原因已被纳入后续规划。
- [ ] README 或 Manager 输出不清晰且会影响目标、范围、验收、边界或优先级时，已升级 Director 澄清。
- [ ] 没有修改 Developer 生命周期规则，也没有把 Coordinator Guide 扩展成调度器或执行器。
