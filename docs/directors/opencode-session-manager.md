# OpenCode Session Manager

背景：

1. OpenCode Session Status 接口非常不可靠，按照接口语义是 idle / running 的状态，但实际上经常错乱。
2. OpenCode Session GUI 姑且都很难正确反映 Session 的 Running 状态。
3. AIM 通过 OpenCode Session 来执行 Agentic 任务。完全无人工，因此永远使用一个 prompt 来推进 Session，直到它被 resolved 或者 rejected。
4. OpenCode Session Messages 接口是可靠的，我们可以通过 Session Messages 来判断 Session 的状态。

基本决策：

1. 在 OpenCode 正式梳理修复这个问题之前，我们只能通过一些不完全可靠的手段来判断并跟进 Session 的状态。
2. AIM 使用 `opencode_sessions` 表来管理它创建的 Sessions。AIM 只会对它管理的 Sessions 进行状态检查和推进。
3. Auto Session 过程中，不允许人工介入、不允许任何额外的权限。
4. 通过巡检机制来做兜底，以模仿人工在 OpenCode GUI 中看到 Session 状态后进行的推进操作。
5. 所有的 OpenCode Session 都应该在控制之下进行。如果有不受控制的 Session，我们应该放弃它的推进和已经达成的结果，选择删除它，而不是寻求恢复它的半成品。

## OpenCode Session 建模

AIM 在 `opencode_sessions` 表中建模它创建的 OpenCode Sessions，表结构如下：

- `session_id`: OpenCode Session ID。主键。不设置额外的 UUID，直接使用 OpenCode Session ID 作为主键。
- `title`: Session 的标题。创建后会被同步存储到 OpenCode 中。这个字段方便我们在 GUI 中展示 Session 的标题。
- `project_id`: AIM Project ID。外键，关联到 `projects` 表，父表记录删除时直接级联删除。这个字段表示这个 Session 属于哪个 AIM Project。由于 OpenCode 的限制，每个 Session 必须运行在一个特定的目录下，因此我们需要通过这个字段来确定 Session 的运行目录。
- `continue_prompt`: 用于初始化和推进 Session 的 prompt。一旦 Session Manager 认为 Session 需要被推进，就会发送这个 prompt。这个 prompt 的信息量必须是足够从任务开始推进到结束的。
- `provider_id`：OpenCode Provider ID。决定了要使用哪个模型。
- `model_id`：OpenCode Model ID。决定了要使用哪个模型。
- `state`: Session 状态。枚举值，取值范围为 `"pending"`、`"rejected"`、`"resolved"`。
- `value`: Resolve 的结果。当 Session 被 resolved 时，这个字段会被填充为 Session 的输出结果。
- `reason`: Reject 的原因。当 Session 被 rejected 时，这个字段会被填充为 Session 被拒绝的原因。
- `created_at`: Session 创建时间。Timestamp with timezone。
- `updated_at`: Session 更新时间。Timestamp with timezone。
- `input_tokens`: Session 输入的 token 数量。整数。默认为 0。
- `cached_tokens`: Session 使用缓存的 token 数量。整数。默认为 0。
- `cache_write_tokens`: Session 写入缓存的 token 数量。整数。默认为 0。
- `output_tokens`: Session 输出的 token 数量。整数。默认为 0。
- `reasoning_tokens`: Session 推理过程中使用的 token 数量。整数。默认为 0。

后续迭代过程中，不允许修改这个表结构，不允许添加更多字段。

## OpenCode Session Manager 巡检

这是 OpenCode Session Manager 的核心功能。
它负责:

1. 通过发送 prompt 来推进 AIM 管理的 OpenCode Sessions。
2. 清理孤儿 Sessions。这是指 AIM `opencode_sessions` 表中是 pending，但是没有任何下游引用的 Session。
3. 清理空悬 Sessions。这是指 AIM `opencode_sessions` 表中是 pending，但是 OpenCode 中已经被删除了的 Session。

注意：仅仅检查 state = "pending" 的 Session。当 state 已经是 "rejected" 或者 "resolved" 的 Session 就不需要检查了，进入归档状态。

不在 AIM DB 中的 OpenCode Session 不归 AIM 管理，AIM 不会对它们进行任何检查和推进。

## 何时推进 Session

首先判断它不是孤儿 Session 或者空悬 Session。

然后检查 Session 的 Messages 接口，获得历史消息记录。

**如果 Session 及其子 Session 中最后一条消息的时间(最大值) 距今超过 5 分钟，就推进 Session。** 如果没有超过，我们会等到下一次巡检时再检查一遍。

这是一个工程取舍。最后一条消息距今超过 5 分钟并不等价于 Session 进入了 idle 状态。

分别讨论两类错误：

1.  第一类错误

    如果实际上 idle 了，但是我们错误地认为它没有 idle。

    代价是等一段时间，它一定会被推进，因为实际上是 idle 的，所以 Session 的最大消息时间不会增长。随着时间推移，它一定会被判断为 idle 而被推进。

2.  第二类错误

    如果实际上没有 idle，但是我们错误地认为它 idle 了。

    代价是多推进一次 Session，上下文增长。OpenCode Session 的行为是，如果目前还卡在某个流程（例如工具调用），新的 Prompt 并不会立即 Abort 当前流程，而是会等当前流程结束后，才会继续插到后续。

    这个代价会因为过度频繁错误推进而放大。因此要着力减少这种错误的发生。但没有必要完全消除。在实际工作中，卡在长工具调用的频率并不高，因此这个错误的发生频率也不会太高。

这个设计的好处是不会因为立即的错误（API Quota 不足 / 网络不足）等原因频繁重试，并且只依赖 OpenCode API 可观测到的 Session Messages。

**为什么是 5 分钟**？它不至于太短导致正常的网络延迟和输出延迟导致第二类误判。它也不至于太长导致效率过低。这个时间是基于经验的一个折中值，提升它可以减少第二类错误发生，降低它可以降低第一类错误的代价。

## 何时中止 Session

OpenCode Session Manager 要追加一份 prompt 来引导 Agent 中止 Session。通过注入 AIM Session Settlement Protocol 来告诉 Agent 何时、如何中止 Session。

AIM Session Settlement Protocol 当前通过 Prompt 直接注入通过 curl 访问的 AIM API (`/opencode/sessions/<session_id>/resolve` 和 `/opencode/sessions/<session_id>/reject`) 来中止 Session 并给出结果或者原因。这个路径不依赖任何 OpenCode 插件，部署和调试都只需要 AIM Server 与 OpenCode API。

## 孤儿 Session

孤儿 Session 是指，在 `opencode_sessions` 表中是 pending，但是在其他表中没有任何关联记录的 Session。

目前下游引用的字段（未来可能会增加更多的任务类型）：

- `tasks.session_id`: AIM Developer
- `manager_states.session_id`: AIM Manager
- `coordinator_states.session_id`: AIM Coordinator

如果发现孤儿 Session，我们的策略是

1. 5 分钟后如果它依然是孤儿 Session，我们就调用 OpenCode API (`DELETE /session/<session_id>`) 来删除它，这可以释放掉它的资源。

这个孤儿 Session 的继续执行没有任何意义。它应该被删除。从理论上来说，创建 `opencode_sessions` 记录和设置下游引用的 `session_id` 字段应该在一个事务中完成，否则我们可能会遇到创建了 `opencode_sessions` 记录但是还短暂地没有绑定到下游记录的情况。

从实践上，当巡检遇到了孤儿 Session，如果孤儿 Session 的创建时间不足 5 分钟，我们可以暂时不删除它，等到下一次巡检时再检查一遍。如果超过 5 分钟了，我们就可以直接删除它了。

不过无论如何，孤儿 Session 永远不应该被推进。

## 空悬 Session

空悬 Session 是指，在 `opencode_sessions` 表中是 pending，但是在 OpenCode 中已经被删除了的 Session。

如果发现空悬 Session，我们的策略是删除它在 `opencode_sessions` 表中的记录。
因为这意味着这个 Session 有很多信息已经缺失了，无法通过 messages 来判断状态，无法统计 token 使用量。会导致很多功能无法正常工作了。

## 其他重要约束

1. AIM 中除了 OpenCode Session Manager 以外的其他任何模块，不得调用 OpenCode 的 Session Create / Prompt / Abort / Delete 接口。否则会导致 Session 状态无法被正确管理和跟进，导致 Session 乱象丛生，最终导致系统不可用。
