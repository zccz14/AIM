# 为 Task 增加 project_path 并将其作为 OpenCode Session 项目目录的设计说明

## 背景 / 问题

当前 Task 模型只有 `worktree_path` 可用于表达与本地目录相关的运行时事实，但该字段承载的是执行目录语义，而不是 OpenCode Session 应绑定的项目根目录语义。随着 Task 创建、调度与 Session 上下文逐步打通，继续把“执行目录”和“Session 项目目录”混用会带来两个直接问题：

- 当任务在 worktree 中执行时，`worktree_path` 指向的是具体 worktree 目录，而 OpenCode Session 需要绑定的是该任务所属仓库根目录，二者并不等价。
- 现有 API、OpenAPI、生成契约、上游调用方与 UI 都还没有一个明确字段来表达“这个 Task 属于哪个项目根目录”，导致创建 Task 时无法稳定传递 Session 所需的项目上下文。

因此，本次设计采用已批准方案：**新增 `project_path`，保留 `worktree_path` 原有语义不变，并明确调度器创建 OpenCode Session 时只能使用 `project_path` 作为项目目录。**

## 目标

1. 在 Task 模型中新增必填字段 `project_path`，明确表示该任务所属仓库根目录绝对路径。
2. 保持 `worktree_path` 继续表示执行目录，不将其再用于选择 OpenCode Session 的项目上下文。
3. 统一更新 OpenAPI 规范、生成后的 contract artifacts、API、上游调用方与 UI，使 `project_path` 成为端到端一致事实。
4. 明确创建、更新、返回与持久化层对 `project_path` 的写读规则，避免出现静默忽略或隐式回填。
5. 固定 SQLite schema 兼容性策略：旧 `aim.sqlite` 若缺少该列，则视为不兼容并快速失败，不提供迁移兼容层。

## 非目标

1. 本次不移除 `worktree_path`，也不把其含义重定义为项目根目录。
2. 本次不引入 `project_path` 的自动推断、目录探测或路径纠正逻辑；调用方必须显式提供正确值。
3. 本次不为旧 SQLite 数据增加向后兼容读取、懒迁移或双 schema 适配层。
4. 本次不扩展 Task 其他字段语义，也不顺手重构 Session / Scheduler 的更大流程。

## 字段语义

### `project_path`

- `project_path` 表示 Task 对应仓库根目录的绝对路径。
- 该字段是 OpenCode Session 创建时使用的项目目录，也是 Session 上下文应绑定的目录。
- 该字段在 Task 对外响应中始终返回。
- 该字段在持久化层必须为非空必填值。

### `worktree_path`

- `worktree_path` 继续保持现有含义：表示任务执行目录，可为空，通常指向某个 worktree 绝对路径。
- `worktree_path` 仍可用于执行阶段的文件系统操作或运行时记录。
- `worktree_path` 不再承担、也不得被复用于 OpenCode Session 项目目录选择。

这两个字段必须被视为不同层次的事实：`project_path` 描述任务属于哪个项目，`worktree_path` 描述任务具体在哪个执行目录运行。

## 接口契约调整

### 1. Task 响应模型

所有 Task 响应都必须包含 `project_path`。这包括但不限于：

- `POST /tasks` 创建响应
- `GET /tasks` 列表响应中的每个 Task
- `GET /tasks/{id}` 详情响应
- `PATCH /tasks/{id}` 更新响应

`project_path` 在响应中为必有字段，不允许因旧数据、空值或调用链缺失而省略。

### 2. `POST /tasks`

`POST /tasks` 请求体必须要求 `project_path`。其语义为：创建 Task 时调用方必须显式声明该任务所属仓库根目录，并由服务端按该值持久化。

本次不接受“若未提供则从 `worktree_path` 推断”或“若未提供则回落到服务端当前目录”之类的兼容行为。缺少 `project_path` 时，请求必须按校验错误处理。

### 3. `PATCH /tasks/{id}`

`PATCH /tasks/{id}` **不得接受** `project_path` 更新。原因是 `project_path` 是创建时确定的任务归属事实，不应在资源生命周期中被部分更新接口重写。

这里的约束是显式拒绝，而不是静默忽略：

- 如果请求体中出现 `project_path`，服务端必须返回校验错误。
- 不允许把该字段悄悄丢弃后继续执行其他 patch。

这条规则必须同步体现在 OpenAPI schema、生成 contract、API 请求校验与上游类型约束中。

## OpenAPI 与生成契约要求

本次必须同步更新以下契约层产物，并保证它们围绕同一事实源收敛：

1. OpenAPI 规范中的 Task schema、CreateTaskRequest 与 PatchTaskRequest。
2. 基于 OpenAPI 生成的 contract artifacts。
3. API 侧实际使用的输入输出 schema。

具体要求如下：

- Task schema 增加必填 `project_path`。
- CreateTaskRequest 增加必填 `project_path`。
- PatchTaskRequest 不包含 `project_path`，并且 API 对额外字段中的 `project_path` 返回校验错误。
- 所有引用 Task 响应模型的 endpoint 都自动体现 `project_path`。

契约更新完成后，任何继续按旧字段集创建或消费 Task 的调用方都应在类型检查、校验或联调阶段暴露问题，而不是由运行时静默兜底。

## API 与持久化要求

### 1. SQLite schema

`tasks` 表必须新增：

- `project_path TEXT NOT NULL`

该列是当前 schema 的组成部分，而不是可选增强列。新建数据库时必须直接按此 schema 建表。

### 2. 旧数据兼容策略

不提供旧数据兼容。若已有 `aim.sqlite` 中的 `tasks` 表缺少 `project_path` 列，则当前版本必须在 schema 校验阶段直接判定为不兼容并快速失败。

明确禁止以下做法：

- 启动时自动补列
- 运行时懒迁移
- 读取旧表时用空字符串、`NULL` 或 `worktree_path` 伪造 `project_path`
- 通过双 schema 分支兼容新旧数据库

设计目标是让不兼容状态尽早、显式暴露，而不是在错误前提上继续运行。

### 3. API 持久化读写规则

- 创建 Task 时必须写入 `project_path`。
- 查询 Task 时必须读取并返回 `project_path`。
- 更新 Task 时不得修改 `project_path`；若请求带该字段则直接返回校验错误。
- 对旧 schema 的任何访问只要无法满足 `project_path` 必填约束，就应失败，不允许降级。

## Scheduler / Session 行为调整

调度器在创建 OpenCode Session 时，必须改为使用 Task 的 `project_path` 作为 session project directory / session context。

明确禁止继续使用 `worktree_path` 来决定 Session 项目目录，原因如下：

1. `worktree_path` 的语义是执行目录，不是项目归属根目录。
2. worktree 可以变化、为空，或仅在执行阶段出现，不适合作为创建 Session 的稳定项目上下文。
3. `project_path` 才是调用链中显式、持久、可验证的仓库根目录事实。

`worktree_path` 若在后续执行步骤中仍有用途，应继续按原语义消费，但不得影响 Session 创建时的项目目录选择。

## 上游调用方与 UI 要求

所有上游创建 Task 的调用方与 UI 都必须同步接入 `project_path`：

1. 创建 Task 的上游 API 调用必须显式传递 `project_path`。
2. 前端或其他 UI 创建入口必须把 `project_path` 作为必填创建事实纳入提交数据。
3. 任何仍按旧请求体只发送 `task_spec` 或其他历史字段的创建路径，都必须在联调中被视为不兼容并修正。
4. 所有展示 Task 响应的界面与上游消费者，都必须接受响应中始终存在的 `project_path`。

这里的目标不是让 UI 立刻围绕 `project_path` 做复杂新交互，而是保证端到端创建链路已经具备并传递这一必需事实。

## 错误处理约束

围绕 `project_path` 的错误语义必须保持明确、一致：

- `POST /tasks` 缺少 `project_path`：返回校验错误。
- `POST /tasks` 的 `project_path` 类型不合法或为空值不满足约束：返回校验错误。
- `PATCH /tasks/{id}` 出现 `project_path`：返回校验错误。
- 访问缺少 `project_path` 列的旧 SQLite schema：返回 schema 不兼容导致的快速失败，不做业务层静默兼容。

其中最关键的边界是：**非法输入要显式报错，旧 schema 不兼容要显式失败，不允许任何形式的静默忽略。**

## 测试范围

本次实现后的验证范围必须至少覆盖以下几类：

1. 契约 / OpenAPI / 生成产物
   - OpenAPI 中 Task 与 CreateTaskRequest 正确包含 `project_path`
   - PatchTaskRequest 不接受 `project_path`
   - 生成 contract artifacts 与 OpenAPI 保持一致
2. API
   - `POST /tasks` 要求 `project_path`
   - `PATCH /tasks/{id}` 传入 `project_path` 返回校验错误
   - Task 持久化与读取会保存并返回 `project_path`
   - 旧 SQLite schema 缺少该列时快速失败
3. Scheduler
   - 创建 OpenCode Session 时使用 `project_path` 而不是 `worktree_path`
4. UI / 上游创建集成
   - 创建链路能够提交 `project_path`
   - 消费 Task 响应的调用方可处理始终返回的 `project_path`

测试目标不是泛化到全部 Task 行为，而是确保 `project_path` 作为新真相已经在契约、校验、持久化、调度和创建入口之间闭环一致。

## 边界与落地约束

后续实现必须持续满足以下硬约束：

1. 采用方案 1：新增 `project_path`，保留 `worktree_path`。
2. `project_path` 是 OpenCode Session 的项目目录事实源。
3. `worktree_path` 保持执行目录语义，不用于 Session 项目上下文。
4. `POST /tasks` 必填 `project_path`。
5. `PATCH /tasks/{id}` 禁止接受 `project_path`，出现即报校验错误。
6. Task 响应始终包含 `project_path`。
7. SQLite schema 新增 `project_path TEXT NOT NULL`。
8. 不做旧数据兼容，旧 `aim.sqlite` 缺列即快速失败。
9. Scheduler 创建 Session 时必须使用 `project_path`。

只要后续实现仍严格满足上述约束，即视为符合本设计；任何把 `project_path` 再次弱化为可选、可推断、可忽略字段的做法，都属于偏离已批准方案。
