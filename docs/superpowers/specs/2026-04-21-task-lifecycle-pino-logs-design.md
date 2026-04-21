# 为服务端 Task 生命周期补齐 pino JSON 关键事件日志

## Assumptions

- 当前 `modules/api` 尚未引入统一结构化日志能力；`modules/api/src/server.ts` 只负责组装 `createApp()`、`createTaskRepository()`、`createTaskScheduler()`，`modules/api/src/task-scheduler.ts` 仍以 `console` 兼容形态记录 `warn` / `error`。
- 当前任务生命周期的成功落点已经存在于两类路径：HTTP 路由中的 `createTask` / `resolveTask` / `rejectTask`，以及调度器中的 `assignSessionIfUnassigned` / `sendContinuePrompt`。
- `modules/api/src/routes/tasks.ts` 目前只在 repository 返回成功 payload 后才返回 `201`、`200` 或 `204`；不存在额外事务层，因此“动作成功”应以这些 repository / coordinator 调用真正 resolve 为准。
- 现有测试已经覆盖创建、resolve、reject 路由，以及 scheduler 的 session 绑定与 continue 行为；本次验证应沿用这些现有入口补最小断言，而不是新增独立日志子系统测试工程。
- 当前任务 contract 与生命周期语义已经被现有路由、repository 和 scheduler 测试锁定；本次只补成功事件日志，不重写状态流转规则。

## Goal vs Non-Goal

### Goal

- 仅在 `modules/api` 内引入一个最小可复用的 pino logger，统一输出 JSON 日志。
- 只补齐 5 个成功事件日志：`task_created`、`task_session_bound`、`task_session_continued`、`task_resolved`、`task_rejected`。
- 每条成功日志都必须在对应动作真实成功之后再写出，不能在调用前预记“将要成功”的日志。
- 日志字段保持稳定、扁平且面向机器消费，至少包含 `event`、`task_id`，并在适用时包含 `session_id`、`status`、`result_preview`、`project_path`。
- 验证只补最小必要测试，围绕既有 API 路由与 scheduler 行为确认日志触发点，不改变现有响应契约、数据库 schema 语义或生命周期推进逻辑。

### Non-Goal

- 不把 logger 抽成跨 `modules/api`、`modules/cli`、`modules/opencode-plugin` 共享的基础设施层。
- 不新增第 6 个及以上的生命周期成功事件，也不顺手为现有 `warn` / `error` 体系做全面重构。
- 不记录动作开始、重试、失败、跳过、调试 trace 等额外日志；本次只覆盖明确要求的 5 个成功事件。
- 不修改 task contract、数据库字段定义、scheduler 调度算法、continue prompt 内容或 API 返回体。
- 不把完整 `result`、完整 request body 或其他高噪音字段直接打进日志，避免无界日志体积。

## 当前代码落点

### `modules/api/src/server.ts`

- 启动入口负责构造 repository、coordinator、scheduler 并启动 Hono server。
- 这里适合作为 `modules/api` 内统一 logger 的装配点，但不需要把 logger 提升到仓库级共享模块。

### `modules/api/src/routes/tasks.ts`

- `POST /tasks` 在 `createTask()` 返回 payload 后直接返回 `201`，是 `task_created` 的真实成功落点。
- `POST /tasks/{id}/resolve` 与 `POST /tasks/{id}/reject` 在 repository 成功返回后才返回 `204`，分别对应 `task_resolved` 与 `task_rejected`。
- `PATCH /tasks/{id}` 虽然也会改生命周期字段，但不在本次 5 个成功事件范围内，不能顺带扩成通用状态变更日志。

### `modules/api/src/task-scheduler.ts`

- 未绑定 task 会先调用 `coordinator.createSession()`，再调用 `taskRepository.assignSessionIfUnassigned()`；只有 assignment 成功返回带 `session_id` 的最新快照，才算 `task_session_bound`。
- 已绑定且 idle 的 task 会调用 `coordinator.sendContinuePrompt()`；只有该调用 resolve 后，才算 `task_session_continued`。
- 当前 scheduler 已支持注入 logger 做 `warn` / `error` 测试替身；本次应保留这种可注入模式，最小扩成可记录成功 `info` 事件。

### 相关测试现状

- `modules/api/test/task-routes.test.ts` 已覆盖 task create、resolve、reject 的主路径与返回契约。
- `modules/api/test/task-scheduler.test.ts` 已覆盖 session 绑定成功、continue 成功、running 跳过、失败隔离等路径。
- `modules/api/test/server.test.ts` 已覆盖 server 对 scheduler 依赖的装配边界，可用于约束 logger 装配不破坏既有启动行为。

## 设计

### 方案选择

推荐方案是在 `modules/api` 内新增一个很薄的 pino logger 模块，例如 `src/logger.ts`，导出基础 logger 以及按调用方创建 child logger 的小工具；路由与 scheduler 直接使用该模块，scheduler 继续保留依赖注入以便测试替换。这样可以在不引入跨模块抽象的前提下，把 JSON 输出、字段风格和调用点收敛到一个最小实现。

不选的路径有两条：一是继续在各处手写 `console.log(JSON.stringify(...))`，这样虽然少一个依赖，但字段格式与输出细节会重新分散；二是把 logger 提升成仓库级公共包，这会明显超出本任务“只在 `modules/api` 内统一”的边界。相比之下，本地薄封装的 pino 方案最小且足够稳定。

### 日志接口边界

- logger 只服务 `modules/api`，不创建新的 workspace package。
- 默认输出保持 pino 原生 JSON 行格式，写向标准输出；不为本任务增加 transport、pretty-print 或环境分级配置。
- 成功事件统一走 `info` 级别，继续保留现有 `warn` / `error` 用于调度器异常与重复 session 告警。
- 为了避免各处拼字段不一致，`task_*` 事件的 payload 应由少量本地 helper 组装，但 helper 只做字段整形，不抽象出新的生命周期框架。

### 五个成功事件与触发点

1. `task_created`
   - 触发点：`routes/tasks.ts` 的 `createTask()` 成功返回 payload 之后。
   - 必填字段：`event`、`task_id`。
   - 适用字段：`session_id`、`status`、`project_path`。
2. `task_session_bound`
   - 触发点：`task-scheduler.ts` 中 `assignSessionIfUnassigned()` 返回带 `session_id` 的最新 task 快照之后。
   - 仅在本轮确实完成“从未绑定到已绑定”的成功路径时记录；若 assignment 没生效、返回空、返回 done task，或被重复 session 保护拦截，都不记成功日志。
   - 必填字段：`event`、`task_id`、`session_id`。
   - 适用字段：`status`、`project_path`。
3. `task_session_continued`
   - 触发点：`sendContinuePrompt()` resolve 之后。
   - 必填字段：`event`、`task_id`、`session_id`。
   - 适用字段：`status`、`project_path`。
4. `task_resolved`
   - 触发点：`routes/tasks.ts` 中 `resolveTask()` 成功返回 payload 之后、返回 `204` 之前。
   - 必填字段：`event`、`task_id`。
   - 适用字段：`session_id`、`status`、`project_path`、`result_preview`。
5. `task_rejected`
   - 触发点：`routes/tasks.ts` 中 `rejectTask()` 成功返回 payload 之后、返回 `204` 之前。
   - 必填字段：`event`、`task_id`。
   - 适用字段：`session_id`、`status`、`project_path`、`result_preview`。

### 字段约束

- `event`：固定为上述 5 个字符串枚举之一。
- `task_id`：直接取当前成功 task 快照中的 `task_id`。
- `session_id`：仅当 task 快照存在非空 `session_id` 时输出；不额外写 `null`。
- `status`：仅当当前成功快照中已有稳定状态时输出。对于 create、bind、continue 事件，可直接记录当前 task 的 `status`；对于 resolve / reject，分别应记录 repository 已落库后的 `succeeded` / `failed`。
- `project_path`：直接记录 task 当前 `project_path`，不做路径改写。
- `result_preview`：仅用于 `task_resolved` / `task_rejected`。记录 result 的固定长度截断预览，推荐上限 200 个字符；为空字符串时写空字符串，不输出完整长文本。

### 成功后记录的原则

- 路由侧日志必须以 repository 返回成功 task 快照为前提；若请求校验失败、task 不存在或 repository 返回 `null`，不写成功日志。
- scheduler 侧日志必须以 coordinator / repository 调用真实 resolve 为前提；任何 thrown error、running 跳过、duplicate 跳过、done task 跳过都不写成功日志。
- 不允许先记日志再执行动作，也不允许在调用发起后立刻乐观记录“已继续 / 已绑定”。

## 验证

- 在 `modules/api/test/task-routes.test.ts` 补最小测试，验证 create、resolve、reject 成功路径会触发对应日志，并且日志字段至少覆盖 `event`、`task_id`，以及适用的 `session_id` / `status` / `project_path` / `result_preview`。
- 在 `modules/api/test/task-scheduler.test.ts` 补最小测试，验证 session 绑定成功时记录 `task_session_bound`，continue 发送成功时记录 `task_session_continued`。
- 保持现有失败、跳过与返回契约测试不变，确保新增日志不会改变路由状态码、scheduler 跳过逻辑或 task 生命周期语义。
- 不新增端到端日志文件断言；以可注入 logger spy 或模块级 mock 验证调用参数即可。

## 风险与约束

- scheduler 的 `task_session_bound` 必须以 assignment 返回的最新快照为准，而不是以 `createSession()` 返回值为准；否则会把条件写入失败误记成绑定成功。
- `task_session_continued` 只能在 `sendContinuePrompt()` 成功后记录；否则会掩盖 continue 实际发送失败。
- 路由侧 resolve / reject 目前成功时返回空 body，日志不能依赖响应体；必须基于 repository 返回值组装字段。
- 本次新增的是观测性，不是业务状态机；若实现中为了复用日志而推动 repository 或 contract 发生额外改造，即属于 scope creep。
