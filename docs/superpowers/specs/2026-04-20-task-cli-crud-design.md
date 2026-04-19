# 为 Agent 提供服务端优先的 `aim task` CRUD CLI 首版能力

## Assumptions

- 仓库中已存在 `@aim-ai/cli`，并使用 `oclif` 作为 CLI 框架，因此新增 `aim task` 子命令应复用现有命令注册与执行模式，而不是引入新的 CLI 技术栈。
- 仓库已经有 `docs/task-model.md`，其中 `Task` 被定义为调度器的基本执行单元，且 `task_spec`、`session_id`、`worktree_path`、`pull_request_url`、`dependencies`、`status`、`done` 是当前应被客户端读写或观察的核心字段。
- 仓库已经有服务端优先的 Task CRUD 契约设计，CLI 本次不直接访问 SQLite，也不自行推断本地持久化真相，而是作为 API client 调用服务端提供的 Task CRUD 接口。
- 当前可收敛的首版 CLI 需求只覆盖五个资源化命令：`task create`、`task list`、`task get`、`task update`、`task delete`。
- 该 CLI 的主要消费者是 Agent，因此默认输出应是稳定、纯净、无额外装饰的 JSON；失败时需要把稳定错误 envelope 输出到 `stderr`，并使用明确退出码。
- 本次允许通过命令行 flag 直接传入 `task_spec` 字符串，但不要求支持文件输入、stdin 输入、交互式编辑或其他多模态来源。
- 现阶段尚未要求 CLI 提供本地缓存、离线模式、配置文件默认值或状态推断能力，因此这些行为都不应被当作首版前提。

## Goal vs Non-Goal

### Goal

- 提供一个以服务端为真相源的 `aim task` CRUD CLI 首版，让 Agent 能通过统一命令调用创建、查询、更新和删除 Task，而不需要直接接触数据库实现细节。
- 固定五个命令的参数面与输出协议，使 Agent 能稳定拼装请求并可靠解析响应：成功时输出 `{"ok": true, "data": ...}`，失败时在 `stderr` 输出 `{"ok": false, "error": {"code": "...", "message": "..."}}`。
- 在所有命令上统一提供 `--base-url`，显式指定服务端地址，避免 CLI 在首版里引入配置发现、环境变量回退或隐式默认值。
- 让 `task create` 与 `task update` 能覆盖当前确定需要的 Task 字段写入能力，包括 `task_spec`、`session_id`、`worktree_path`、`pull_request_url`、`dependencies`、`status`，并通过显式 `clear-*` flag 处理可空字段与集合清空。
- 让 `task list`、`task get`、`task delete` 精确映射服务端 CRUD 能力，不把资源查询语义扩展成编排动作语义。
- 约束 CLI 内部实现保持轻量：命令层负责参数解析、HTTP 调用、响应 envelope 规范化和错误映射；共享辅助逻辑只保留 `base-url` 提取、Task 命令公共请求封装等薄层能力。
- 为后续实现提供直接落点：命令文件位于 `modules/cli/src/commands/task/`，测试采用现有 health command 的黑盒风格，并且只依赖 `@aim-ai/contract` 暴露的契约事实。

### Non-Goal

- 本次不让 CLI 直接访问 SQLite、Prisma、仓库内文件或任何本地持久化真相；即使本地可读取数据库，也不作为备选路径。
- 本次不新增 `task ready`、`task wait`、`task finish`、`task dispatch` 等编排型或动作型命令；范围只限 CRUD。
- 本次不支持 `task_spec` 从文件读取、stdin 读取、编辑器打开、交互补全或多段输入；首版只支持字符串 flag `--task-spec`。
- 本次不提供人类友好的表格、彩色日志、摘要文案或 `--json` 开关；默认且唯一的正常输出模式就是纯 JSON。
- 本次不支持通过空字符串表达清空字段，也不在 CLI 端猜测“缺省等于清空”；清空必须走显式 `--clear-session-id`、`--clear-worktree-path`、`--clear-pull-request-url`、`--clear-dependencies`。
- 本次不支持环境变量、配置文件或全局默认值来推断 `--base-url`；缺失时直接视为 CLI 使用错误。
- 本次不增加分页、排序、批量操作、高级筛选或跨资源聚合查询；列表能力只保留当前确定需要的 `status`、`done`、`session_id` 过滤。
- 本次不在 CLI 侧推断 `done`、推断状态迁移合法性、推断依赖关系是否满足，或镜像服务端错误语义之外的任务状态机知识。
- 本次不引入新的 CLI domain layer、离线队列、本地 cache 或 request replay 机制。

## Core Path

当前核心概念只有三层：Agent、`aim task` CLI、Task CRUD 服务端。首版的目标不是增强本地执行能力，而是把 Agent 发起的 Task 资源操作稳定地桥接到服务端契约上。这样可以把 Task 真相继续收敛在服务端，同时让 Agent 获得统一、可脚本化的命令入口。

主路径应保持为“命令即请求映射”，而不是“命令即本地业务层”。也就是说，CLI 读取 flag 后，只做最少的本地责任：校验必填 flag、把 flag 组装为对应 CRUD 请求、调用服务端、把响应整理成统一 JSON envelope、在失败时输出稳定错误与退出码。这样能保证 CLI 的职责边界清晰，不会在首版里复制 Task 领域逻辑，也不会让本地实现先于服务端契约发散。

五个命令的语义需要直接贴合资源 CRUD：

- `task create` 负责创建 Task，必填 `--task-spec`，可选 `--session-id`、`--worktree-path`、重复的 `--pull-request-url`、重复的 `--dependency` 与单值 `--status`。其中 repeated `--pull-request-url` 的处理应收敛为 CLI 可重复接收该 flag，但最终只按服务端当前接受的单值字段语义写入最新提供值，避免引入本地数组语义与 Task 模型冲突。
- `task list` 负责按最小过滤条件拉取列表，只支持 `--status`、`--done`、`--session-id` 三类过滤，不扩成通用查询语言。成功时 `data` 内承载 `TaskListResponse`。
- `task get` 负责按 `--task-id` 获取单个 Task，不为单资源读取叠加额外派生视图。
- `task update` 是 CLI 命名，底层语义必须映射到服务端 `patch` 合同。它要求 `--task-id`，并允许可选传入 `--task-spec`、`--session-id`、`--worktree-path`、`--pull-request-url`、`--dependency`、`--status`，以及 `--clear-session-id`、`--clear-worktree-path`、`--clear-pull-request-url`、`--clear-dependencies`；当用户需要清空可空字段或依赖集合时，只能通过显式 `clear-*` flag 表达，而不是用空字符串或缺参隐式推断。
- `task delete` 负责按 `--task-id` 删除资源，成功返回 `{"ok": true, "data": {"deleted": true, "task_id": "..."}}`，不追加本地级联动作。

围绕这五个命令，CLI 需要统一的协议约束。成功路径上，所有命令都输出 `ok=true` 的 envelope，这样 Agent 可以不区分命令种类先判断成功与否，再读取 `data`。失败路径上，CLI 必须优先保留服务端已给出的错误 `code` 与 `message`；只有在请求尚未到达服务端或服务端不可用时，才回落到 CLI 自己的稳定错误码，例如 `CLI_USAGE_ERROR`、`CLI_INVALID_BASE_URL`、`CLI_INVALID_FLAG_VALUE`、`UNAVAILABLE`。同时，任何失败都统一退出 `1`，任何成功都统一退出 `0`，避免 Agent 再根据命令类型记忆特殊退出码。

在参数建模上，首版的关键不是“尽量聪明”，而是“尽量显式”。`--base-url` 在每个命令上都显式存在，是因为当前最重要的价值是让 Agent 清楚知道请求发往哪里，而不是方便人手输入。`update` 上的 `clear-*` 设计同样服务于显式性：相比空字符串或缺省值，这种方式能把“保留原值”和“主动清空”严格区分开，减少无人值守调用中的歧义。

内部结构也应沿着最薄实现收敛。每个命令保留独立文件，放在 `modules/cli/src/commands/task/` 下，直接承载自身的参数定义和主执行逻辑；公共部分仅抽到薄共享层，例如 `base-url` 解析、Task 请求发送器、统一 envelope/error 输出。这里不新增本地 Task service、repository 或状态推理层，因为那会把 CLI 从“契约客户端”推向“第二套领域实现”，与首版目标冲突。

测试路径应对应上述职责边界。最重要的是黑盒 CLI 测试：验证命令是否被注册、flag 是否正确映射为请求、成功响应是否被包装为统一 envelope、`clear-*` 是否真的转化为显式清空语义、服务端错误是否被原样保留、CLI 本地错误是否落到稳定错误码、以及 CLI 包只通过 `@aim-ai/contract` 消费 Task 契约而不跨包偷用实现细节。这样测试保护的是首版 CLI 的协议稳定性，而不是内部重构细节。

备选路径有两个，但都不应采用。第一条备选路径是让 CLI 直接读写 SQLite，这会让本地命令绕过服务端契约，把部署形态、数据库位置、锁竞争和后续远程调用场景全部耦合进 CLI，违背服务端优先。第二条备选路径是把 CLI 做成厚客户端，在本地推断状态、缓存数据、兼容更多输入来源。这会在首版里过早复制领域知识，增加错误面与测试面，也会削弱服务端作为单一真相源的价值。因此首版只应保留一个明确方向：服务端优先、资源化 CRUD、纯 JSON 协议、显式参数语义。

## Value Alignment

- 当“让 Agent 无歧义地自动调用”与“让人类手动输入更省事”冲突时，优先前者；因此保留显式 `--base-url`、显式 `clear-*` 和纯 JSON 输出，而不是增加隐式默认值或人类友好格式。
- 当“保持 CLI 只是服务端契约客户端”与“顺手在本地补更多 Task 语义”冲突时，优先前者；因此不引入本地状态推断、离线缓存、SQLite 直连或新的 domain layer。
- 当“尽快形成一个可实现、可测试的一版最小闭环”与“顺手覆盖更多命令和输入方式”冲突时，优先前者；因此范围固定为五个 CRUD 命令和字符串型 `--task-spec`。
- 当“稳定保留服务端错误语义”与“在 CLI 侧重新包装出更复杂的本地解释”冲突时，优先前者；因此服务端已有 `code` 与 `message` 时应尽量透传。
- 当“避免无人值守场景下的隐式行为”与“减少 flag 数量或让接口更宽松”冲突时，优先前者；因此清空操作必须显式、失败退出码必须统一、flag 值非法时必须直接报错而不是猜测用户意图。
