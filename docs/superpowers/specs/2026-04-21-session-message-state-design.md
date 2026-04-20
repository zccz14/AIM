# Task Session Message State 判定设计说明

## 背景 / 问题

当前 `task-scheduler` 在每轮扫描中会依赖 `TaskSessionCoordinator.getSessionState()` 判断 Session 是否空闲；若判定为空闲，则立即发送 continue prompt。现有实现默认认为 OpenCode 的 `promptAsync()` 调用后，`session.status` 会很快变成 `busy` / `running`，于是 coordinator 直接解析 OpenCode 返回的原始状态字段来区分 `idle` 与 `running`。

这个假设不稳定：当 OpenCode 的状态接口没有及时反映真实执行中状态，或者返回结构与预期不一致时，AIM 会把仍在处理中的 Session 误判为空闲，导致调度器重复注入 continue prompt。轮询间隔调大只能降低复现概率，不能消除误判根因。

本次已批准的方向是：不再让 scheduler 或 coordinator 依赖 OpenCode 原始状态字段，而是把 Session 状态判定责任下沉到 OpenCode adapter，由 adapter 基于 Session 消息做保守判断，并且只向上暴露 AIM 自己需要的两态结果：`idle | running`。

## 目标

1. 把 Session 状态判定逻辑收敛到 OpenCode adapter 内部。
2. 对上层只暴露 AIM 级别状态 `idle | running`，不泄漏 OpenCode 原始 payload 结构。
3. 以 Session 消息序列为唯一判定依据，解决 `promptAsync()` 后短时间误判为空闲的问题。
4. 采用保守策略：只有在能明确证明当前 Session 已完成上一轮 assistant 输出时，才返回 `idle`。
5. 保持 scheduler 仍然只依赖 `idle | running`，不感知 OpenCode 消息细节。
6. 覆盖 adapter 与 scheduler 的回归测试，防止再次出现重复 prompt 注入。

## 非目标

1. 不修改 scheduler 的轮询模型、并发模型或 continue prompt 内容。
2. 不把轮询间隔增加视为正式修复方案；如需临时调大，仅作为独立缓解措施。
3. 不在 AIM 中引入新的多态 Session 状态机，例如 `queued`、`retrying`、`unknown`。
4. 不让 coordinator 继续解析 OpenCode 原始 `status`、`type` 或其他底层字段。
5. 不扩展为复杂的历史消息语义分析器；首版只实现最小可用、保守的末尾 assistant 消息判定规则。
6. 不顺带做与本设计无关的 adapter / coordinator / scheduler 重构。

## 设计

### 总体思路

状态判定从 `TaskSessionCoordinator` 下沉到 `OpenCodeSdkAdapter`。adapter 负责读取 OpenCode Session 消息，并在内部把原始消息结构归一化为 AIM 需要的结论：当前 Session 是否可以安全继续。

`TaskSessionCoordinator` 在本设计中的职责收缩为：

1. 创建 Session。
2. 调用 adapter 获取 AIM 级别的 `idle | running`。
3. 发送 continue prompt。
4. 仅在 action 边界上包装错误上下文，例如 `createSession`、`getSessionState`、`sendContinuePrompt`。

`task-scheduler` 不再感知 OpenCode payload，也不需要知道 adapter 是通过消息、状态字段还是其他机制做判断。它仍然只消费 `idle | running` 两态：`idle` 才发送 continue prompt，其余情况一律跳过。

### 数据流

1. scheduler 扫描到已绑定 `session_id` 的未完成 Task。
2. scheduler 调用 coordinator 的 `getSessionState(sessionId, projectPath)`。
3. coordinator 将请求透传给 OpenCode adapter。
4. adapter 拉取该 Session 的消息列表。
5. adapter 基于消息序列执行保守判定，返回 `idle` 或 `running`。
6. coordinator 将该 AIM 状态原样返回给 scheduler；若 adapter 调用失败，则 coordinator 仅补充 action 级错误上下文。
7. scheduler 仅在收到 `idle` 时发送 continue prompt；收到 `running` 时本轮跳过。

## 状态规则

### 判定原则

1. 判定依据是 Session 消息，而不是 OpenCode 原始 `status` / `type` 字段。
2. 判定必须保守：只要消息序列存在歧义、缺失、结构异常或无法证明 assistant 已明确结束，本次都返回 `running`。
3. 对外语义等价于：adapter 只有在能清楚证明“现在安全可继续”时才返回 `idle`；否则一律返回 `running`。

### 首版最小规则

首版仅实现以下规则，不增加额外启发式：

1. 拉取指定 Session 的消息列表。
2. 在消息序列中找到最后一条 assistant 消息。
3. 如果不存在 assistant 消息，返回 `running`。
4. 如果最后一条 assistant 消息不是“明确完成”的状态，返回 `running`。
5. 只有最后一条 assistant 消息明确完成时，返回 `idle`。

### 明确完成的定义

首版实现必须基于 OpenCode 当前消息 payload 中可机读、且能稳定表明 assistant 输出已结束的显式完成信号来判断“明确完成”。设计约束如下：

1. 必须依赖消息本身的显式完成字段、完成事件，或同等强度的可机读结束信号。
2. 不允许因为“最后一条消息看起来像自然语言结尾”之类的弱信号返回 `idle`。
3. 若同一条 assistant 消息缺少关键字段、字段类型错误、parts 不完整、结束标记缺失，视为无法证明完成，返回 `running`。
4. 若消息结构未来变化导致当前解析器无法确认完成，默认仍返回 `running`，直到显式适配新结构。

这里的关键点不是尽量多识别可继续时机，而是尽量避免在 assistant 仍未结束时误发 continue prompt。

### 保守回退规则

以下情况统一按 `running` 处理：

1. 消息列表为空、缺失或不是可识别数组。
2. 找不到任何 assistant 消息。
3. 最后一条 assistant 消息存在但结构未知、畸形或不完整。
4. 最后一条 assistant 消息是否结束存在歧义。
5. OpenCode 返回了无法识别的新消息类型，且无法证明最后一条 assistant 消息已完成。

该规则是有意偏向“偶尔错过一次 continue 时机”，以换取“避免重复 prompt 注入”。

## 组件职责

### OpenCode SDK Adapter

职责：

1. 调用 OpenCode API 获取 Session 消息。
2. 屏蔽原始 payload 差异，把消息判定收敛为 `idle | running`。
3. 对未知 / 畸形 / 不完整消息结构采用保守回退，返回 `running`。
4. 保持 `createSession()` 与 `sendPrompt()` 语义不变。

约束：

1. adapter 对上不暴露 OpenCode 原始状态字段。
2. adapter 内部可以读取原始 payload，但解析边界应限制在“提取消息并判定最后 assistant 消息是否明确完成”，不扩展为通用状态机。

### Task Session Coordinator

职责：

1. 继续作为 scheduler 与 adapter 之间的薄桥接层。
2. 对 `createSession`、`getSessionState`、`sendContinuePrompt` 三类动作补充 action-scoped 错误上下文。
3. 不再解析 OpenCode 原始 session payload。

约束：

1. `getSessionState()` 只消费 adapter 提供的 AIM 状态结果。
2. coordinator 不应再基于 `status`、`type` 等字段做分支判断。
3. coordinator 不负责消息结构兼容逻辑。

### Task Scheduler

职责：

1. 保持现有接口不变，继续依赖 `idle | running`。
2. 收到 `idle` 才发送 continue prompt。
3. 收到 `running` 则跳过本轮。

约束：

1. scheduler 不读取 OpenCode 原始 payload。
2. scheduler 不解析消息列表。
3. scheduler 的回归测试应证明：只要 coordinator 返回 `running`，就不会重复注入 continue prompt。

## 错误处理

1. OpenCode 消息拉取失败时，adapter 直接抛出底层错误；coordinator 负责把它包装为 `getSessionState` 的 action-scoped 错误。
2. 消息接口成功返回，但数据结构未知、缺字段、字段类型错误或无法证明完成时，不视为异常中断，而是按保守规则返回 `running`。
3. `createSession()` 与 `sendContinuePrompt()` 的错误处理边界保持不变，不借这次设计修改其语义。
4. scheduler 维持现有单任务失败隔离策略；如果 `getSessionState()` 调用报错，本轮记录错误并继续处理其他 Task。

这一区分很重要：

1. API 调用失败属于真正错误，应进入现有错误链路。
2. 消息内容不够清晰属于“不安全继续”，应进入保守状态判定，而不是抛异常。

## 测试范围

### Adapter 测试

至少覆盖以下场景：

1. 能获取 Session 消息并基于最后一条 assistant 消息返回 `idle`。
2. 没有 assistant 消息时返回 `running`。
3. 最后一条 assistant 消息未明确完成时返回 `running`。
4. 消息列表为空、未知、畸形或字段缺失时返回 `running`。
5. OpenCode API 调用失败时，adapter 抛出错误，由 coordinator 在上层包装。
6. `createSession()` 与 `sendPrompt()` 既有行为保持不变。

### Coordinator 测试

至少覆盖以下场景：

1. `getSessionState()` 直接透传 adapter 返回的 `idle | running`。
2. coordinator 不再依赖原始 `status` / `type` 字段解析状态。
3. adapter 抛错时，coordinator 仍然包装为 `Task session coordinator failed during getSessionState`。

### Scheduler 回归测试

至少覆盖以下场景：

1. coordinator 返回 `running` 时，不发送 continue prompt。
2. coordinator 返回 `idle` 时，仍然只发送一次 continue prompt。
3. 当 adapter 因消息不清晰而保守返回 `running` 时，scheduler 行为与“Session 正在运行”一致。
4. 现有重复 `session_id` 跳过逻辑不因本次设计退化。

## 发布 / 兼容性

1. 这是一次 adapter 内部判定逻辑调整，对 scheduler 暴露的状态接口仍然保持 `idle | running`，因此 AIM 上层接口不变。
2. 行为上的预期变化是：部分原本可能被误判为空闲的 Session，会更常返回 `running`；这会带来少量 continue 延迟，但能显著降低重复 prompt 注入风险。
3. 该变化与临时调大轮询间隔兼容，但后者不是本设计的一部分，也不应作为验收条件。
4. 若后续需要提升“明确完成”的识别率，应在保持保守默认值的前提下迭代 adapter 内部规则，而不是把 OpenCode 细节重新暴露给 coordinator 或 scheduler。

## 验收标准

1. `TaskSessionCoordinator` 不再解析 OpenCode 原始状态 payload。
2. OpenCode adapter 对上只输出 `idle | running`。
3. 状态判定以消息为依据，并遵循“无法明确证明 idle 就返回 running”的保守原则。
4. scheduler 仍然只依赖 `idle | running`，且不感知消息细节。
5. adapter、coordinator、scheduler 的最小回归测试覆盖本设计定义的关键路径。
