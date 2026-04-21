# `GET /tasks/{task_id}/spec` 任务说明读取接口设计

## Assumptions

- 当前任务 API 已经采用 Hono 路由，并在 `modules/api/src/routes/tasks.ts` 中集中注册 `GET /tasks/{task_id}`、`POST /tasks/{task_id}/resolve`、`POST /tasks/{task_id}/reject` 等 task 子资源接口。
- 当前任务持久化模型已经稳定保存 `task_spec` 字段，`getTaskById(taskId)` 可直接返回该字段，不需要额外拼装或二次解析。
- 调度器会把 `task.task_spec` 写入 `.aim/task-specs/...md` 文件供会话继续执行使用，但该文件属于运行时派生产物，不应成为对外 API 的事实来源。
- 现有 task 路由对任务不存在统一返回 `TASK_NOT_FOUND` 错误对象和 `404`，本次应复用该错误协议而不是再发明新的错误结构。
- 当前 contract 层已经维护 task 主资源与结果子资源路径常量；新增 spec 读取接口时，应继续沿用同一套子资源命名方式。

## Goal vs Non-Goal

### Goal

- 新增 `GET /tasks/{task_id}/spec`，用于读取某个任务持久化保存的原始 `task_spec` Markdown 文本。
- 成功响应直接返回纯文本 body，状态码为 `200`，`Content-Type` 为 `text/markdown; charset=utf-8`，不额外包一层 JSON。
- 当任务不存在时，继续返回既有 `TASK_NOT_FOUND` 错误形状与 `404`，保持 task 路由的一致错误体验。
- 路由位置与命名应贴合现有 task 子资源风格，使 `/tasks/{task_id}/spec` 与 `/tasks/{task_id}/resolve`、`/tasks/{task_id}/reject` 在心智上保持对称。
- 为该接口补充最小必要测试，覆盖成功时的响应正文与 content type，以及 not-found 分支。

### Non-Goal

- 不实现任何代码、数据库变更或实现计划；本次只定义设计约束。
- 不读取、解析或返回 `.aim/task-specs/...md` 文件内容，也不把文件缺失视为该接口的错误来源。
- 不把返回结果改成 JSON 包装结构，例如 `{ task_spec: "..." }` 或带 metadata 的对象。
- 不顺带扩展创建、更新、resolve/reject 等其他 task 接口的协议。
- 不新增新的错误码、权限模型、缓存策略或下载附件语义。

## Core Path

当前系统里，任务说明同时存在两种表现形式：一是数据库里持久化保存的 `task_spec` 字段，二是调度器为了继续会话而写出的 `.aim/task-specs/...md` 运行时文件。对外 API 若去读取文件，会把“运行时派生产物”误当成“任务真实来源”，从而引入额外的不一致风险，例如文件尚未生成、已被覆盖、位于不同 worktree，或者内容与数据库记录脱节。既然任务的规范事实已经明确保存在 `task_spec` 字段，那么 spec 读取接口应直接以该持久化字段为唯一数据源。

主路径应保持极简。调用方请求 `GET /tasks/{task_id}/spec` 时，服务端先按现有 task 路由方式解析 `task_id`，再复用仓库已有的 `getTaskById(taskId)` 读取任务。若任务存在，响应 body 直接写入 `task.task_spec` 原文，不做 JSON 包装、不改写换行、不附加额外描述字段；响应头显式声明 `Content-Type: text/markdown; charset=utf-8`，状态码返回 `200`。这样调用方拿到的就是可直接展示、保存或继续传递的 Markdown 文本，而不是还需要二次解包的 JSON 字段。

异常路径同样保持最小变化。若 `getTaskById(taskId)` 返回空值，则该接口与现有 `GET /tasks/{task_id}`、`POST /tasks/{task_id}/resolve` 等路径一样，直接返回既有 `TASK_NOT_FOUND` 错误对象和 `404`。本次不引入“spec 文件不存在”“spec 未生成”等文件系统错误分支，因为接口根本不应依赖 `.aim/task-specs/...md` 文件存在与否。

路由命名需要延续现有 task 子资源习惯。现有 `/tasks/{task_id}` 承载主资源读取与更新，`/tasks/{task_id}/resolve`、`/tasks/{task_id}/reject` 承载特定动作子资源；`/tasks/{task_id}/spec` 属于同一层级的稳定子资源读取路径，因此应与这些常量一起在 contract 层和 API 路由层定义，而不是另起一套不一致的 URL 结构。对应测试应放在现有 task contract 与 task route 测试中，验证成功响应的原始 markdown body、`text/markdown` content type，以及任务不存在时仍复用共享 404 错误协议。

备选方案之一是继续让调用方使用 `GET /tasks/{task_id}` 再自己从 JSON 里取 `task_spec`。这虽然零新增端点，但无法表达“我要拿可直接消费的 Markdown 说明文本”这一明确意图，也要求调用方理解完整 Task 模型。另一个备选方案是读取 `.aim/task-specs/...md` 文件并把它当作 spec 内容来源；这会把运行时文件可用性暴露成 API 契约的一部分，增加不必要耦合。相较之下，新增 `GET /tasks/{task_id}/spec` 并直接返回持久化 `task_spec`，语义更单一，依赖也更稳定。

## Verification Scope

- contract 测试需要覆盖新的路径常量与 OpenAPI 路径项，确认 `GET /tasks/{task_id}/spec` 被发布为返回 `text/markdown` 的读取接口，而不是 `application/json`。
- API 路由测试需要覆盖成功路径，确认响应状态为 `200`、响应正文等于创建任务时保存的 `task_spec` 原文、`content-type` 为 `text/markdown; charset=utf-8`。
- API 路由测试需要覆盖 not-found 路径，确认缺失任务时返回 `404`，且 body 仍满足既有 `taskErrorSchema` 并带有 `TASK_NOT_FOUND`。
- 本次验证不包含前端、CLI 或调度器改造测试，因为 spec 仅约束该新接口及其直接契约。

## Value Alignment

- 当“直接暴露最稳定的任务事实来源”和“复用现有运行时 spec 文件”冲突时，优先前者；因此接口只读取持久化 `task_spec`。
- 当“让调用方拿到可直接消费的 Markdown 文本”和“继续沿用 JSON 包装以保持所有接口外形一致”冲突时，优先前者；因此成功响应返回原始 markdown body。
- 当“新增最小但语义清晰的读取入口”和“要求调用方自行从 `GET /tasks/{task_id}` 解包字段”冲突时，优先前者；因此新增专用 `/spec` 子资源。
- 当“保持 task 路由错误协议一致”和“为 spec 接口单独设计 not-found 响应”冲突时，优先前者；因此继续复用 `TASK_NOT_FOUND` + `404`。
- 当“贴合现有 task 子资源风格”和“另起不一致的 URL 命名”冲突时，优先前者；因此路径固定为 `/tasks/{task_id}/spec`。
