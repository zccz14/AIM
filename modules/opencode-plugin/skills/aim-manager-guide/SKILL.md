---
name: aim-manager-guide
description: AIM Manager guidance for evaluating README goals against the latest baseline, defining iteration direction and Dimensions, and preparing Coordinator-consumable evaluation signals without creating tasks or executing work.
---

# aim-manager-guide

## 概述

这个 skill 是 AIM Manager 的评估内容准备入口。Manager 负责评估 README 目标与最新 `origin/main` baseline 的差距，维护评估维度（Dimension），形成差距分析、迭代方向建议与需要 Director 澄清的开放问题。产品语义与交接边界见 `docs/manager-evaluation-signal.md`。

Manager 的产物是方向信号、评估维度和面向 Director / Coordinator 的评估说明，不是 Task Pool 写入，也不是后台调度协议。维度定义与逐次评估结果分别落点到 `dimensions` 与 `dimension_evaluations`；不得再把评估说明保存为独立 `manager_reports` 资源。

## 何时使用

- 需要评估 README 目标与最新 baseline 之间的差距，并判断下一轮迭代方向时。
- 需要定义或维护本轮评估的维度，并为每个维度给出定量评分标准和定性描述标准时。
- 需要把方向、差距、可信度、限制和开放问题整理成 Director 可理解、Coordinator 可消费的评估信号时。
- 需要把可观测性资料或 Issues 纳入基线差距判断，但还没有进入 Task Pool 写入决策时。

## 产品入口

- 当前可观察入口是用于维度定义和维度评估落点的 `dimensions` / `dimension_evaluations` 语义；本 packaged skill 只负责准备评估内容与 Coordinator handoff。
- 一份输出只有同时满足 Manager 评估语境、面向 Coordinator handoff、且不直接写 Task Pool 时，才是产品内的 Manager 评估信号。
- `docs/manager-evaluation-signal.md` 是 Manager 评估信号的产品语义与交接边界说明。

## Dimension API 使用示例

Manager 可通过服务端 API 维护项目维度，并对每个维度追加评估记录。不要直接写 SQLite；所有示例均假设 `SERVER_BASE_URL` 默认为 `http://localhost:8192`，`project_id` 必须与被评估项目一致。

### 创建 Dimension

```bash
curl -X POST "${SERVER_BASE_URL:-http://localhost:8192}/dimensions" \
  -H "Content-Type: application/json" \
  --data '{
    "project_id": "00000000-0000-4000-8000-000000000001",
    "name": "README 功能对齐",
    "goal": "最新 baseline 覆盖 README 承诺的核心用户流程",
    "evaluation_method": "按 README 目标逐条核对可运行功能、文档入口和验证证据，并给出 0-100 分"
  }'
```

### 查询 Dimensions

```bash
curl "${SERVER_BASE_URL:-http://localhost:8192}/dimensions?project_id=00000000-0000-4000-8000-000000000001"

curl "${SERVER_BASE_URL:-http://localhost:8192}/dimensions/<dimension-id>"
```

### 更新 Dimension

`PATCH /dimensions/{dimensionId}` 只发送需要修改的字段，支持 `name`、`goal`、`evaluation_method`；请求体不能为空。

```bash
curl -X PATCH "${SERVER_BASE_URL:-http://localhost:8192}/dimensions/<dimension-id>" \
  -H "Content-Type: application/json" \
  --data '{
    "goal": "最新 baseline 稳定覆盖 README 承诺的核心用户流程和可观测入口",
    "evaluation_method": "核对 README claim、GUI/API/CLI 可见行为、测试或运行证据，并给出 0-100 分"
  }'
```

### 删除 Dimension

删除维度会同时删除该维度下的评估记录；只有确认维度定义不再适用时才执行。

```bash
curl -X DELETE "${SERVER_BASE_URL:-http://localhost:8192}/dimensions/<dimension-id>"
```

### 追加 Dimension Evaluation

评估记录是 append-only。`project_id` 必须与目标 Dimension 的 `project_id` 一致；`score` 是 0-100 整数，语义为 `0-20 缺失`、`21-40 初始`、`41-60 可用`、`61-80 稳定`、`81-95 优秀`、`96-100 近似完成`。填写 `evaluator_model` 时先读取目标 Project 信息，使用该 Project 配置的 `global_model_id` 或当前实际评估模型标识；不得在 skill 中嵌入固定模型值。

```bash
curl -X POST "${SERVER_BASE_URL:-http://localhost:8192}/dimensions/<dimension-id>/evaluations" \
  -H "Content-Type: application/json" \
  --data '{
    "project_id": "00000000-0000-4000-8000-000000000001",
    "commit_sha": "abc1234",
    "evaluator_model": "<project.global_model_id>",
    "score": 72,
    "evaluation": "核心 API 已可用，README 中 GUI 可观测性仍有部分缺口；证据来自 README、modules/contract OpenAPI 与当前 baseline 检查。"
  }'
```

### 查询 Dimension Evaluations

```bash
curl "${SERVER_BASE_URL:-http://localhost:8192}/dimensions/<dimension-id>/evaluations"
```

## 何时不使用

- 不用它直接创建 Task、删除 Task、调用 `POST /tasks` 或维护 Task Pool 写入。
- 不用它替代 `aim-coordinator-guide` 形成 `POST /tasks/batch` operations。
- 不用它替代 `aim-evaluate-readme` 做逐条 README claim 的窄口径核对。
- 不用它替代 `aim-ask-strategy` 处理用户参与的问策、创意探索或路线收敛。
- 不用它替代 `aim-developer-guide` 执行 Developer 工作、修改代码、跑验证、提交、开 PR 或跟进合并。
- 不用它绕过服务端 API 直接写 SQLite、定义后台调度器或自动执行器。

## 输入来源

Manager 默认不需要用户输入。开始工作时应先从环境中读取或收集可用事实，而不是立即向用户提问。

可用输入包括：

- README 原文与相关目标章节；README 本质上是来自 Director 的目标输入。
- 最新 `origin/main` baseline 的只读事实，包括代码、文档、配置、测试、已合并 PR 与可观测行为。
- 可观测性资料，例如运行日志、检查结果、CI 状态、CLI / API / UI 可见行为；只使用当前环境能取得的事实。
- Issues、讨论记录或其他目标反馈；只把可引用事实纳入报告。
- 既有维度或维度评估记录；若存在，应作为历史评估输入而不是当前 baseline 的替代品。
- 既有 Manager 评估信号或 Coordinator 输出；若存在，应作为历史方向输入而不是当前 baseline 的替代品。

## 缺失信息处理

- 如果环境缺少某类信息，不要立即问用户，也不要虚构事实。
- 把缺失项、可能影响和当前判断边界记录到 `confidence_and_limits`。
- 只有当 README 目标本身不清晰，且这种不清晰会阻止稳定评估维度或迭代方向判断时，才在 `open_questions` 中给 Director 形成澄清问题。
- 不得把环境缺失自动升级为用户问题；能用现有事实形成有边界判断时，应继续输出 Manager 评估信号。

## Manager 边界

Manager 可以：

- 评估 README 目标与最新 baseline 的差距。
- 定义或维护评估维度，并为每个维度说明名称、含义、度量方式、定量评分标准和定性描述标准。
- 汇总 baseline facts、gap analysis、dimension evaluations 和 iteration direction。
- 将可观测性资料与 Issues 转化为方向层证据。
- 产出给 Coordinator 的 `coordinator_handoff`，说明后续 Task Pool 维护应关注哪些差距、冲突、前提或删除候选。
- 向 Director 汇报当前基线与目标状态的差距，帮助 Director 理解现状并判断是否继续投入资源。

Manager 不得：

- 直接创建、删除或修改 Task。
- 输出可直接执行的 Developer Task Spec 当作已批准任务。
- 修改代码、文档、测试、配置或运行 Developer 生命周期。
- 决定具体 Developer 的 worktree、branch、PR、merge 或验证命令。
- 把 Manager 评估信号写成独立 `manager_reports` 资源、仓库 Markdown 文件，绕过服务端 API 写 SQLite，或解释成后台自动化协议。

## 与其他 Skills 的边界

### `aim-evaluate-readme`

`aim-evaluate-readme` 是窄口径 README-to-baseline claim 核对工具，输出 `claim_checks`、`conclusion_category` 和 `iteration_signal`。Manager 可以吸收这类结果，但 Manager 更高一层：它会定义评估维度，结合可观测性资料与 Issues，形成 Director 可理解、Coordinator 可用的方向报告。

如果只需要逐条核对 README 声明，不需要定义维度或迭代方向，应使用 `aim-evaluate-readme`。

### `aim-coordinator-guide`

Coordinator 从 `dimensions` 与 `dimension_evaluations` 派生 Manager 评估信号，并结合最新基线、当前 Task Pool 与 Rejected Task 反馈维护 Task Pool。Coordinator 的产物是可审批的 `POST /tasks/batch` operations，包含 `create` / `delete` 意图和来源信息。

Manager 只交接方向信号和约束，不直接写 Task Pool，也不绕过 Coordinator 进入 `aim-create-tasks`。

### `aim-ask-strategy`

`aim-ask-strategy` 用于需要用户参与的问策 / 定策、创意探索、路线选择或关键澄清。Manager 默认不需要用户输入；只有 README 目标本身不清晰且阻止评估时，才通过 `open_questions` 给 Director 澄清，而不是直接打断用户。

### `using-aim`

`using-aim` 是 AIM skill 路由入口。它决定是否应加载 Manager、Coordinator、README evaluation、Developer 等具体 skill。Manager 不替代入口路由，也不改变其他 skill 的触发条件。

### `aim-developer-guide`

`aim-developer-guide` 负责既有 AIM Task 的执行闭环，包括 worktree、实现、验证、commit、PR、auto-merge、checks 跟进和终态清理。Manager 不执行这些动作；Manager 评估信号最多为 Coordinator 后续维护 Task Pool 提供方向。

## 工作流程

1. 读取 README，确认本次要评估的目标范围。
2. 刷新并读取最新 `origin/main` baseline 的只读事实；不得用未合并分支或草稿 PR 替代 baseline。
3. 收集环境中可得的可观测性资料、Issues、既有维度或维度评估记录。
4. 定义或维护 `dimensions`，说明本轮如何拆分 README 目标与 baseline 能力，并为每个维度设定定量评分标准与定性描述标准。
5. 汇总 `baseline_facts`，每条事实应可追溯到环境来源。
6. 形成 `dimension_evaluations` 与 `gap_analysis`，区分已对齐、README ahead、baseline ahead、冲突、歧义和前提缺口。
7. 给出 `iteration_direction`，表达方向语义而不是 Task 写入或执行排序。
8. 输出 `coordinator_handoff`，明确 Coordinator 后续维护 Task Pool 时应检查的候选差距、冲突、依赖和开放问题。
9. 填写 `open_questions` 与 `confidence_and_limits`，把不确定性保留在报告中。

## Manager 评估信号结构

输出应使用稳定 Markdown 结构，字段名保持一致，供 Coordinator 阅读和引用。这个结构只是评估信号的表达格式；持久化事实源仍是 `dimensions` 与 `dimension_evaluations`。

```markdown
# Manager Evaluation Signal

baseline_ref:
- latest_origin_main: <最新 baseline 引用，例如 origin/main 或已知 commit>
- evaluated_at: <评估时间或上下文>

readme_target_summary:
- <README 目标的 3-7 条摘要>

dimensions:
- name: <维度名称>
  goal: <该维度要逼近的 README 目标状态>
  why_it_matters: <为什么这个维度覆盖 README 目标>
  evaluation_lens: <如何用它观察 baseline 与差距>
  evaluation_method: <如何评估该维度；应能映射到 dimensions.evaluation_method>
  quantitative_standard: <定量评分标准>
  qualitative_standard: <定性描述标准>

baseline_facts:
- source: <README / code / docs / tests / issue / observability / dimension_history>
  fact: <可追溯事实>
  evidence: <路径、命令、Issue、Task 或其他来源>

dimension_evaluations:
- dimension: <对应维度名称或 id>
  quantitative_score: <基于该维度评分标准的分数或无法评分说明>
  qualitative_assessment: <基于该维度描述标准的评估>
  evidence: <支持评估的事实>

gap_analysis:
- dimension: <对应维度名称或 id>
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
  reason: <与 README、baseline、可观测事实或开放问题的关系>
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
- `dimensions` 应解释评估维度，不只是列模块名；每个维度都应包含目标、评估方法、定量评分标准和定性描述标准。
- `baseline_facts` 必须区分事实来源；没有证据的判断只能进入 limits。
- `dimension_evaluations` 必须按维度逐一评估最新 baseline，并同时包含定量评分和定性描述；无法评分时说明证据限制。
- `gap_analysis.status` 可使用建议标签，但不要把标签扩展成 API 枚举承诺。
- `iteration_direction` 只表达方向，不包含 Task Spec、执行步骤或开发排期。
- `coordinator_handoff.suggested_route` 只是给 Coordinator 的阅读提示，不是自动路由协议。
- `open_questions` 只给 Director 澄清目标层问题，不用于向 Developer 派发澄清任务。
- `confidence_and_limits` 必须记录环境缺失与判断边界，即使 confidence 为 high。

## 自检清单

- [ ] 是否默认从环境收集输入，而不是先问用户。
- [ ] 是否只在 README 目标不清晰且阻止评估时输出 `open_questions`。
- [ ] 是否明确 baseline 是最新 `origin/main`，并排除了未合并分支事实。
- [ ] 是否定义或维护了维度，而不是只复述 README 或列任务。
- [ ] 是否为每个维度设定了定量评分标准和定性描述标准。
- [ ] 是否逐一形成了包含定量评分和定性描述的维度评估。
- [ ] 是否把可观测性资料和 Issues 放在方向层处理，而不是直接生成 Task Pool 写入。
- [ ] 是否只输出 Manager 评估信号 / 方向信号，没有直接创建 Task 或修改代码。
- [ ] 是否把 Coordinator handoff 写成后续 Task Pool 维护输入，而不是 batch operations 本身。
- [ ] 是否避免把 Manager 评估信号解释成独立 API schema、SQLite schema 或自动化协议。
