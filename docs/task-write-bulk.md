# Task Write Bulk 输出契约

## 定位

`Task Write Bulk` 是 AIM Coordinator 面向人工阅读与审批的 Task Pool 写入意图列表。它把 Manager 评估信号、最新基线事实、当前未完成 Task Pool 与 rejected Task 反馈，收敛成一组可检查、可排序、可路由的候选写入。

这个契约只定义批准前的 Coordinator 输出形态。它不是服务端 API schema、不是 SQLite schema、不是后台自动执行协议，也不承诺存在 bulk write endpoint。

## 适用边界

Coordinator 使用 `Task Write Bulk` 表达两类意图：

- `Create`：候选新增一个 AIM Task。
- `Delete`：候选从未完成 Task Pool 视图中移除一个明确的未完成 Task。

`Task Write Bulk` 的消费者是 Director、Coordinator 复核者，以及后续验证 / 创建 / 删除流程。它用于审批与路由，不直接创建 Task、不删除 Task、不执行 Developer 生命周期。

## 顶层结构

Coordinator 输出必须是一个 Markdown 中可读的列表，列表中的每个条目必须包含：

- `id`：本次 bulk 内唯一的临时标识，只用于本次输出的依赖引用。
- `action`：只能是 `Create` 或 `Delete`。
- `depends_on`：本次 bulk 内必须先完成的条目 `id` 列表；没有依赖时写空列表。
- `reason`：为什么这个写入能推进最新基线，或为什么旧 Task 应从未完成视图移除。
- `source`：触发依据，例如 Manager 差距、最新基线事实、Task Pool 冲突、rejected Task 失败原因。

`depends_on` 与 `Create.dependencies` 含义不同。`depends_on` 是本次人工批准后处理 bulk 条目的顺序约束；`Create.dependencies` 是新 Task 落库时携带的 Task 软依赖提示。

## Create 条目

`Create` 条目表示“批准后可以进入候选 Task 创建流程”，不是已经创建 Task。

每个 `Create` 条目必须包含：

- `candidate_task_spec`：完整五段式候选 Task Spec，结构必须符合 `docs/task-spec.md`，不能只是标题、方向建议或实现提示。
- `project_path`：目标仓库路径。
- `dependencies`：候选 Task 创建时应携带的 Task 依赖；如果没有依赖，写空列表。
- `verification_route`：固定说明批准后先经 `aim-verify-task-spec` 独立校验，通过后再进入 `aim-create-tasks`。

`Create` 的判断依据应来自可引用事实：从 `dimensions` 与 `dimension_evaluations` 派生的 Manager 评估差距、最新基线的可观测事实、当前 Task Pool 未覆盖的缺口，或 rejected Task 暴露出的可修复前提缺口。

## Delete 条目

`Delete` 条目表示“批准后可以移除一个明确的未完成 Task Pool 项”，不是删除历史记录。

每个 `Delete` 条目必须包含：

- `target_task_id`：要删除的未完成 Task。
- `delete_reason`：删除依据，例如已被最新基线吸收、被更清晰的替代 Task 覆盖、与当前 README 或 Manager 方向冲突、或已不可执行。
- `replacement`：如果由新 `Create` 替代，写替代条目的 `id`；没有替代时写 `null`。

`Delete` 只能作用于明确的未完成 Task。已 `resolved` 或 `done = 1` 的 Task 属于历史结果，不应通过 `Task Write Bulk` 删除来维护 Task Pool 视图。

## 依赖顺序

批准后处理 `Task Write Bulk` 时，必须按 `depends_on` 的拓扑顺序执行：

- `depends_on` 只能引用同一个 `Task Write Bulk` list 中的条目 `id`。
- 一个条目的依赖未完成前，不得处理该条目。
- 当 `Delete` 依赖某个替代 `Create` 时，必须先完成替代 Task 的验证与创建，再删除旧 Task。
- 当 `Create` 依赖某个失效 Task 的删除时，必须先确认删除目标和删除原因，再进入候选 Spec 校验。
- 如果依赖关系形成环，整个 bulk 不可执行，必须返回 Coordinator 重写，不能猜测顺序。

这些顺序规则只约束人工批准后的处理流程，不改变 Task 数据模型中 `dependencies` 的软依赖语义，也不要求服务端自动解释或执行 bulk。

## 批准后路由

用户批准 `Task Write Bulk` 后：

1. 按 `depends_on` 拓扑顺序处理条目。
2. 对每个 `Create`，先派发独立 Sub Agent 使用 `aim-verify-task-spec` 校验 `candidate_task_spec`。
3. 只有校验结论为可继续推进时，才使用 `aim-create-tasks` 创建 AIM Task。
4. 对每个 `Delete`，只在目标 Task 与删除原因明确时执行相应 Task Pool 写入流程。
5. 如果任一 `Create` 校验失败，停止执行依赖它的后续条目，并把失败原因反馈给 Coordinator 重新规划。

Coordinator 不得在批准后路由阶段接管 Developer 生命周期。已创建的 Task 后续执行必须由 Developer 规则覆盖。

## 禁止事项

- 禁止把 `Task Write Bulk` 解释成服务端 API schema、SQLite schema、OpenAPI contract 或后台自动执行协议。
- 禁止实现或假定存在 bulk write API。
- 禁止由 Coordinator 直接调用 `POST /tasks`。
- 禁止跳过用户批准、跳过 `aim-verify-task-spec`，或把候选 Task Spec 当作已创建 Task。
- 禁止把 README、Manager 评估信号或开放问题不清晰的内容包装成“澄清类 Developer Task”。
- 禁止删除已完成、已 resolved 或 `done = 1` 的历史 Task。
- 禁止在缺少 `target_task_id`、`delete_reason` 或替代关系说明时执行 `Delete`。
- 禁止修改 Developer 生命周期规则，或把 Coordinator 输出升级成真实调度器职责。

## 最小示例

```markdown
# Task Write Bulk

- id: create-contract-doc
  action: Create
  depends_on: []
  reason: Manager 评估信号指出 Coordinator 输出缺少可引用的 Task Write Bulk 审批契约。
  source: Manager gap: coordinator output is not independently verifiable
  candidate_task_spec: |
    # 为 Coordinator Task Write Bulk 建立可验证的输出契约说明

    ## Assumptions
    ...
  project_path: /path/to/repo
  dependencies: []
  verification_route: 批准后先经 aim-verify-task-spec 独立校验，通过后再进入 aim-create-tasks。

- id: delete-obsolete-task
  action: Delete
  depends_on: [create-contract-doc]
  reason: 旧未完成 Task 已被更小、更准确的候选 Task 覆盖。
  source: Task Pool conflict after latest baseline review
  target_task_id: 00000000-0000-0000-0000-000000000000
  delete_reason: 旧 Task 目标与当前 Manager 方向冲突，且替代 Task 已覆盖可执行增量。
  replacement: create-contract-doc
```

示例只展示 Coordinator 的审批产物形态，不表示存在同名 API、数据库字段或自动执行器。
