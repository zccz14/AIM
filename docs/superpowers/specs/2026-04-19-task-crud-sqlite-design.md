# API 模块 Task CRUD SQLite 落地设计说明

## 背景 / 定位

当前仓库已经有两块前置基础：

1. `docs/superpowers/specs/2026-04-19-task-crud-openapi-design.md` 已经把 Task CRUD 的 HTTP 契约、字段约束和错误模型固定下来。
2. `modules/api/src/routes/tasks.ts` 已经提供了 route skeleton，但当前仍返回 stub 数据，尚未连接真实持久化。

本次设计解决的是 **API 模块内的 SQLite 持久化落地**：把 `modules/api` 中现有 Task CRUD 路由从 stub 响应替换为真实 SQLite CRUD，并在 API 启动使用时自动完成 `<project_dir>/aim.sqlite` 与 `tasks` 表的最小初始化。

这里的目标不是扩展 plugin runtime、daemon 或调度闭环，而是把当前 API 层“对 Task 资源做真实增删改查”这条路径落地，并且与既有 contract、已有运行时 SQLite 设计保持一致。

## 目标

1. 固定使用 `<project_dir>/aim.sqlite` 作为 API 模块访问的 SQLite 文件路径。
2. 当数据库文件不存在时自动创建该文件。
3. 当 `tasks` 表不存在时自动创建该表。
4. 若已存在的 `tasks` 表 schema 与当前实现要求不兼容，则立即失败，不做迁移、不做自动修复。
5. 用真实 SQLite CRUD 替换 `modules/api/src/routes/tasks.ts` 中的 stub 行为。
6. 保持 route 层薄，只负责 HTTP 请求解析、contract 校验和响应映射；SQLite 访问与 schema/bootstrap 逻辑下沉到小型 data-access 层。
7. 保持对现有 contract schema 的复用，不在 API 模块内重新发明 Task 输入输出模型。
8. 为后续 TDD 实现提供单一设计依据，使测试可以从 stub 断言切换为真实持久化断言。

## 非目标

1. 本次不设计 plugin runtime 如何扫描、认领或自动推进 Task。
2. 本次不扩展到 daemon、后台 worker、跨进程锁或多实例并发仲裁。
3. 本次不引入 schema migration 机制，也不支持自动修复历史坏表。
4. 本次不调整现有 OpenAPI 契约字段，只在既有 contract 约束内做持久化实现。
5. 本次不扩展分页、排序、模糊搜索、批量操作或新的 Task 动作型接口。
6. 本次不处理 plugin runtime 之外的状态机增强，只落实当前 CRUD 资源语义。

## 设计总览

推荐采用 **薄路由 + 小型 repository + 独立数据库入口** 的三层结构：

1. `modules/api/src/routes/tasks.ts`：只做请求解析、contract 校验、调用 repository、把 repository 结果映射成 HTTP 响应。
2. `modules/api/src/task-repository.ts`：负责 SQLite CRUD、筛选查询、行到 contract shape 的转换，以及 `tasks` 表 schema 校验与最小 bootstrap。
3. `modules/api/src/task-database.ts`：负责定位 repo-root 下的 `aim.sqlite`，并打开 `node:sqlite` 的 `DatabaseSync` 连接。

不把 SQL 内联到 route 的原因有两点：

1. 路由层应该继续围绕 HTTP 契约保持可读，避免同时混入 SQL、schema 检查和业务映射。
2. 初始化、schema 校验和 CRUD 查询都需要被多个 route 共享，抽成小型 repository 后，测试也更容易控制数据库输入输出。

## 组件职责

### 1. `task-database.ts`

职责固定为数据库定位与打开：

1. 从当前 API 模块所在位置向上解析仓库根目录。
2. 生成固定路径 `<project_dir>/aim.sqlite`。
3. 使用 `DatabaseSync` 打开该路径对应的 SQLite 数据库。

该模块不承担 HTTP 语义，也不承担 CRUD 规则；它只提供稳定的数据库入口。路径解析必须固定到 repo root，不能让调用方传入任意 `dbPath`，避免实现阶段把固定路径要求再次变成可配置能力。唯一允许保留的灵活性是 **测试期可控的 repo-root 解析切口**，使测试能够把“项目根目录”指向仓库内部临时目录，从而仍然满足“固定使用 `<project_dir>/aim.sqlite`”这一规则，而不是把数据库路径本身开放成业务配置。

### 2. `task-repository.ts`

职责固定为数据访问与存储约束：

1. 在首次使用时确保数据库文件可打开。
2. 检查 `tasks` 表是否存在；不存在则按当前约定自动建表。
3. 若 `tasks` 表存在，则验证关键 schema 是否兼容；不兼容时立即抛错。
4. 提供 `createTask`、`listTasks`、`getTaskById`、`updateTask`、`deleteTask` 等最小 CRUD 方法。
5. 把 SQLite 行数据映射为 contract 定义的 `Task` shape。
6. 统一维护服务端生成字段，例如 `task_id`、`created_at`、`updated_at`，以及从 `status` 派生出的 `done`。

repository 只暴露当前 route 所需的最小方法，不额外抽象成通用 ORM 或复杂 query builder。

### 3. `routes/tasks.ts`

职责固定为 HTTP 边界处理：

1. 沿用现有 contract schema 解析 `POST` / `PATCH` body 与列表过滤参数。
2. 把校验失败映射为 `TASK_VALIDATION_ERROR + 400`。
3. 把 repository 的“资源不存在”结果映射为 `TASK_NOT_FOUND + 404`。
4. 直接返回 contract-compatible JSON 响应。
5. 不在路由层拼 SQL，也不在路由层判断 schema 是否兼容。

SQLite bootstrap 或 schema 不兼容属于服务端内部错误，应该向上冒泡为 5xx，而不是被转换成业务型 `TASK_*` 错误。

## 数据模型与持久化规则

### 1. `tasks` 表字段

本次 API 持久化的最小字段集合应与当前 `Task` contract 对齐：

| 字段 | 说明 |
| --- | --- |
| `task_id` | 主键，服务端生成 |
| `task_spec` | 完整任务文本 |
| `session_id` | 可空 |
| `worktree_path` | 可空 |
| `pull_request_url` | 可空 |
| `dependencies` | 以 JSON 字符串持久化的字符串数组 |
| `status` | Task 当前状态 |
| `done` | 由 `status` 派生后落库的布尔值 |
| `created_at` | ISO 时间字符串 |
| `updated_at` | ISO 时间字符串 |

其中 `dependencies` 继续暴露为 `string[]`，但在 SQLite 中采用单列 JSON 文本保存即可。当前范围内不需要为了数组字段引入附属表，因为本次目标是最小可落地 CRUD，而不是做高扩展性的关系建模。

### 2. `done` 派生规则

`done` 不是客户端输入真相，而是服务端基于 `status` 统一派生：

- `status in {succeeded, failed}` 时，`done = true`
- 其他状态时，`done = false`

该规则同时适用于创建与更新：

1. `POST /tasks` 即使请求体显式给出 `status`，仍由服务端重新推导 `done`。
2. `PATCH /tasks/{taskId}` 更新 `status` 后，必须基于合并后的最终状态重新推导 `done`。

### 3. 创建规则

`POST /tasks` 的持久化语义如下：

1. 服务端生成新的 `task_id`。
2. `created_at` 与 `updated_at` 使用同一个当前时间。
3. `status` 缺省时使用 contract 约定的默认值；若请求提供 `status`，则在 contract 校验通过后直接使用。
4. `done` 永远由最终 `status` 派生。
5. `session_id`、`worktree_path`、`pull_request_url`、`dependencies` 按请求值或 contract 默认值写入。

### 4. 查询与过滤规则

`GET /tasks` 只支持当前已批准的三个过滤条件：

1. `status`
2. `done`
3. `session_id`

过滤语义为“存在则参与筛选，不存在则不过滤”。本次不引入排序参数；返回顺序只需保持稳定且实现简单，推荐按 `created_at` 升序或插入顺序返回，但不把排序能力暴露为公开契约。

### 5. 按 ID 读取规则

`GET /tasks/{taskId}` 读取单条记录；若不存在则返回 `TASK_NOT_FOUND + 404`。不存在时不返回空对象，也不通过列表接口语义兜底。

### 6. 更新规则

`PATCH /tasks/{taskId}` 采用“先读当前行，再做字段级合并，再整体更新”的模式：

1. 先加载当前任务；若不存在则返回 `TASK_NOT_FOUND + 404`。
2. 只允许合并 contract 已开放的可写字段。
3. 对于请求中未出现的字段，保留数据库中的原值。
4. 如果请求更新了 `status`，则基于合并后的最终状态重新计算 `done`。
5. `updated_at` 总是刷新为当前时间，`created_at` 保持不变。

这里明确不允许把 `done` 当作独立 patch 字段；它始终只由 `status` 驱动。

### 7. 删除规则

`DELETE /tasks/{taskId}` 的语义仅为删除该资源：

1. 删除成功返回 `204`。
2. 若目标不存在返回 `TASK_NOT_FOUND + 404`。
3. 不附带 worktree 清理、PR 关闭、Session 回收等扩展动作。

## 初始化与 schema 校验行为

### 1. 数据库文件自动创建

当 `<project_dir>/aim.sqlite` 不存在时，`DatabaseSync` 打开过程应触发 SQLite 自动创建文件。API 模块不需要额外暴露初始化命令；首次真实访问 Task repository 时即可完成该动作。

### 2. `tasks` 表自动创建

当数据库存在但 `tasks` 表不存在时，repository 应自动执行建表 SQL，确保后续 CRUD 可以直接运行。建表只覆盖当前实现要求的那一张表，不扩展到 migration history、元数据表或版本管理表。

### 3. 现有 schema 兼容性检查

当 `tasks` 表已存在时，repository 必须在继续 CRUD 前验证它是否与当前实现兼容。兼容性检查至少覆盖：

1. 关键列是否存在。
2. 主键列是否正确。
3. `dependencies`、时间字段、状态字段与可空字段是否仍满足当前实现读取与写入要求。

如果发现缺列、关键列含义不兼容、主键不匹配或其他会导致当前 CRUD 语义失真的情况，应立即失败并抛出内部错误。这里明确禁止自动迁移、补列、重建表或静默忽略不兼容 schema，因为当前任务的目标是稳定失败，而不是在未知历史数据上猜测修复路径。

## 错误处理约定

### 1. 请求校验错误

以下场景统一返回 `TASK_VALIDATION_ERROR + 400`：

1. `POST` body 不符合 `createTaskRequestSchema`
2. `PATCH` body 不符合 `patchTaskRequestSchema`
3. `GET /tasks` query 中的 `status`、`done`、`session_id` 不符合当前 contract 约束

这里继续沿用现有 route skeleton 的校验边界，不把 SQLite 相关失败混入业务校验错误。

### 2. 资源不存在

以下场景统一返回 `TASK_NOT_FOUND + 404`：

1. `GET /tasks/{taskId}` 目标不存在
2. `PATCH /tasks/{taskId}` 目标不存在
3. `DELETE /tasks/{taskId}` 目标不存在

### 3. SQLite 初始化或 schema 异常

以下场景属于服务端错误，不映射为业务型 `TASK_*` 错误：

1. 数据库文件无法打开
2. 建表失败
3. 已存在 `tasks` 表但 schema 不兼容
4. SQL 执行发生底层 SQLite 异常

这些错误应该直接向上抛出，让 API 以 5xx 失败。原因是它们表示服务端基础设施或部署状态异常，而不是调用方提交了可恢复的业务请求。

## 推荐实现流程

后续实现建议按以下顺序落地：

1. 先新增 `task-database.ts`，固定解析 repo-root `aim.sqlite` 并集中打开数据库连接。
2. 再新增 `task-repository.ts`，完成建表 SQL、schema 校验、行映射与 CRUD 方法。
3. 最后重写 `routes/tasks.ts`，保留已有 contract 输入校验与错误码形态，但把 stub 逻辑替换为 repository 调用。

这个顺序可以保证：路径解析、初始化和 CRUD 规则先收敛，再把 HTTP 层改薄，而不是在 route 里边写 SQL 边试错。

## 测试重点

后续测试必须从“stub 返回值断言”转向“真实 SQLite 持久化断言”。重点覆盖以下场景：

1. 在 repo 内部临时目录下创建隔离环境，并让 API 读写该环境对应的 `aim.sqlite`；测试产物不得写到 repo 外。
2. 当 `aim.sqlite` 不存在时，首次访问能自动创建数据库文件。
3. 当 `tasks` 表不存在时，首次访问能自动建表并成功完成 CRUD。
4. `POST` 创建后，`GET /tasks` 与 `GET /tasks/{taskId}` 能读到真实持久化结果，而不是进程内 stub。
5. 列表过滤 `status`、`done`、`session_id` 能基于真实数据生效。
6. `PATCH` 会先读取当前行，再按允许字段合并，并在更新 `status` 后重新推导 `done`。
7. `DELETE` 删除成功返回 `204`，再次查询或删除时返回 `404`。
8. 当预先放入不兼容 schema 的 `tasks` 表时，请求会以服务端错误失败，而不是被静默修复。

测试应继续围绕 route 层展开，但断言目标必须体现真实数据库读写结果，从而为后续 TDD 实现提供回归保护。

## 范围边界与风险控制

本次设计的硬边界如下：

1. 只处理 `modules/api` 当前 Task CRUD 的 SQLite 持久化。
2. 只使用固定数据库路径 `<project_dir>/aim.sqlite`。
3. 只做自动建库文件与自动建 `tasks` 表，不做 migration。
4. 只增加小型 repository / database 模块，不引入更重的数据访问抽象。
5. 只在当前 contract 范围内实现 CRUD，不追加新的资源字段或动作接口。

后续实现中最容易发生的 scope drift 包括：顺手把数据库路径做成可配置、顺手加入 migration、顺手把 route 直接写成 SQL 控制器、顺手扩展到 plugin runtime 调度。这些都必须明确禁止。只要实现仍满足“固定路径、自动最小初始化、schema 不兼容即失败、薄路由、真实 SQLite CRUD”这五条约束，即视为符合本设计。
