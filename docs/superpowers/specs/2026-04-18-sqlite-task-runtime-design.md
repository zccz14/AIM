# Task Runtime + SQLite + OpenCode Plugin 自动推进闭环设计说明

## 背景 / 定位

当前仓库已经明确了两件事：

1. `Task` 是调度器的基本执行单元，外部真相应保存在 SQLite，而不是散落在 Session 内存、Git 状态或 GitHub 平台状态里。
2. 一条 `Task` 的目标不是“被某个 Agent 看见”，而是从写入队列开始，被无人值守地持续推进，直到进入成功或失败终态。

本次设计解决的是第一刀可落地闭环：外部系统只需向 `<project_dir>/aim.sqlite` 写入 `task_id` 与 `task_spec`，随后由 OpenCode Plugin 自动认领、恢复、推进、写回，直到该 Task 进入终态并表现为 `done = true`。

这里的关键定位不是做一个通用任务平台，也不是先抽象一个大而全的 runtime core，而是先把当前仓库内“Task 如何从 SQLite 被真正推进起来”这条主路径打通，并把运行时边界尽量压缩在 OpenCode Plugin 内。

## 目标

1. 固定使用 `<project_dir>/aim.sqlite` 作为当前 project 的 Task SQLite 路径，不向 Agent 暴露 `dbPath` 概念。
2. 明确 SQLite 仍是调度真相源，Plugin 只是运行时桥接层，不复制一套独立真相。
3. 明确运行时只自动完成基础 bootstrap：必要时创建 `<project_dir>/aim.sqlite`，并在 `tasks` 表不存在时自动建表。
4. 通过 OpenCode Plugin 暴露最小 tool 集，支撑 Task 的认领、查询、状态写回与运行时上下文绑定。
5. 让所有 task-bound tools 通过当前 tool context 中的 `sessionID` 反查绑定 Task，而不是要求 Agent 显式传入 `task_id`。
6. 让 `dispatch-tasks` 作为统一调度入口，负责扫描未终态 Task、恢复已有 Session、在需要时重新认领，并避免对 busy session 重复发 prompt。
7. 让外部调用方只承担“写入 Task”职责，不需要额外理解 session 恢复、worktree 协调、PR URL 写回或终态判定细节。
8. 把第一刀范围收敛在单 project、纯插件闭环，不引入额外 daemon、复杂 lease、多租户隔离或跨 project 联动。

## 非目标

1. 不支持跨 project 联动，不扫描多个仓库，也不在本次设计中引入 project registry。
2. 不向 Agent 暴露数据库路径、数据库 schema 管理职责或任何 SQLite 实现细节。
3. 不在本次设计中拆出独立的 task runtime core package，供多种宿主复用。
4. 不引入仓库外常驻 daemon、消息队列、HTTP 调度服务或复杂 watcher 进程。
5. 不设计复杂 lease、心跳抢占、分布式锁或多实例并发仲裁协议。
6. 不在本次设计中扩展到多租户、多工作目录池或跨 Session 的复杂优先级调度策略。
7. 不在本次设计中增加除题述六个 tools 之外的额外插件接口。

## 核心概念与边界

### 1. SQLite 是唯一调度真相源

`tasks` 表中的 `task_id`、`task_spec`、`session_id`、`worktree_path`、`pull_request_url`、`status`、`done`、`updated_at` 等字段，仍然是调度层需要记住的事实。Plugin 读取这些事实、帮助推进流程，并把关键结果写回 SQLite；但 Plugin 自己不维护另一份持久状态。

因此：

- Task 是否未结束，以 `done = false` 为准。
- Task 当前执行主体是谁，以 `session_id` 为准。
- Task 当前对外可见阶段，以 `status` 为准。
- worktree 路径和 PR URL 是否已经建立，以 SQLite 当前字段为准。

GitHub checks、PR mergeability、session busy/idle 等动态状态仍是运行时按需查询的外部事实，不镜像为另一套持久调度模型。

### 2. Plugin 是运行时桥，不是第二调度器

本次 Plugin 的职责是：

1. 把 SQLite 中的待推进 Task 与 OpenCode Session 绑定起来。
2. 把 Task 快照转换成对 Session 可执行的 prompt。
3. 把 Session 在推进过程中产生的关键结果写回 SQLite。
4. 在 Session 可继续时恢复推进，在 Session 不可用时允许重新认领。

Plugin 不负责重新定义 Task 语义，也不替代 SQLite 作出持久化真相判断。它是“把调度真相转成 Agent 可执行上下文”的运行时层。

### 3. Agent 只看 Task 快照，不看数据库细节

发给 Session 的 prompt 只能暴露该 Task 的快照，例如：

- `task_id`
- `task_spec`
- 当前 `status`
- 当前已记录的 `worktree_path`
- 当前已记录的 `pull_request_url`

必要时可以包含少量运行期上下文提示，例如“你当前在处理一条已绑定的 Task”，但不能向 Agent 暴露 SQLite 文件路径、表结构、SQL 更新规则或“你需要回写某张表”的数据库实现细节。

### 4. 当前 project 边界固定

本版所有读写都固定发生在当前 project 下的 `<project_dir>/aim.sqlite`。外部系统只需要知道“把 Task 写到当前项目数据库里”，而不需要选择数据库路径。这样可以把第一刀范围限制在单 project 内，避免系统刚起步就暴露过多可变配置面。

运行时在进入调度前只负责最小 bootstrap：若 `<project_dir>/aim.sqlite` 尚不存在，则自动创建该文件；若数据库中还没有 `tasks` 表，则自动按本设计要求创建该表。该自动化只覆盖“库文件存在”和“基础表存在”两件事，不扩展为 schema 修复或迁移机制。

## 推荐方案与备选方案比较

### 推荐方案：纯插件闭环

推荐把“扫描 SQLite、认领 Task、向 Session 发 prompt、把状态写回 SQLite”完整收敛在 OpenCode Plugin 内，形成纯插件闭环。

理由如下：

1. 当前唯一必须打通的是单 project 内的自动推进链路，Plugin 已经天然处于“能看到 Session、能发 prompt、能暴露 tools”的最短路径上。
2. SQLite 仍然保留真相源角色，因此 Plugin 闭环不会导致状态失真，只是把运行时桥接做薄、做近。
3. 最小 tool 集足以支撑第一刀闭环，外部只写 Task，不需要额外协调进程、服务或协议。
4. 把运行时边界放在 Plugin 内，可以最早验证“session 绑定 + 自动恢复 + 状态写回”这组核心假设，而不先投入到更抽象的可复用架构。

### 备选方案一：先拆 runtime core

可选路径是先把调度与 Session 协调逻辑抽成独立 runtime core，再让 Plugin 只做一层薄适配。

本次不选，原因是：

1. 当前尚未证明稳定边界在哪里，过早抽 core 很容易把 Session 语义、宿主能力和 SQLite 约束一起抽象错位。
2. 第一刀真正需要验证的是端到端闭环是否成立，而不是多宿主复用能力。
3. 先拆 core 会引入额外接口面、生命周期契约和测试成本，但并不能降低当下单 project 落地复杂度。

### 备选方案二：先做外部 daemon

另一条路径是让 SQLite 被外部 daemon 持续扫描，再由 daemon 调 OpenCode 或其他宿主完成推进。

本次不选，原因是：

1. daemon 会立刻引入进程管理、部署方式、日志持久化、重启恢复和权限边界等额外系统问题。
2. 当前目标并不是服务化调度，而是尽快打通当前仓库中的无人值守主路径。
3. 在单 project 场景下，daemon 提供的能力增量远小于它带来的复杂度；很多问题只是从 Plugin 内部复杂度转移成跨进程协调复杂度。

结论是：第一刀以纯插件闭环作为推荐方案，先验证最短主路径；待该路径稳定后，再决定是否有必要继续抽 core 或演化为外部服务。

## 插件运行时架构

整体运行时分为四层：

1. **外部写入层**：外部系统向 `<project_dir>/aim.sqlite` 写入 `task_id` 与 `task_spec`，其余字段由运行时逐步补齐。
2. **SQLite 调度层**：`tasks` 表保存当前 Task 的真相，包括绑定的 `session_id`、状态字段与运行产物路径。
3. **Plugin 运行时层**：Plugin 提供调度入口、Task 绑定解析、状态写回与上下文补全。
4. **Session 执行层**：OpenCode Session 接收 Task 快照 prompt，按仓库规范推进 worktree、提交、PR、跟进与收尾。

关键数据流如下：

1. 外部写入新 Task，初始为 `done = false`。
2. `dispatch-tasks` 扫描所有 `done = false` 的 Task。
3. 对已绑定 `session_id` 的 Task，Plugin 先尝试继续该 Session；如果 Session 不存在或不可恢复，则允许重新认领。
4. 对未绑定 `session_id` 的 Task，Plugin 自动创建新 Session，回写 `session_id`，并投递首条 prompt。
5. Session 在推进过程中通过 task-bound tools 回写 `status`、`worktree_path`、`pull_request_url`。
6. 当 Task 被标记为 `succeeded` 或 `failed` 时，Plugin 自动同步 `done = true`，形成终态闭环。

该架构的关键约束是：Task 的执行上下文绑定在 Session 上，而不是绑定在每次 tool 调用显式携带的 `task_id` 上。这样可以让 Agent 在 task-bound 工具层面始终面向“我当前在处理的那条 Task”，减少参数漂移和误写风险。

## Tool 契约

本次插件只暴露以下最小 tool 集。

### 1. `dispatch-tasks`

定位：统一调度入口。

职责：

1. 扫描 SQLite 中所有 `done = false` 的 Task。
2. 优先尝试恢复已有 `session_id` 绑定的 Task。
3. 当绑定 Session 不存在时，允许重新认领该 Task。
4. 对尚未绑定 `session_id` 的 Task 自动创建 Session 并投递首条 prompt。
5. 对已存在且 busy 的 Session 不重复投递 prompt。

返回结果应至少能说明本次调度对每条 Task 的处理结果，例如：继续已有 Session、跳过 busy Session、重新认领、创建新 Session、无可调度任务。

### 2. `list-processing-tasks`

定位：观察当前处理中 Task 的最小只读窗口。

最少返回字段：

- `task_id`
- `status`
- `session_id`
- `worktree_path`
- `pull_request_url`
- `updated_at`

这里的“processing”指当前 `done = false` 且已经进入运行态观察范围的 Task。该工具的目标是提供运维和排查视图，而不是暴露完整数据库行。

### 3. `get-current-task`

定位：返回当前 tool context 对应 Session 绑定的 Task 快照。

该工具不接受 `task_id` 参数。Plugin 必须通过当前 context 中的 `sessionID` 反查 SQLite 中绑定到该 Session 的那条 Task，并返回给 Agent 可见的任务快照。

返回内容应包含推进当前 Task 所需的最小上下文，例如：`task_id`、`task_spec`、当前 `status`、当前 `worktree_path`、当前 `pull_request_url`。

### 4. `mark-task-status`

定位：让当前 Session 对绑定 Task 写回阶段状态。

参数约束：

- 仅允许一个参数：`status`

写回规则：

1. Plugin 自动维护 `updated_at`。
2. 当 `status` 为 `succeeded` 或 `failed` 时，自动写 `done = true`。
3. 其他状态统一写 `done = false`。

该工具不接受 `task_id`、`done`、`updated_at` 等参数，避免 Agent 直接操纵终态布尔值或时间戳。

### 5. `setup-worktree-path`

定位：把当前 Session 实际使用的 worktree 路径写回绑定 Task。

该工具的目标是让 SQLite 真相及时获得“当前 Task 的隔离执行环境在哪里”，便于恢复、观察与后续排查。

### 6. `setup-pull-request-url`

定位：把当前 Session 创建或跟进的 PR URL 写回绑定 Task。

该工具的目标是让 SQLite 记录远端出站结果，并为后续 PR 跟进、状态恢复和人工排查保留稳定锚点。

## Task 绑定规则

所有 task-bound tools 都遵循同一条绑定规则：

1. 从当前 tool context 读取 `sessionID`。
2. 使用该 `sessionID` 查询 SQLite 中 `session_id` 等于它的 Task。
3. 若能唯一定位，则该 Task 视为当前 Session 的绑定 Task。
4. 若不存在绑定 Task，工具应显式报错，而不是要求 Agent 额外传 `task_id`。
5. 若出现多条 Task 绑定同一 `session_id`，应视为运行时数据异常并显式失败上报。

这样设计的原因是：Task 绑定属于运行时上下文真相，而不是让 Agent 每次手工传参的应用层协议。只要 Session 已绑定 Task，工具就应自动找到正确目标。

## `dispatch-tasks` 调度流程

`dispatch-tasks` 是本次闭环的唯一调度入口，推荐流程如下：

1. 读取 `<project_dir>/aim.sqlite` 中所有 `done = false` 的 Task。
2. 按稳定顺序遍历这些 Task；排序策略可以简单，以 `updated_at` 或创建顺序为主，但不在本次设计中引入复杂优先级系统。
3. 对每条 Task，先检查其是否已有 `session_id`。
4. 若已有 `session_id`，先查询该 Session 是否仍存在。
5. 若 Session 存在且当前 busy，则跳过，不重复发送 prompt。
6. 若 Session 存在且可继续推进，则向该 Session 发送下一次跟进 prompt。
7. 若 Session 不存在，则允许重新认领：创建新 Session，更新 SQLite 中的 `session_id`，并发送首条恢复 prompt。
8. 若 Task 尚未绑定 `session_id`，则直接创建新 Session、写回 `session_id` 并发送首条 prompt。

这里有两个关键行为要求：

1. “继续已有 Session”优先于“重新认领”。只要旧 Session 仍可用，就尽量利用其上下文连续性。
2. busy Session 不重复 prompt。Plugin 必须把“当前是否适合再发一次消息”当成调度条件之一，避免对同一 Task 并发注入多条推进指令。

该流程不依赖外部 daemon。每次显式调用 `dispatch-tasks`，都等价于触发一次“扫描并尽力推进所有未终态 Task”的调度轮次。

## 状态写回规则

本次设计把状态写回收敛到最小协议，避免 Agent 直接操作过多持久字段。

### 1. `status` 是 Agent 唯一可显式写入的阶段字段

Agent 只能通过 `mark-task-status(status)` 写入当前阶段，例如：

- `created`
- `running`
- `outbound`
- `pr_following`
- `closing`
- `succeeded`
- `failed`

是否继续保留 `waiting_assumptions` 这类中间状态，由 SQLite 模型与实现阶段决定；本 spec 的硬约束是：无论使用哪些非终态值，`mark-task-status` 仍然只接收 `status` 一个参数。

### 2. `done` 由插件派生，不由 Agent 直接写入

写回语义固定为：

- `status in {succeeded, failed}` -> `done = true`
- 其他状态 -> `done = false`

这样可以避免 Agent 产生“状态写成 running，但 done 误设为 true”这类自相矛盾状态。

### 3. `updated_at` 由插件自动维护

任一写回动作发生时，Plugin 自动更新时间戳。Agent 不需要也不应该感知时间戳细节。

### 4. 结构化运行产物单独写回

`worktree_path` 与 `pull_request_url` 分别通过专用工具写回，而不是塞进 `mark-task-status`。这样可以保持 `status` 写回协议单一，也让观察视图更稳定。

## 自动跟进 Prompt 策略

### 1. 首条 prompt 只暴露 Task 快照

新认领 Task 时，Plugin 发送给 Session 的首条 prompt 应包含：

1. 当前绑定的 Task 标识与快照。
2. `task_spec` 原文或必要的完整内容。
3. 当前已知状态、worktree 路径与 PR URL（若已有）。
4. 为恢复当前 Task 推进所必需的最小上下文提示。

首条 prompt 不暴露 SQLite 路径、表名、SQL 规则、字段更新语义等数据库实现细节。

### 2. 跟进 prompt 仍以 Task 快照为中心

后续由 `dispatch-tasks` 对已有 Session 发出的跟进 prompt，也应继续围绕“当前这条 Task 需要继续推进什么”。可包含：

- 当前 `status`
- 当前已记录的 `worktree_path`
- 当前已记录的 `pull_request_url`
- 调度器观察到该 Task 尚未终态，需要继续推进

但不应把 prompt 变成数据库操作说明书，也不应要求 Agent 自己理解“如何根据表字段判断下一步是否该写 SQL”。

### 3. Prompt 目标是恢复闭环，不是暴露内部机制

无论首条 prompt 还是跟进 prompt，其目标都应是帮助 Session 恢复“当前任务推进到了哪里、下一步应该做什么”，而不是让 Agent 学会 Plugin 内部实现。数据库细节应由 Plugin 吞掉，Task 快照才是 Agent 的工作合同。

## 错误与异常边界

本次设计只覆盖第一刀必须说明的异常边界。

### 1. SQLite bootstrap 与不可读写边界

若 `<project_dir>/aim.sqlite` 不存在，Plugin 应自动创建该数据库文件；若数据库可打开但 `tasks` 表不存在，Plugin 应自动创建 `tasks` 表。

若数据库不可打开、基础建表失败，或 `tasks` 表已存在但列、类型或整体 schema 与运行时要求不兼容，Plugin 应直接报错并停止本轮调度，而不是尝试猜测替代路径、自动修表或切到其他数据库。

### 2. Session 绑定失真

若某个 `session_id` 无法定位 Session，则 `dispatch-tasks` 可重新认领该 Task；若 task-bound tool 在当前 context 下找不到绑定 Task，则该 tool 调用应失败并显式暴露“当前 Session 未绑定 Task”。

### 3. busy Session 不重复注入 prompt

若 Session 仍在处理中，则本轮跳过即可。这不是错误，而是正常并发保护行为。

### 4. 多条 Task 绑定同一 `session_id`

这属于 SQLite 真相损坏或运行时写入异常。相关工具应停止并上报，不应让 Agent 在歧义绑定下继续执行。

### 5. Task 进入终态但 Session 仍存在

只要 `status` 已写成 `succeeded` 或 `failed`，Plugin 即视为该 Task 在 SQLite 层进入终态；后续是否保留 Session、如何回收 Session，不属于本次设计的核心范围。

### 6. 范围外系统问题不上升为本次设计扩展

若后续实现中发现需要跨 project 扫描、复杂 session lease、常驻 daemon 或更强并发仲裁，均应视为下一阶段设计议题，而不是在本次 spec 内预埋半套服务化机制。

## 验证重点

后续实现至少需要证明以下设计决策成立：

1. 即使 `<project_dir>/aim.sqlite` 尚不存在，运行时也能在进入调度时自动完成基础 bootstrap，并继续基于该路径中的 Task 触发完整推进闭环。
2. `dispatch-tasks` 能正确扫描 `done = false` 的 Task，并优先恢复已有 Session。
3. 对不存在的旧 Session，系统可以重新认领并继续推进，而不是让 Task 永久卡死在历史 `session_id` 上。
4. busy Session 不会被重复 prompt。
5. `get-current-task`、`mark-task-status`、`setup-worktree-path`、`setup-pull-request-url` 都能通过当前 `sessionID` 唯一绑定到正确 Task，而无需 Agent 传 `task_id`。
6. `mark-task-status` 只接受 `status` 参数，且插件能自动维护 `updated_at` 与 `done` 派生关系。
7. `list-processing-tasks` 至少能稳定返回 `task_id/status/session_id/worktree_path/pull_request_url/updated_at`，满足观察与排查需求。
8. 发给 Session 的 prompt 只暴露 Task 快照，不暴露数据库实现细节。
9. 整体实现保持在单 project、纯插件闭环范围内，没有偷偷引入 daemon、跨 project 路由或复杂调度服务。
10. 运行时只自动创建数据库文件与缺失的 `tasks` 表；若现有 `tasks` schema 不兼容，则会显式失败，而不是尝试迁移或修复。

## 实施边界提醒

后续实现必须严格以“`<project_dir>/aim.sqlite` + 最小插件 tool 集 + 自动推进闭环”为边界。以下方向都属于 scope drift：把数据库路径开放成可配置能力、为 Agent 暴露 `task_id` 传参协议、引入跨 project 扫描、抽象通用 runtime core、加入外部 daemon、设计复杂 lease 或分布式抢占。若实现中发现确实需要跨越这些边界，必须单独升级决策，而不是在当前任务内顺手扩展。
