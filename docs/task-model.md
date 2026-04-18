# Task Data Model

## 定位

`Task` 是调度器中的基本执行单元，也是一个基线迭代增量。

一条 `Task` 的职责不是“完成某个大功能的一部分”，而是：以“当前最新基线 + 一个 `Task Spec`”为输入，在无人值守的前提下，推进出一个独立 PR，并最终让基线向前迭代一步。

因此，`Task` 的数据模型只应该持久化编排器必须记住的事实，而不应该把 GitHub、Git、本地工作区中的所有动态状态完整镜像进 SQLite。

这意味着：

- SQLite 负责保存调度真相。
- GitHub PR 状态、checks、mergeability 等平台状态按需查询。
- 最新基线是否满足 `Task Spec` 的 `Assumptions`，通过运行时验证得出，而不是靠静态字段预先推断。

## 设计原则

### 1. 最小持久化

只持久化跨 Session 协调所必须的信息。不保存可以廉价实时查询、且复制后容易过期的平台动态镜像。

### 2. 软依赖，硬验证

`dependencies` 是一个软依赖提示集合，表达“当前哪些 Task 最可能让这个 Task 变 ready”。

这个字段可以由规划器提供初始值，但后续允许执行层或基线验证流程完全重写。

Task 在运行时是否真正可以继续推进，不取决于依赖是否全部完成，而取决于最新基线能否通过该 `Task Spec` 的 `Assumptions` 验证。

### 3. Task 可以反复等待与重试

Task 不是“等依赖都完成才启动”的一次性流程，而是可能多次经历：

`基线验证 -> 等待 -> 再验证 -> 实现 -> 再验证 -> 出站`

因此数据模型必须容纳运行时发现的真实等待状态，而不仅仅是规划阶段写下的依赖图。

### 4. 不把执行历史强行事件溯源化

当前模型不追求完整事件溯源，不引入 `TaskEvent` 表。恢复时优先依赖：

- `task_spec`
- 当前最新基线
- 当前 `session_id`
- 当前 `worktree_path`
- 当前 `pull_request_url`
- 缓存型的 `status`

## 一条 Task 的生命周期

从编排视角看，一条 `Task` 大致经历以下阶段：

1. 被规划器创建并写入 SQLite。
2. 被分配给一个 Task Session。
3. 针对最新基线做 `Assumptions` 验证。
4. 若 `Assumptions` 暂时不成立，则进入等待，并更新当前的软依赖提示。
5. 若验证判定 Spec 已不再适用、存在重大歧义，或无法靠后续基线推进自然恢复，则失败上报并终止。
6. 若验证通过，则创建 WorkTree 并推进实现、测试、PR。
7. 跟进 checks / review / merge。
8. 清理 WorkTree，刷新本地基线。
9. 以成功或失败的终态结束。

这里有一个关键点：

- 规划层的 `dependencies` 只是“高质量初始猜测”。
- 运行层真正的阻塞原因，是 `Assumptions` 是否成立；而 `Assumptions` 不成立并不自动等于失败。

## 推荐字段列表

当前推荐的 `tasks` 表字段如下：

| 字段               | 类型                | 可空 | 含义                                                    |
| ------------------ | ------------------- | ---- | ------------------------------------------------------- |
| `task_id`          | `TEXT` / UUID       | 否   | Task 的全局唯一标识                                     |
| `task_spec`        | `TEXT`              | 否   | 保存在 SQLite 中的 Markdown 格式 Task Spec              |
| `session_id`       | `TEXT`              | 是   | 当前绑定到该 Task 的 Agent Session ID                   |
| `worktree_path`    | `TEXT`              | 是   | 当前 Task 使用或曾使用的 Git WorkTree 绝对路径          |
| `pull_request_url` | `TEXT`              | 是   | 该 Task 对应的 GitHub PR URL                            |
| `dependencies`     | `TEXT` / JSON Array | 否   | 当前候选前置 Task ID 列表，规划器可初始化，执行层可覆盖 |
| `done`             | `INTEGER` / BOOLEAN | 否   | 该 Task 是否已经进入终态                                |
| `status`           | `TEXT`              | 否   | 该 Task 当前编排状态的缓存值                            |
| `created_at`       | `TEXT` / timestamp  | 否   | Task 写入 SQLite 的时间                                 |
| `updated_at`       | `TEXT` / timestamp  | 否   | 该 Task 最近一次被更新的时间                            |

下面分别说明每个字段的语义。

## 字段详解

### `task_id`

`task_id` 是 Task 的全局唯一标识。

它的作用是：

- 作为 SQLite 中的主键。
- 作为其他 Task 在 `dependencies` 中引用该 Task 的依据。
- 作为 Task Session、日志、失败上报、调度决策之间的统一锚点。

要求：

- 一旦创建，不得修改。
- 不承载业务含义。
- 不依赖 WorkTree 名称、分支名或 PR 编号推导。

### `task_spec`

`task_spec` 是一条 Task 的核心语义载体。

它保存的是 Markdown 格式的 `Task Spec` 文本，而不是路径引用。其格式定义见 `docs/task-spec.md`。

之所以直接把 Spec 内容放在 SQLite 中，而不是只存一个 repo 文件路径，是因为：

- Task 在被批准并落库时，还不一定已经有自己的 WorkTree。
- 规划阶段不希望把大量尚未实现的 spec / implementation plan 提前写进基线。
- 调度器需要在 Task 尚未启动实现前，就能读取这份 Spec 来决定如何派发。

`task_spec` 应被视为：

- 该 Task 的执行合同。
- 运行时 `Assumptions` 验证的依据。
- 失败上报和恢复上下文时的主要语义来源。

### `session_id`

`session_id` 表示当前绑定到该 Task 的 Agent Session ID。

它的含义是“当前执行主体是谁”，而不是“历史上所有执行过该 Task 的 Session 列表”。

因此：

- 一个 Task 在同一时刻只能有一个当前 `session_id`。
- 若原 Session 不可用，后续可以把该字段切换为新的 Session ID。
- 该字段为空，表示当前尚未分配 Session，或 Session 已释放但 Task 仍未终态结束。

`session_id` 的主要用途：

- 调度器判断该 Task 是否已有执行主体。
- Session 空闲时决定是否继续推进该 Task。
- 在恢复执行时定位应当继续使用的上下文。

### `worktree_path`

`worktree_path` 是该 Task 使用或曾使用的 Git WorkTree 绝对路径。

它的作用是：

- 标识该 Task 的隔离执行环境。
- 在 Task 运行时指向实际存在的 WorkTree。
- 在 Task 成功结束后，仍可作为“原本应清理的路径”的记录存在，即使该目录已被删除。

这个字段为空，通常表示：

- Task 还没有通过早期基线验证，尚未真正进入开发执行。
- 或 Task 尚未创建 WorkTree。

注意：

- `worktree_path` 是路径真相，不是“WorkTree 当前是否存在”的真相。
- WorkTree 是否仍存在，应在需要时直接检查文件系统。

### `pull_request_url`

`pull_request_url` 是该 Task 最终提交出来的 PR URL。

它是 Task 与 GitHub 平台状态之间的连接点。

它的主要用途：

- 查询 PR 是否已创建。
- 查询 PR 是否已 merge。
- 查询后续 checks / review / auto-merge 相关状态。
- 在 Task 完成后保留可追溯链接。

这个字段为空，表示该 Task 尚未成功进入“已有 PR”的阶段。

注意：

- `pull_request_url` 应持久化，因为它是跨 Session 协调的关键事实。
- 但 PR 的动态状态本身不应镜像存入 SQLite，而应通过 `gh` 按需查询。

### `dependencies`

`dependencies` 保存的是当前候选前置 Task ID 列表，推荐使用 JSON Array 形式。

它的初始值可以由规划器写入，但后续允许执行层或基线验证流程完全覆盖更新。

这个字段表达的是：

- 当前这个 Task 认为，哪些其他 Task 最可能推动自己的 `Assumptions` 成立。
- 哪些 Task 的基线增量目前最值得被视为候选前置条件。

它不表达：

- 启动许可。
- 必须严格等待的硬门禁。
- 稳定不变的规划图边。

因此：

- 一个 Task 即使 `dependencies` 未全部终态结束，只要最新基线已经满足其 `Assumptions`，仍然可以继续推进。
- 一个 Task 即使依赖都已完成，也仍可能因为 `Assumptions` 不成立而继续等待或失败。

`dependencies` 更像是：

- 调度器的软提示输入。
- 执行层当前对“我在等谁”的最佳猜测。
- 规划器给出的初始 DAG 线索，但不是最终真相。

推荐约束：

- 写回时应覆盖当前完整判断，而不是只做 append。
- 不应把自己写进自己的 `dependencies`。
- 即使出现环，也不应被视为死锁，因为它本质上只是软提示。
- `[]` 表示当前没有明确的候选前置 Task，或者当前只能等待基线进一步变化后再次验证。

### `done`

`done` 表示该 Task 是否已经进入终态。

这里的“终态”包括两类：

- 成功终态：PR 已 merge，WorkTree 已清理，本地基线刷新完成。
- 失败终态：该 Task 已明确不再继续推进，需要上层 AI 重新规划、重写 Task 或重新派发。

因此：

- `done = false` 表示该 Task 仍可继续被调度推进。
- `done = true` 不等于成功，而仅表示“这条 Task 生命周期结束了”。

### `status`

`status` 是该 Task 当前编排状态的缓存结果。

之所以需要这个字段，是因为虽然很多状态理论上都可以通过 AI、Git、GitHub、Session 上下文推断出来，但那种推断成本较高、并且涉及异步动作，不适合作为调度器的快速查询基础。

因此 `status` 是缓存，不是唯一事实源。

推荐状态值如下：

- `created`: Task 已写入 SQLite，但尚未真正开始推进。
- `waiting_assumptions`: 最新基线尚未满足该 Task Spec 的 `Assumptions`。
- `running`: Task 当前正在推进，或已通过早期验证并处于开发执行中。
- `outbound`: Task 处于 commit / fetch / rebase / push / create PR 相关阶段。
- `pr_following`: PR 已存在，正在跟进 checks / review / merge。
- `closing`: PR 已终态，正在清理 WorkTree 或刷新本地基线。
- `succeeded`: Task 已成功结束。
- `failed`: Task 已失败结束。

推荐搭配关系：

- `done = false` 时，`status` 应处于非终态。
- `done = true` 时，`status` 应为 `succeeded` 或 `failed`。

其中：

- `waiting_assumptions` 表示“当前还不 ready，但后续基线变化后仍值得再验一次”。
- `failed` 表示“这份 Task Spec 已经不能靠自然的基线推进继续执行，需要上层规划器介入”。

### `created_at`

`created_at` 记录该 Task 被写入 SQLite 的时间。

它主要用于：

- 调试和排查。
- 观察队列堆积。
- 分析某类 Task 的等待时间与生命周期。

### `updated_at`

`updated_at` 记录该 Task 最近一次被修改的时间。

它主要用于：

- 判断一个 Task 最近是否仍在被积极推进。
- 辅助发现长期无人更新、可能需要重新唤醒或重新规划的 Task。
- 为调度器提供简单的排序依据。

## 字段之间的关系

### `dependencies` 与 `status`

- `dependencies` 表达“当前我更应该盯着谁”。
- `status` 表达“我当前处于等待、推进还是终态”。

前者用于推断哪些基线变化更值得触发重试，后者用于判断当前是否仍应被调度推进。

### `session_id` 与 `status`

- `session_id` 表达“当前谁在执行”。
- `status` 表达“它当前处于什么阶段”。

二者都不能单独还原 Task 全貌，但组合起来可以支撑大多数调度决策。

### `worktree_path` 与 `pull_request_url`

- `worktree_path` 对应本地隔离执行环境。
- `pull_request_url` 对应远端出站结果。

它们共同构成 Task 从本地实现到远端合并的桥梁。

### `done` 与 `status`

- `done` 用于快速判断一个 Task 是否还需要继续被调度。
- `status` 用于表达它当前具体处在哪个编排阶段。

`done` 是粗粒度终态判断，`status` 是细一些的缓存视图。

## 明确不建模的字段

当前模型中，以下字段不建议持久化到 SQLite：

- `spec_commit`
- `base_commit`
- `next_run_after`
- PR checks 的完整状态镜像
- review comments 的完整镜像
- mergeability 的缓存值
- 当前 `origin/main` 的 commit 镜像
- GitHub 平台上可以直接查询的其他动态状态副本

原因是：

- 它们要么信息量不足。
- 要么在并行基线推进下很快过期。
- 要么可以在真正需要时廉价查询。

特别是 `spec_commit` / `base_commit`：

- Task 是否仍然适用，不靠“它当初基于哪个 commit”来判断。
- 而靠“当前最新基线是否还能通过这份 `Task Spec` 的 `Assumptions` 验证”来判断。

特别是 `next_run_after`：

- 时间流逝本身不是有效的调度信号。
- 如果基线没有变化，仅仅因为过了一段时间就重试，不能反映真实的可推进条件。
- 更合理的重试触发应来自基线变化、相关 Task 推进、Session 空闲、PR 状态变化等外部事实，而不是一个预先写死的时间戳。

## 当前模型的边界

这是一份面向当前调度器目标的最小可用模型。

它的特点是：

- 支持并行 Task 调度。
- 支持软依赖 DAG。
- 支持执行层动态重写软依赖。
- 支持 Task Session 多次被基线验证卡住、再恢复推进。
- 不引入完整事件溯源和平台状态镜像。

如果后续查询压力变大，可能需要把 `dependencies` 拆成关系表；但在当前阶段，单表 + JSON 字段是更务实的起点。
