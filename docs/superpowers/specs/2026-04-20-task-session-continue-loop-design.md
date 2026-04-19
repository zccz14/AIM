# Task Session Continue Loop 后端最小调度器设计说明

## 背景 / 定位

当前仓库已经有三块前置事实：

1. `Task` 的持久化真相已经收敛到数据库字段，尤其是 `task_id`、`session_id`、`worktree_path`、`pull_request_url`、`status`、`done`。
2. 既有设计已经明确 Session 会在推进过程中回写 Task 状态，而不是让外部系统维护第二套持久状态。
3. 现阶段需要的不是完整任务平台，而是一条最短闭环：后台能持续扫描 `done = false` 的 Task，并在 Session 空闲时继续推动它们前进。

本次设计解决的是 **后端内的最小后台调度循环**：在单进程中周期性扫描数据库，把未完成 Task 与 OpenCode Session 绑定起来，并在 Session 空闲时发送 continue prompt，直到 Session 自己把对应 Task 写成 `done = true`。

这里的目标不是做新的工作流引擎，也不是把执行逻辑搬回调度器。调度器只负责“看数据库、绑定 Session、判断是否该继续发 prompt、发出 prompt”，而不负责 worktree 准备、PR 建立、PR / worktree 外部校验、失败诊断或终态判定细节。

## 目标

1. 在后端引入一个轻量后台任务 / scheduler，持续扫描 `done = false` 的 Task。
2. 当 Task 的 `session_id` 为空时，自动创建或绑定一个 OpenCode Session，并把 `session_id` 写回数据库。
3. 当 Task 的 `session_id` 已存在时，检查该 Session 当前是否在运行中。
4. 只有在 Session 空闲时，才向该 Session 发送 continue prompt。
5. 当 Session 正在运行时，本轮跳过，不重复发 prompt。
6. 整个循环持续运行，直到 OpenCode Session 自己把 Task 写成 `done = true`。
7. 保持实现最小化，单进程内尽量并行处理约 100-1000 条 Task，不引入消息队列、分布式 worker 或复杂 job framework。
8. 明确数据库是唯一真相源，调度器不在内存中维护另一套任务状态机。

## 非目标

1. 不负责重执行具体开发工作，Session 才是实际执行主体。
2. 不负责 worktree 创建、仓库准备、PR 创建、auto-merge、review 跟进或收尾清理。
3. 不负责查询数据库之外的外部真相，例如 worktree 是否存在、PR checks 是否通过、PR mergeability 是否可用。
4. 不负责 failure diagnosis、根因分析或自动制定修复方案。
5. 不引入分布式部署、多实例 lease、抢占、心跳协议或跨进程并发仲裁。
6. 不引入优先级队列、延迟队列、重试框架、复杂 backoff 编排或通用 job runtime。
7. 不把 Session 的中间执行状态镜像为数据库之外的新持久化模型。

## 核心边界

### 1. 数据库是唯一调度真相源

调度器所有决策都必须从数据库读取，至少依赖以下事实：

- 哪些 Task 仍需推进，以 `done = false` 为准。
- Task 当前绑定哪个 Session，以 `session_id` 为准。
- Task 当前已公开的推进结果，以 `status`、`worktree_path`、`pull_request_url` 等字段为准。

调度器可以在一次扫描轮次中临时持有内存对象，但这些对象只是本轮执行上下文，不构成新的持久真相。轮次结束后，下一轮仍然只以数据库最新值为准重新决策。

### 2. 调度器只做两类推进动作

调度器在本设计里只允许做两类动作：

1. **Session 绑定**：为 `session_id` 为空的 Task 创建 / 绑定 Session，并把 `session_id` 写回数据库。
2. **Continue 触发**：在已绑定 Session 且 Session 空闲时，向其发送 continue prompt。

除此之外，调度器不直接写 `done`、不直接判断任务成功失败、不直接写失败终态，也不直接更新 `worktree_path` 或 `pull_request_url`。这些状态推进都应由 prompt 驱动的 Session 自己完成。

### 3. Session 是推进主体

OpenCode Session 在本设计中的职责固定为：

1. 决定当前 Task 下一步应该如何继续。
2. 在需要时更新 `status` 以及辅助字段，例如 `worktree_path`、`pull_request_url`。
3. 在它判断任务无法继续或达到失败终态时，写入失败状态，例如 `status = failed`。
4. 在它判断任务真正完成时，写入终态结果，并把 `done = true` 落库。

这样划分的原因是：Session 掌握执行上下文、仓库操作过程和外部平台交互语义；调度器只负责“何时唤醒”而不负责“如何执行”。

## 推荐方案与备选方案

### 推荐方案：单进程轮询式最小调度器

推荐在后端进程内放置一个轻量循环，按固定周期读取数据库中的 `done = false` Task，并并行执行 Session 绑定 / idle 检查 / continue 发送。

选择该方案的原因：

1. 它直接满足当前需求，系统边界最短。
2. 它把持久化真相继续留在数据库，调度器只做桥接，不需要额外状态存储。
3. 在 100-1000 条 Task 规模下，单进程 + 受控并发已经足够覆盖目标，不需要先升级为复杂架构。
4. 它最容易约束 scope，避免把本次任务扩成通用 job system。

### 备选方案一：消息队列 / 分布式 worker

可以把未完成 Task 投递到队列，再由多个 worker 协调 Session 推进。

本次不选，原因是：

1. 会额外引入队列真相、消费语义、重试协议和重复投递问题。
2. 当前任务量级和单进程目标并不要求分布式化。
3. 这会把“最小 continue loop”膨胀成基础设施工程。

### 备选方案二：把完整执行逻辑收进调度器

另一条路径是让调度器直接感知 worktree、PR、checks 与失败原因，并代替 Session 做更多状态机判断。

本次不选，原因是：

1. 会让调度器同时承担唤醒、执行、诊断和外部协调，边界很快失控。
2. 很多外部状态并不是数据库真相，调度器一旦直接读取这些状态，就会形成第二套判断逻辑。
3. 这与“所有后续状态推进都通过 prompt 驱动 Session 完成”的目标冲突。

结论是：本次应坚持单进程、最小轮询、只做 Session 协调的方案。

## 架构与组件

整体建议拆成四个最小组件，保持职责清晰但不过度抽象。

### 1. Task Scan Loop

定位：后台周期入口。

职责：

1. 以固定周期触发一次扫描。
2. 从数据库查询所有 `done = false` 的 Task。
3. 将任务提交给受控并发的处理器执行。
4. 记录本轮扫描的最小统计，例如扫描数量、跳过数量、continue 发送数量、绑定数量、错误数量。

这里不需要复杂 cron 表达式或持久化 job 定义。一个简单稳定的 interval loop 即可。

### 2. Task Repository

定位：数据库真相读取 / 写回入口。

职责：

1. 查询 `done = false` 的 Task。
2. 在 Session 创建后原子写入或条件写入 `session_id`。
3. 提供按 `task_id` 重新读取最新 Task 快照的能力。

repository 不做 Session 协调，只负责数据库访问与最小并发保护。

### 3. Session Coordinator

定位：调度器与 OpenCode Session 之间的薄桥接层。

职责：

1. 为未绑定 Task 创建新 Session。
2. 查询已有 Session 的运行态，至少区分 `running` 与 `idle / not running`。
3. 在 Session 空闲时发送 continue prompt。

该组件只暴露调度器真正需要的最小能力，不把 Session 内部细节扩散到扫描循环。

### 4. Continue Prompt Builder

定位：生成发给 Session 的最小恢复提示。

prompt 应包含：

1. 当前 Task 的核心快照，例如 `task_id`、`task_spec`、`status`、`worktree_path`、`pull_request_url`。
2. 明确要求 Session 继续推进该 Task。
3. 明确要求 Session 在推进过程中自行写回状态，必要时写入失败终态或 `done = true`。

prompt 不应要求调度器之外的额外外部协调，也不应把数据库实现细节泄漏给 Session。

## 数据流

单轮扫描的数据流如下：

1. 调度循环查询数据库中所有 `done = false` 的 Task。
2. 对每条 Task，先读取当前 `session_id`。
3. 若 `session_id` 为空，则创建新 Session，并把新 `session_id` 写回数据库。
4. 写回成功后，立即把该 Task 视为“已绑定 Session 的 Task”继续后续判断。
5. 对已绑定 Session 的 Task，查询该 Session 当前是否处于 running。
6. 若 Session 是 running，则本轮跳过，不发送任何 prompt。
7. 若 Session 是 idle，则构造 continue prompt 并发送。
8. Session 收到 prompt 后，自行决定如何继续，并在需要时回写 `status`、`worktree_path`、`pull_request_url` 与 `done`。
9. 下一轮调度再次只根据数据库当前值与 Session 当前运行态做判断。

关键约束有两条：

1. 调度器不因为上一轮“已经发过 continue”而在内存中长期记账；下一轮仍然重新查 Session 运行态。
2. 只要 Session 仍在 running，就绝不重复发 prompt，避免同一 Session 被并发注入多条继续指令。

## 并发与吞吐策略

### 1. 单进程内受控并发

调度器需要在单进程内尽量并行处理约 100-1000 条 Task，但并发策略应保持简单：

1. 扫描可以一次性取出当前所有 `done = false` Task。
2. 任务处理应采用固定上限的并发池，而不是串行逐条处理。
3. 并发上限应作为实现期的简单配置常量存在，用于平衡数据库访问、Session API 调用和进程资源。

本次不需要引入优先级调度、公平队列或分层 worker pool；固定并发上限已经足以满足目标规模。

### 2. 避免同一 Session 重复 prompt

这是本设计最关键的保护约束：

1. 每轮在发送 prompt 前都必须实时检查 Session 是否 running。
2. 若 Session 已 running，则直接跳过。
3. 若同一轮中出现数据异常，导致多条 Task 指向同一 `session_id`，实现应把它视为异常并拒绝继续向该 Session 发多次 prompt。

这里不需要额外的分布式锁，因为本次前提是单进程调度器；但实现仍应通过本地去重或条件判断避免单轮内部重复发送。

## 错误处理

### 1. 扫描 / 单条处理失败隔离

单条 Task 处理失败不应导致整轮扫描终止。推荐策略是：

1. 记录该条 Task 的错误。
2. 继续处理其他 Task。
3. 让下一轮调度根据数据库事实再次尝试推进。

### 2. Session 创建失败

若为未绑定 Task 创建 Session 失败：

1. 不写入伪造的 `session_id`。
2. 保持该 Task 在数据库中仍为未完成、未绑定状态。
3. 记录错误并等待下一轮重试。

调度器不在此处直接把 Task 标成失败终态，因为是否应该失败属于 Session / 业务层判断，而不是基础调度错误的直接结论。

### 3. Session 状态查询失败

若无法判断已有 Session 当前是否 running：

1. 本轮保守跳过该 Task。
2. 记录错误或告警。
3. 等待下一轮再次检查。

这样可以避免在 Session 实际仍在运行时误发额外 prompt。

### 4. Continue 发送失败

若 Session 已确认 idle，但发送 continue prompt 失败：

1. 不修改 `done`、失败终态等业务字段。
2. 记录失败。
3. 让后续轮次重新检查并重试。

### 5. 数据异常

以下情况应视为显式异常，而不是静默修复：

1. 多条未完成 Task 绑定到同一 `session_id`。
2. 数据库中的 `session_id` 非空，但 Session 系统返回不可识别的异常状态。
3. 条件写入 `session_id` 时发现该 Task 已被其他路径更新。

这些异常需要暴露日志与指标，但调度器仍不自行做复杂诊断或补偿状态机。

## 数据一致性要求

为了避免单进程内的竞争窗口，本次设计要求数据库写入遵循最小保护：

1. 为未绑定 Task 写 `session_id` 时，应尽量采用“仅在 `session_id` 仍为空时写入”的条件更新。
2. 条件更新成功后，再继续基于最新快照判断是否发送 prompt。
3. 若条件更新失败，说明该 Task 已被其他路径绑定，本轮应重新读取数据库快照，而不是覆盖现有值。

在当前单进程前提下，这些保护已经足够；本次不扩展到多实例 lease 协议。

## 测试计划

后续实现至少需要覆盖以下最小验证：

1. 能扫描出所有 `done = false` 的 Task，且不会处理 `done = true` 的 Task。
2. 对 `session_id = null` 的 Task，会创建 Session 并写回 `session_id`。
3. 对已绑定且 running 的 Session，不会发送 continue prompt。
4. 对已绑定且 idle 的 Session，会发送一次 continue prompt。
5. 单轮内处理多条 Task 时，能够在受控并发下完成，不因单条失败而中断整轮。
6. Session 创建失败、状态查询失败、continue 发送失败时，只记录并跳过，不直接改写业务终态。
7. 若发现同一 `session_id` 被多条未完成 Task 复用，会显式报错并避免重复 prompt。

对于本次设计，不需要提前引入端到端外部平台测试；重点是调度边界、DB 交互与 Session 协调行为正确。

## 为什么要保持这个最小边界

1. 当前真正需要被验证的能力是“数据库驱动的 continue loop 是否能稳定把 Task 持续推进下去”，而不是通用任务平台能力。
2. 把重执行、worktree、PR、校验、诊断都留给 Session，可以让调度器保持薄且可预测。
3. 数据库作为唯一真相源，可以保证系统在每一轮调度时都从同一事实基础重新出发，而不是依赖内存状态。
4. 单进程受控并发足以覆盖当前 100-1000 条 Task 的目标规模，先做复杂基础设施不会带来成比例收益。
5. 当边界足够小，后续如果需要演进到更复杂的 worker 或 service，迁移成本也更低，因为职责已经被清楚切开。

## 实施边界提醒

后续实现必须坚持以下约束：

1. 调度器只能基于数据库真相和 Session 运行态做决策。
2. 调度器只负责 Session 绑定与 continue prompt 发送，不负责实际执行或外部验证。
3. 所有 `done` / 失败终态 / 辅助字段的业务推进，都应通过发送给 Session 的 prompt 驱动完成。
4. 任何把本次任务扩展为队列系统、分布式 worker、复杂状态机或外部平台诊断器的做法，都属于 scope creep。
