# OpenCode SDK Session Coordinator 设计说明

## 背景 / 当前状态

当前 `modules/api/src/task-session-coordinator.ts` 只暴露了调度器依赖的最小接口：`createSession`、`getSessionState`、`sendContinuePrompt`，但默认实现仍然是统一抛出 unavailable 错误的占位实现。与此同时，`modules/api/src/server.ts` 在启用 scheduler 时已经直接构造 coordinator，却没有显式读取并传入任何 OpenCode 连接配置。

调度器设计已经收敛出一个明确边界：scheduler 只依赖 `createTaskSessionCoordinator(...)` 这一层，不直接感知 OpenCode SDK、远端响应结构或更广泛的 runtime 生命周期。本次要补齐的，是把这条边界从占位实现替换成真实的 OpenCode SDK API 调用，并继续保持它对 scheduler 来说只是一个最小、可测试、可替换的会话协调器。

## 目标

1. 将 `createTaskSessionCoordinator` 从占位实现替换为真实的 OpenCode SDK-backed coordinator。
2. 只支持 scheduler 当前需要的三项最小能力：`createSession`、`getSessionState`、`sendContinuePrompt`。
3. 在 `modules/api/src/server.ts` 中显式从环境变量读取 coordinator 配置，并仅在启用 scheduler 时将配置传入 `createTaskSessionCoordinator(config)`。
4. 在 `modules/api/src` 下新增一个薄的 OpenCode SDK adapter 文件，专门负责初始化 SDK client 并发起原始 SDK 调用。
5. 将远端 SDK 响应严格收敛为 AIM 内部类型：`{ sessionId }`、`idle | running`、`void`。
6. 对缺失配置、未知远端状态和 SDK 调用失败给出明确失败语义，避免静默退化。

## 非目标

1. 不引入 plugin、skill injection、event hook 或任何非 API 型集成方式。
2. 不扩展出 scheduler 之外的 coordinator 能力，例如取消、恢复、列举 session、拉取日志或诊断信息。
3. 不设计 session recovery、自动重试、退避、故障补偿或额外生命周期管理。
4. 不让 scheduler 直接依赖 OpenCode SDK 类型、客户端实例或远端协议细节。
5. 不在本 spec 中扩展更广泛的 runtime 配置体系，只覆盖 scheduler 启动该 coordinator 所需的最小配置。

## 选定方案

采用“两层薄封装”方案：

1. `server.ts` 只在 `TASK_SCHEDULER_ENABLED === "true"` 时读取 OpenCode 相关环境变量并组装 config。
2. `createTaskSessionCoordinator(config)` 继续作为 scheduler 的唯一依赖边界，负责参数校验、错误语义收敛以及 AIM 类型映射。
3. 新增的 OpenCode SDK adapter 只负责两件事：初始化 SDK client；向 SDK 发起原始 API 调用并返回原始响应。

选择该方案的原因：

1. 调度器边界保持不变，后续 scheduler 实现与测试不需要了解 SDK 细节。
2. SDK adapter 足够薄，可以把 OpenCode 客户端初始化和底层调用集中到一处，而不会把原始响应结构扩散到调度器侧。
3. coordinator 成为唯一的语义收敛点，最适合统一处理配置缺失、动作级错误和状态映射。
4. 改动范围被严格限制在单一子系统内，不会把本次任务扩展为更大的 runtime 集成工程。

## 组件与职责

### 1. `server.ts`

职责：

1. 读取 scheduler 开关。
2. 仅在 scheduler 启用时读取 coordinator 所需环境变量。
3. 组装 `TaskSessionCoordinatorConfig` 并传给 `createTaskSessionCoordinator(config)`。
4. 在 scheduler 未启用时，不读取、不校验、不传递 OpenCode 配置。

这里的关键约束是“按需失败”：只有当 scheduler 被启用时，缺失或非法的 coordinator 配置才应让启动立即失败；scheduler 未启用时，不应因为未配置 OpenCode 而阻止服务启动。

### 2. `createTaskSessionCoordinator(config)`

职责：

1. 成为 scheduler 唯一依赖的 session coordination 边界。
2. 接收显式 config，而不是隐式从 `process.env` 读取配置。
3. 调用 SDK adapter 完成 session 创建、状态查询和 continue prompt 发送。
4. 将远端响应映射为 AIM 侧的最小返回类型。
5. 将失败包装为与动作对应的明确错误。

该工厂函数不负责更多 runtime 行为，也不向上暴露 SDK client 或 adapter 细节。

### 3. OpenCode SDK adapter

位置：`modules/api/src` 下新增一个独立文件，命名应直接体现其 OpenCode SDK adapter 身份。

职责：

1. 根据传入 config 初始化 SDK client。
2. 提供与三个最小能力一一对应的原始 SDK 调用方法。
3. 把 SDK 原始返回值原样交回 coordinator，由 coordinator 决定 AIM 语义映射。

adapter 必须保持“薄”，只做客户端初始化与 API 调用，不承担业务判定、状态翻译、重试或诊断。

## 配置边界

### 配置来源

OpenCode coordinator 配置必须由 `server.ts` 显式从环境变量读取，再作为普通参数传入 `createTaskSessionCoordinator(config)`。`createTaskSessionCoordinator` 及其 adapter 不应自行从环境变量取值。

### 配置校验与失败时机

1. 当 scheduler 启用时，若任一必需配置缺失、为空或无法用于初始化 SDK client，服务启动必须 fail fast。
2. 当 scheduler 未启用时，不对 OpenCode 配置做启动期校验。
3. fail fast 的触发点应出现在 scheduler 初始化路径中，而不是延迟到第一轮扫描或第一次 API 调用时才暴露。

### 配置范围

本次 spec 不预设超过 SDK 初始化所需的附加开关。后续实现只能引入支撑这三个 API 调用所必需的最小配置字段，不能顺手扩展出额外运行时能力。

## API 边界与数据映射

### 1. `createSession(task)`

行为要求：

1. coordinator 使用 task 中 scheduler 已有的上下文发起 OpenCode session 创建请求。
2. 若 SDK 调用成功，coordinator 只向上返回 `{ sessionId }`。
3. 无论远端返回了多少附加信息，scheduler 都不可直接获取这些附加字段。

错误要求：

1. 若 SDK 调用失败，必须抛出明确属于 `createSession` 动作的错误。
2. 错误可以保留底层 cause，但对外语义必须清楚表明失败动作是创建 session。

### 2. `getSessionState(sessionId)`

行为要求：

1. coordinator 调用 SDK 查询远端 session 状态。
2. 只允许向 AIM 映射出两种状态：`running` 或 `idle`。
3. 远端状态到 AIM 状态的映射必须显式、可枚举、可测试。

错误要求：

1. 若 SDK 调用失败，必须抛出明确属于 `getSessionState` 动作的错误。
2. 若远端返回本地未识别的状态值，必须抛错；禁止把未知状态静默归并为 `idle`、`running` 或其他默认值。

### 3. `sendContinuePrompt(sessionId, prompt)`

行为要求：

1. coordinator 调用 SDK 向现有 session 发送 continue prompt。
2. 成功时向上返回 `void`，不附带新的业务语义。

错误要求：

1. 若 SDK 调用失败，必须抛出明确属于 `sendContinuePrompt` 动作的错误。
2. 不在这一层引入自动重试、吞错或降级逻辑。

## 错误语义

本次实现只允许三类核心错误语义：

1. **启动期配置错误**：scheduler 已启用，但 OpenCode config 缺失或非法，服务启动直接失败。
2. **动作级 SDK 调用错误**：`createSession`、`getSessionState`、`sendContinuePrompt` 任一动作失败时，按动作边界抛错。
3. **未知远端状态错误**：`getSessionState` 收到未映射的远端状态时立即报错。

明确排除以下行为：

1. 不把 SDK 错误转换成“假成功”或空返回值。
2. 不在 coordinator 内自动重试一次或多次。
3. 不把未知状态视为远端空闲并继续推进。
4. 不在错误里追加超出本次 scope 的诊断、恢复建议或生命周期指令。

## 测试范围

后续实现至少需要覆盖以下最小测试：

1. coordinator 单测：`createSession` 成功时能把 SDK 返回收敛为 `{ sessionId }`。
2. coordinator 单测：`getSessionState` 能正确映射已知远端状态到 `idle` / `running`。
3. coordinator 单测：`sendContinuePrompt` 能调用 SDK 并在成功时返回 `void`。
4. coordinator 单测：缺失必需 config 时会明确失败。
5. coordinator 单测：远端返回未知状态时会抛错。
6. server 单测：仅当 scheduler 启用时才读取并传递 coordinator config；scheduler 关闭时不应构造这部分配置。

本次不要求端到端接入真实 OpenCode 服务，也不要求覆盖重试、恢复或诊断类测试，因为这些行为不在当前 spec scope 内。

## 实施约束提醒

后续 implementation plan 与实现必须坚持以下边界：

1. scheduler 继续只依赖 `createTaskSessionCoordinator(config)`，不能越过 coordinator 直接碰 SDK。
2. OpenCode 集成方式只能是 API 调用，不能混入 plugin、skill injection、event hook 或其他扩展机制。
3. coordinator 只翻译出 AIM 需要的最小语义：`{ sessionId }`、`idle | running`、`void`。
4. 任何 session recovery、重试、诊断、额外生命周期管理或更广泛 runtime 能力，都属于超出本 spec 的扩展。
5. 未知远端状态必须被视为错误并显式暴露，不能为了“继续跑起来”而宽松映射。
