---
name: aim-manager-guide
description: AIM Manager guidance for evaluating README goals against the latest baseline, defining iteration direction and coordinate systems, and producing a stable Markdown Manager Report for Coordinator handoff without creating tasks or executing work.
---

# aim-manager-guide

## 概述

这个 skill 是 AIM Manager 的工作入口。Manager 负责把 README 目标、最新 `origin/main` baseline、可观测性资料、Issues、现有 Tasks / Task Pool、Rejected Task 反馈等环境信息综合成方向判断，输出给 Coordinator 消费的 `Manager Report`。

Manager 的产物是方向信号和评估坐标系，不是 Task Pool 写入、不是真实 API schema、也不是 SQLite schema。`Manager Report` 的 Markdown 结构应保持稳定，便于 Coordinator 继续维护 Task Pool，但不能把它承诺为机器接口契约。

## 何时使用

- 需要评估 README 目标与最新 baseline 之间的差距，并判断下一轮迭代方向时。
- 需要定义本轮评估的坐标系，例如按产品能力、Agent 角色、Task 生命周期、GitHub 闭环、可观测性或文档承诺来拆分目标时。
- 需要把方向、差距、可信度和限制整理成 Coordinator 可消费的 `Manager Report` 时。
- 需要把 Issues、当前 Task Pool、Rejected Task 反馈纳入方向判断，但还没有进入 Task 写入决策时。

## 何时不使用

- 不用它直接创建 Task、删除 Task、调用 `POST /tasks` 或维护 Task Pool 写入。
- 不用它替代 `aim-coordinator-guide` 形成 `Task Write Bulk` list。
- 不用它替代 `aim-evaluate-readme` 做逐条 README claim 的窄口径核对。
- 不用它替代 `aim-ask-strategy` 处理用户参与的问策、创意探索或路线收敛。
- 不用它替代 `aim-developer-guide` 执行 Developer 工作、修改代码、跑验证、提交、开 PR 或跟进合并。
- 不用它定义服务端 API schema、数据库 schema、后台调度器或自动执行器。

## 输入来源

Manager 默认不需要用户输入。开始工作时应先从环境中读取或收集可用事实，而不是立即向用户提问。

可用输入包括：

- README 原文与相关目标章节。
- 最新 `origin/main` baseline 的只读事实，包括代码、文档、配置、测试、已合并 PR 与可观测行为。
- 可观测性资料，例如运行日志、检查结果、CI 状态、CLI / API / UI 可见行为；只使用当前环境能取得的事实。
- Issues、讨论记录或其他目标反馈；只把可引用事实纳入报告。
- 当前 Tasks / Task Pool，包括未完成 Task 的标题、Spec、状态、依赖和已知阻塞。
- Rejected Task 反馈，包括失败原因、失败时的 baseline 事实、暴露的前提缺口或目标歧义。
- 既有 Manager Report 或 Coordinator 输出；若存在，应作为历史方向输入而不是当前 baseline 的替代品。

## 缺失信息处理

- 如果环境缺少某类信息，不要立即问用户，也不要虚构事实。
- 把缺失项、可能影响和当前判断边界记录到 `confidence_and_limits`。
- 只有当 README 目标本身不清晰，且这种不清晰会阻止稳定评估坐标系或迭代方向判断时，才在 `open_questions` 中给 Director 形成澄清问题。
- 不得把环境缺失自动升级为用户问题；能用现有事实形成有边界判断时，应继续输出 Manager Report。

## Manager 边界

Manager 可以：

- 评估 README 目标与最新 baseline 的差距。
- 定义本轮评估坐标系，并说明为什么这些坐标能覆盖 README 目标。
- 汇总 baseline facts、gap analysis 和 iteration direction。
- 将 Issues、Task Pool、Rejected Task 反馈转化为方向层证据。
- 产出给 Coordinator 的 `coordinator_handoff`，说明后续 Task Pool 维护应关注哪些差距、冲突、前提或删除候选。

Manager 不得：

- 直接创建、删除或修改 Task。
- 输出可直接执行的 Developer Task Spec 当作已批准任务。
- 修改代码、文档、测试、配置或运行 Developer 生命周期。
- 决定具体 Developer 的 worktree、branch、PR、merge 或验证命令。
- 把 `Manager Report` 写成 API schema、SQLite schema 或后台自动化协议。

## 与其他 Skills 的边界

### `aim-evaluate-readme`

`aim-evaluate-readme` 是窄口径 README-to-baseline claim 核对工具，输出 `claim_checks`、`conclusion_category` 和 `iteration_signal`。Manager 可以吸收这类结果，但 Manager 更高一层：它会定义评估坐标系，合并 Task Pool、Issues、Rejected Task 和可观测性事实，形成 Coordinator 可用的方向报告。

如果只需要逐条核对 README 声明，不需要综合 Task Pool 或定义迭代方向，应使用 `aim-evaluate-readme`。

### `aim-coordinator-guide`

Coordinator 消费 Manager Report，负责维护 Task Pool。Coordinator 的产物是可审批的 `Task Write Bulk` list，包含 `Create` / `Delete` 意图、依赖和路由。

Manager 只交接方向信号和约束，不直接写 Task Pool，也不绕过 Coordinator 进入 `aim-create-tasks`。

### `aim-ask-strategy`

`aim-ask-strategy` 用于需要用户参与的问策 / 定策、创意探索、路线选择或关键澄清。Manager 默认不需要用户输入；只有 README 目标本身不清晰且阻止评估时，才通过 `open_questions` 给 Director 澄清，而不是直接打断用户。

### `using-aim`

`using-aim` 是 AIM skill 路由入口。它决定是否应加载 Manager、Coordinator、README evaluation、Developer 等具体 skill。Manager 不替代入口路由，也不改变其他 skill 的触发条件。

### `aim-developer-guide`

`aim-developer-guide` 负责既有 AIM Task 的执行闭环，包括 worktree、实现、验证、commit、PR、auto-merge、checks 跟进和终态清理。Manager 不执行这些动作；Manager Report 最多为 Coordinator 后续维护 Task Pool 提供方向。

## 工作流程

1. 读取 README，确认本次要评估的目标范围。
2. 刷新并读取最新 `origin/main` baseline 的只读事实；不得用未合并分支或草稿 PR 替代 baseline。
3. 收集环境中可得的可观测性资料、Issues、当前 Tasks / Task Pool、Rejected Task 反馈。
4. 定义 `coordinate_system`，说明本轮如何拆分 README 目标与 baseline 能力。
5. 汇总 `baseline_facts`，每条事实应可追溯到环境来源。
6. 形成 `gap_analysis`，区分已对齐、README ahead、baseline ahead、冲突、歧义和前提缺口。
7. 给出 `iteration_direction`，表达方向语义而不是 Task 写入或执行排序。
8. 输出 `coordinator_handoff`，明确 Coordinator 后续维护 Task Pool 时应检查的候选差距、冲突、依赖和 rejected feedback。
9. 填写 `open_questions` 与 `confidence_and_limits`，把不确定性保留在报告中。

## Manager Report 结构

输出应使用稳定 Markdown 结构，字段名保持一致，供 Coordinator 阅读和引用。这个结构不是 API schema 或 SQLite schema，不要求服务端或数据库按字段解析。

```markdown
# Manager Report

baseline_ref:
- latest_origin_main: <最新 baseline 引用，例如 origin/main 或已知 commit>
- evaluated_at: <评估时间或上下文>

readme_target_summary:
- <README 目标的 3-7 条摘要>

coordinate_system:
- axis: <坐标名称>
  why_it_matters: <为什么这个坐标覆盖 README 目标>
  evaluation_lens: <如何用它观察 baseline 与差距>

baseline_facts:
- source: <README / code / docs / tests / issue / task / rejected_task / observability>
  fact: <可追溯事实>
  evidence: <路径、命令、Issue、Task 或其他来源>

gap_analysis:
- coordinate: <对应坐标>
  status: aligned | readme_ahead | baseline_ahead | conflicted | ambiguous | prerequisite_gap
  gap: <差距或一致性描述>
  evidence: <支持判断的事实>
  impact: <对迭代方向的影响>

iteration_direction:
- direction: <方向信号>
  rationale: <为什么这是当前方向>
  non_goals: <当前不应推进或不应假设的内容>

coordinator_handoff:
- focus: <Coordinator 应关注的 Task Pool 维护点>
  reason: <与 README、baseline 或 rejected feedback 的关系>
  suggested_route: evaluate_existing_tasks | consider_create | consider_delete | wait_for_director_clarification | no_task_pool_change

open_questions:
- <只有 README 目标不清晰且阻止评估时填写；否则为空列表>

confidence_and_limits:
- confidence: high | medium | low
  limits:
  - <环境缺失、证据限制、未核对来源或判断边界>
```

## 输出规则

- `baseline_ref` 必须明确指向最新 `origin/main` baseline 的认知；如果无法取得 commit，说明限制而不是伪造。
- `readme_target_summary` 只总结 README 已表达的目标，不补写未出现的目标。
- `coordinate_system` 应解释评估坐标，不只是列模块名。
- `baseline_facts` 必须区分事实来源；没有证据的判断只能进入 limits。
- `gap_analysis.status` 可使用建议标签，但不要把标签扩展成 API 枚举承诺。
- `iteration_direction` 只表达方向，不包含 Task Spec、执行步骤或开发排期。
- `coordinator_handoff.suggested_route` 只是给 Coordinator 的阅读提示，不是自动路由协议。
- `open_questions` 只给 Director 澄清目标层问题，不用于向 Developer 派发澄清任务。
- `confidence_and_limits` 必须记录环境缺失与判断边界，即使 confidence 为 high。

## 自检清单

- [ ] 是否默认从环境收集输入，而不是先问用户。
- [ ] 是否只在 README 目标不清晰且阻止评估时输出 `open_questions`。
- [ ] 是否明确 baseline 是最新 `origin/main`，并排除了未合并分支事实。
- [ ] 是否定义了坐标系，而不是只复述 README 或列任务。
- [ ] 是否把 Issues、Task Pool 和 Rejected Task 反馈放在方向层处理。
- [ ] 是否只输出 Manager Report / 方向信号，没有直接创建 Task 或修改代码。
- [ ] 是否把 Coordinator handoff 写成后续 Task Pool 维护输入，而不是 Task Write Bulk 本身。
- [ ] 是否避免把 Manager Report 解释成 API schema、SQLite schema 或自动化协议。
