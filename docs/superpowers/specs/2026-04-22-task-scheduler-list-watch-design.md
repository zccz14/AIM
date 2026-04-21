# Task Scheduler List-Watch 精简重构设计说明

## 背景 / 问题

当前 `modules/api/src/task-scheduler.ts` 既承担轮询入口，也承担轮次内并发调度、重复 `session_id` 保护与单任务推进。随着 Session 状态判断与 continue 流程逐步收敛，现有实现里的 `round` 概念和 scheduler 级重复 `session_id` 处理已经偏重，模糊了调度器真正需要负责的最小边界。

本次已批准方向是把 `task-scheduler` 收缩为一个薄的 polling scanner / list-watch loop：只负责定期列出未完成任务，按顺序检查每条任务是否需要继续推进，并把数据一致性约束下沉到 repository / schema 层，而不是继续在 scheduler 内维护额外仲裁逻辑。

## 目标

1. 把调度器表达收敛为 `scanOnce()` / `start()` / `stop()` 风格，不再使用 `round` 概念。
2. 保持调度器为薄扫描循环，只负责列出未完成任务并逐条判断是否需要继续。
3. 每次扫描内使用简单 `for...of` 串行处理任务，避免额外并发池与轮次内状态共享。
4. 保留每条任务自己的 `try/catch`，确保单条任务失败不会中断整次扫描。
5. 用串行 async loop 的自然顺序保证 polling 不重叠，不再保留单独的 overlap protection 机制。
6. 明确重复 `session_id` 约束由数据库 / repository 层保证：`session_id IS NULL` 可重复，非 `NULL` 的未完成任务必须唯一。
7. 明确 `stop()` 只请求关闭：不打断 in-flight 扫描，在当前安全边界退出循环、保证不会进入下一次扫描，并返回一个在 loop 真正退出时 resolve 的 Promise。

## 非目标

1. 不引入新的 scheduler 状态机、优先级队列、批处理框架或并发 worker pool。
2. 不在 scheduler 中继续做 duplicate `session_id` 统计、轮次内去重集合或额外仲裁。
3. 不改变 `TaskSessionCoordinator` 对 Session 的创建、状态查询与 continue prompt 发送职责。
4. 不顺带扩展为多进程调度、分布式锁或跨实例协调方案。

## 设计

### 总体思路

`task-scheduler` 重构为一个薄的 list-watch loop：

1. `start({ intervalMs })` 负责启动串行 async polling loop，并在进入循环后先执行一次扫描，再决定是否 sleep 后进入下一次迭代。
2. `scanOnce()` 负责执行单次扫描，供 loop 内部复用，也保留为显式单次触发入口。
3. `stop()` 只负责请求关闭，不打断已经开始的那次扫描；它应返回一个 Promise，并在 loop 真正退出时 resolve。

调度器本身不再描述“本轮 round”，而是把每次触发视为一次独立扫描。

推荐控制流为一个串行 `while` 循环：`start()` 建立后台任务，循环内按 `scanOnce() -> sleep(intervalMs) -> 再次检查是否继续` 的顺序推进。因为下一次扫描只会在前一次扫描和等待阶段结束后开始，所以不会出现重叠扫描，也不需要额外的定时器重入保护。

### 单次扫描流程

`scanOnce()` 的顺序固定为：

1. 通过 repository 读取全部未完成任务。
2. 使用简单 `for...of` 逐条处理。
3. 对每条任务执行独立的 `try/catch`，记录错误后继续下一条。

单条任务的处理责任仅包括：

1. 若任务已完成，跳过。
2. 若任务缺少 `session_id`，懒创建 Session，并通过 repository 的条件绑定接口把新 `session_id` 写回任务。
3. 若条件绑定失败，说明该任务已被其他路径绑定或状态已变化，本次跳过。
4. 若任务仍未绑定、已完成，或缺少继续推进所需的最小条件，则跳过。
5. 通过 coordinator 查询 Session 状态；只有 `idle` 才继续。
6. 对非 `idle` Session 直接跳过，不发送 continue prompt。
7. 为可继续的任务写出 task spec 文件。
8. 向空闲 Session 发送 continue prompt。

换言之，scheduler 的最小职责就是：列出未完成任务、缺失绑定时懒创建并绑定 Session、跳过 done / unbound / non-idle 任务、写 task spec、给 idle Session 发送 continue prompt。

### start / stop 语义

`start()` 与 `stop()` 的行为边界需要明确：

1. `start()` 只应在未运行时创建一个后台 loop；重复调用不应并发启动多个 loop。
2. loop 每次迭代先执行 `scanOnce()`，扫描完成后再进入下一次 `sleep(intervalMs)`。
3. `stop()` 只是设置 shutdown 请求，不中断当前正在执行的 `scanOnce()`。
4. 若 `stop()` 发生在扫描期间，loop 应在该次扫描完成后停止，并且不再开始下一次迭代。
5. 若 `stop()` 发生在 sleep 期间，loop 应在进入下一次 `scanOnce()` 前退出；实现可以通过等待自然结束或提前唤醒 sleep 达成这一点。
6. `stop()` 返回的 Promise 只有在后台 loop 已完全退出后才 resolve，便于调用方等待真正停止。

### 串行处理与错误隔离

本次明确不保留 scheduler 内部并发参数，也不再维护并发 worker。原因是当前调度器需要的不是吞吐优化，而是边界清晰、行为可读、容易验证的最小扫描循环。

串行 `for...of` 处理配合每任务 `try/catch` 可以直接满足两个约束：

1. 同一进程内不会在一次扫描中并发推进多条任务，降低共享内存状态和日志解释复杂度。
2. 任意单条任务失败只影响该任务，本次扫描仍继续处理后续任务。

### 串行轮询天然避免重叠

本次不再把 overlap protection 设计为单独机制。原因不是放弃“不重叠”要求，而是把它收敛为 loop 控制流本身的自然性质：

1. 后台只有一个 `while` loop。
2. 单次迭代内只有一个 `scanOnce()`。
3. 下一次扫描只能在前一次扫描和本次 sleep 都完成后开始。

因此，“扫描不重叠”仍然是必须保持的行为结果，但实现上不再依赖 `setInterval` 重入保护、额外的 in-flight Promise 复用逻辑或单独的 overlap guard。

## 数据 / DB 约束

本次设计明确取消 scheduler 级 duplicate `session_id` 处理。正确性约束改为由数据库 schema 或 repository 层强制保证：

1. `session_id = NULL` 的任务允许存在多条。
2. 对未完成任务，非 `NULL` 的 `session_id` 必须唯一，避免多条未完成任务绑定同一 Session。
3. repository 的 `assignSessionIfUnassigned()` 仍应使用条件更新语义，只在任务尚未绑定时写入 `session_id`，并返回最新任务快照或空值。

SQLite 支持多个 `NULL` 出现在唯一索引中，因此推荐用部分唯一索引或等价约束表达“仅约束非 `NULL` session_id”的要求。若实现还需要叠加 `done = false` 条件，也应在 repository / schema 设计中显式编码，而不是回退到 scheduler 内部做补偿判断。

## 测试影响

测试责任需要随边界一起迁移：

1. scheduler 测试应聚焦扫描循环本身，包括：未绑定任务会触发创建并条件绑定、非 idle Session 会被跳过、idle Session 会写 spec 并发送 continue prompt、单任务报错不会中断后续任务、轮询不重叠。
2. 现有 duplicate-session 行为不再由 scheduler 测试覆盖。
3. scheduler 测试还应覆盖 loop 生命周期：`start()` 不会并发启动多个 loop，`stop()` 不会中断 in-flight 扫描，且会在 loop 退出时 resolve。
4. duplicate `session_id` 的正确性测试应迁移到 repository / schema 测试，验证数据库约束对非 `NULL` `session_id` 生效，同时允许多个 `NULL`。

这样可以让 scheduler 测试只验证 scheduler 责任，避免用调度器单测代替数据库一致性测试。

## 迁移 / 兼容性说明

1. 这是一次内部重构，外部保留 `scanOnce()` / `start()` / `stop()` 能力，但后台轮询实现从 `setInterval` 切换为串行 async loop，不再暴露 `runRound()` / `beginRound()` 语义。
2. 行为上，重复 `session_id` 不再由 scheduler 跳过并记录告警；若数据库中仍可能出现该类脏数据，必须先补齐 schema / repository 约束后再删除对应 scheduler 逻辑。
3. 由于扫描改为串行，同一次扫描处理大量任务时总耗时可能增长；同时，`stop()` 也不再意味着立刻停止，而是“请求在安全边界退出”。本次接受这两个取舍，以换取更简单的控制流与更稳定的边界。若后续确有吞吐或更快停机诉求，应作为独立设计讨论，而不是在本次重构中预埋复杂并发结构。
