# Task CRUD OpenAPI First 设计说明

## 背景 / 问题

当前仓库已经明确 `Task` 是调度器的基本执行单元，且其持久化真相需要对齐 `docs/task-model.md`。但在接口层面，仓库还缺少一套稳定、收敛、可先行落地的 Task CRUD 契约，导致几个问题同时存在：

- 外部调用方还没有统一的资源化入口来创建、读取、更新和删除 Task。
- `Task` 数据模型虽然已有文档定义，但尚未收敛为对外 OpenAPI schema，字段可写性、可空性与状态语义没有被接口契约固定下来。
- 后续 `modules/api` 的路由骨架实现缺少契约锚点，容易先写出行为，再反向修 OpenAPI，导致接口和实现漂移。

因此，本次设计先把范围收敛在 **OpenAPI-first 的 Task CRUD 契约**：先定义资源风格 endpoints、请求响应 schema、状态约束和错误模型，为下一步在 `modules/api` 中补最小 route skeleton 提供单一依据。

## 目标

1. 为 `Task` 提供一组稳定、资源风格、最小闭环的 CRUD OpenAPI 契约。
2. 让接口字段语义与 `docs/task-model.md` 保持一致，尤其是 `status`、`done`、`session_id`、`worktree_path`、`pull_request_url`、时间字段的定义。
3. 明确创建与更新接口的可写边界，避免客户端直接写入只读字段。
4. 明确列表查询的最小过滤能力，仅支持当前确定需要的 `status`、`done`、`session_id`。
5. 为下一步实现提供清晰 landing 顺序：先更新 `modules/contract/openapi/openapi.yaml`，再补 `modules/api` 路由骨架，并对齐 contract exports。

## 非目标

1. 本次不实现真实 SQLite CRUD。
2. 本次不实现 OpenAPI YAML、路由、控制器、测试或 implementation plan；这里只定义设计依据。
3. 本次不增加动作型接口，例如 `dispatch-tasks`、`resume-task`、`retry-task` 等非资源化 endpoint。
4. 本次不增加分页、排序、批量操作或复杂筛选语义。
5. 本次不把 GitHub checks、PR mergeability、平台状态镜像等动态信息扩展进接口模型。

## 设计总览

推荐采用 **资源风格的 Task CRUD API**，只暴露五个 endpoint：

1. `POST /tasks`
2. `GET /tasks`
3. `GET /tasks/{taskId}`
4. `PATCH /tasks/{taskId}`
5. `DELETE /tasks/{taskId}`

不提供 `PUT`，也不提供任何动词型子路径。原因是本次目标是先把 `Task` 作为持久化资源暴露出来，而不是提前把调度动作、运行时编排或平台跟进流程揉进接口层。`PATCH` 足以表达局部更新，也更符合 `Task` 在运行时逐步补齐字段的实际形态。

## 资源模型

### 1. Task schema

对外 `Task` schema 需与 `docs/task-model.md` 对齐，包含以下字段：

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `task_id` | string | 否 | Task 唯一标识，只读 |
| `task_spec` | string | 否 | Markdown 格式的完整 Task Spec 文本 |
| `session_id` | string | 是 | 当前绑定 Session ID |
| `worktree_path` | string | 是 | 当前或最近一次使用的 worktree 绝对路径 |
| `pull_request_url` | string | 是 | 当前或最近一次关联的 PR URL |
| `dependencies` | string[] | 否 | 当前候选前置 Task ID 列表 |
| `done` | boolean | 否 | 是否进入终态，只读 |
| `status` | string enum | 否 | 当前编排状态 |
| `created_at` | string | 否 | 创建时间，只读，使用 date-time |
| `updated_at` | string | 否 | 最近更新时间，只读，使用 date-time |

其中：

- `session_id`、`worktree_path`、`pull_request_url` 必须显式建模为 nullable string。
- `status` 枚举值固定为：`created`、`waiting_assumptions`、`running`、`outbound`、`pr_following`、`closing`、`succeeded`、`failed`。
- `done` 不是客户端可写字段，而是服务端根据 `status` 推导出的只读字段：当 `status` 为 `succeeded` 或 `failed` 时，`done = true`；其余状态均为 `false`。

### 2. 只读字段

以下字段必须在 OpenAPI 中明确标记为只读：

- `task_id`
- `done`
- `created_at`
- `updated_at`

这样可以把“资源身份”“终态推导”“时间戳维护”统一收敛为服务端职责，避免客户端绕过约束直接写入。

## 写接口模型

### 1. CreateTaskRequest

`POST /tasks` 的请求体使用 `CreateTaskRequest`，字段如下：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `task_spec` | string | 是 | 完整 Markdown Task Spec 文本 |
| `session_id` | string | 否，可空 | 初始绑定 Session，可为空 |
| `worktree_path` | string | 否，可空 | 初始 worktree 路径，可为空 |
| `pull_request_url` | string | 否，可空 | 初始 PR URL，可为空 |
| `dependencies` | string[] | 否 | 候选前置 Task ID 列表，默认空数组 |
| `status` | string enum | 否 | 初始状态，默认 `created` |

这里明确要求 `POST` 直接接收完整 `task_spec` Markdown 文本，而不是 spec 文件路径、附件引用或外部 URL。这样才能与 `docs/task-model.md` 中“`task_spec` 直接存文本”的模型保持一致。

`POST` 不接受 `task_id`、`done`、`created_at`、`updated_at`。这些字段由服务端生成或维护。

### 2. PatchTaskRequest

`PATCH /tasks/{taskId}` 的请求体使用 `PatchTaskRequest`，所有字段均为可选，但只允许局部更新以下字段：

- `task_spec`
- `session_id`
- `worktree_path`
- `pull_request_url`
- `dependencies`
- `status`

约束如下：

1. 不允许通过 `PATCH` 写入 `task_id`、`done`、`created_at`、`updated_at`。
2. `session_id`、`worktree_path`、`pull_request_url` 必须允许传 `null`，用于显式清空当前值。
3. `status` 如被更新，仍需遵守统一状态枚举；`done` 继续由服务端根据更新后的 `status` 推导。
4. `dependencies` 采用整体替换语义，不定义 append / remove 局部操作协议。

不提供 `PUT` 的原因是：当前 `Task` 的持久化形态包含多组由运行时逐步写回的字段，全量替换既不必要，也容易制造客户端必须回传全部最新字段的伪需求。

## 读接口模型

### 1. GET /tasks

列表接口返回 `TaskListResponse`，结构为：

- `items`: `Task[]`

本次不引入 `total`、`page`、`next_cursor` 等分页字段。列表查询仅支持三个 filter query 参数：

- `status`
- `done`
- `session_id`

这些过滤能力对应当前最小观察需求：按编排阶段查任务、按终态与否查任务、按 Session 绑定查任务。除此之外不额外开放 `created_at` 范围、排序、模糊搜索等能力。

### 2. GET /tasks/{taskId}

详情接口直接返回单个 `Task`。当目标不存在时返回 `404`，而不是返回空对象或 `200 + null`。

## 删除语义

`DELETE /tasks/{taskId}` 只承担资源删除职责，成功返回 `204 No Content`。本次设计不附带“级联取消 Session”“自动清理 worktree”“关闭 PR”等扩展行为，也不把删除解释成调度失败或业务终态写回。

## 响应码与错误模型

### 1. 成功响应码

- `POST /tasks`: `201 Created`
- `GET /tasks`: `200 OK`
- `GET /tasks/{taskId}`: `200 OK`
- `PATCH /tasks/{taskId}`: `200 OK`
- `DELETE /tasks/{taskId}`: `204 No Content`

### 2. 失败响应码

- `400 Bad Request`：请求结构、字段格式或业务校验不合法
- `404 Not Found`：目标 Task 不存在

本次不额外为 CRUD 首版引入 `409` 等更多 HTTP 状态码分支；冲突语义先收敛在统一错误响应体中，由错误码表达。

### 3. ErrorResponse

统一错误响应 schema 为 `ErrorResponse`，至少包含：

- `code`: string
- `message`: string

必要时可补充 `details` 字段承载校验上下文，但首版契约只要求 `code` 与 `message` 稳定存在。

错误码枚举固定为：

- `TASK_NOT_FOUND`
- `TASK_CONFLICT`
- `TASK_VALIDATION_ERROR`
- `TASK_UNSUPPORTED_STATUS`

推荐映射为：

- 资源不存在使用 `TASK_NOT_FOUND`
- 字段校验失败使用 `TASK_VALIDATION_ERROR`
- 非法状态值或不支持的状态迁移使用 `TASK_UNSUPPORTED_STATUS`
- 其余资源冲突场景保留给 `TASK_CONFLICT`

即使当前 HTTP 层只先显式使用 `400` 与 `404`，也应在 OpenAPI schema 中先固定上述业务错误码，避免后续实现阶段再临时发明错误语义。

## 与 Task 模型的一致性约束

接口实现后必须满足以下一致性规则：

1. `done` 永远由 `status` 推导，不能与 `status` 脱节。
2. `succeeded`、`failed` 是唯一终态；只有这两个状态会产生 `done = true`。
3. `session_id`、`worktree_path`、`pull_request_url` 允许为空，表示当前没有对应运行时事实，而不是空字符串占位。
4. `task_spec` 始终保存 Markdown 正文，而不是路径引用。
5. OpenAPI 只暴露持久化真相字段，不额外镜像 GitHub checks、mergeability、worktree 是否仍存在等动态状态。

## Landing 顺序

本次设计对应的后续落地顺序必须保持最小化：

1. 先更新 `modules/contract/openapi/openapi.yaml`，把五个 endpoint、五个 schema 和状态/错误约束固定下来。
2. 再在 `modules/api` 中增加对应 route skeleton，只对齐请求解析、返回 shape 和占位响应，不连接 SQLite。
3. 同步对齐 `modules/contract` 的导出与消费方式，确保 API 模块使用同一份 contract 事实源。

这里的关键约束是：**先定契约，再补骨架；先有最小可对齐的 API 入口，再接真实存储。** 本阶段不落 SQLite CRUD，不借机扩展到调度动作接口。

## 风险与边界保护

当前设计已收敛，无阻塞级待确认项；主要风险在于后续实现时的 scope 漂移：

1. 容易把 CRUD 首版顺手扩成调度动作 API，例如新增 `dispatch-tasks` 等动词型接口；本次必须禁止。
2. 容易把列表接口顺手扩成分页、排序、批量删除等通用平台能力；本次必须禁止。
3. 容易把路由骨架实现顺手接入 SQLite；本次 landing 阶段必须只做到 contract + route skeleton。

只要后续实现仍满足“资源风格五个 endpoint、`PATCH` 而非 `PUT`、`task_spec` 直接传 Markdown 文本、`done` 只读且由 `status` 推导、先 contract 后 route skeleton、暂不接 SQLite”这六条约束，即视为符合本设计。
