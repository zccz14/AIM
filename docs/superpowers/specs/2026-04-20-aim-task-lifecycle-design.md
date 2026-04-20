# `aim-task-lifecycle` 技能设计说明

## 背景 / 问题

当前仓库已经明确两件事：

1. AIM 的任务真相应收敛到服务端 `Task` 记录，而不是散落在 Agent 会话文本里。
2. Agent 在 worktree、PR、follow-up、closing 等关键阶段已经会产生可回写的事实，但缺少一个统一技能来约束“何时、以什么字段、按什么状态语义”向 AIM 回报。

如果没有统一技能，不同执行者很容易出现以下漂移：

1. 只在最终完成时补写结果，过程中没有把 `worktree_path`、`pull_request_url` 和阶段状态及时回写。
2. 把“任务执行失败”和“上报接口失败”混为一谈，错误地把网络问题写成任务失败。
3. 对 `done` 与 `status` 的搭配缺少约束，出现 `done = true` 但 `status = running` 之类的非法组合。
4. PR 已创建、进入 follow-up、开始 closing 等关键阶段没有统一的状态切换规则，导致服务端看不到真实生命周期。

因此，本次需要在 OpenCode packaged skill 范围内新增一个 `aim-task-lifecycle` 技能，把 AIM 任务生命周期中的关键事实上报标准化，并以直接 HTTP REST PATCH 为唯一上报通道。

## 目标

1. 在 `modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md` 定义一个可复用技能，指导 Agent 在 AIM 任务生命周期内持续回报事实。
2. 明确该技能的默认环境约束：`SERVER_BASE_URL=http://localhost:8192`。
3. 明确唯一上报目标是“按 `task_id` PATCH 更新既有 Task”，而不是创建新任务或写入第二套状态存储。
4. 明确 AIM 字段覆盖范围至少包含：`status`、`done`、`worktree_path`、`pull_request_url`。
5. 明确生命周期状态语义与允许转换：`created` / `waiting_assumptions` -> `running` -> `outbound` -> `pr_following` -> `closing` -> `succeeded | failed`。
6. 明确强约束：只有在 `status = succeeded` 或 `status = failed` 时，才允许 `done = true`；其他状态一律必须 `done = false`。
7. 明确必报时点：开始执行、worktree 创建后、PR 创建后、PR follow-up 期间、closing 期间、成功时、失败时。
8. 明确报告失败的处理原则：有限重试、显式暴露、不得伪造成任务失败。

## 非目标

1. 本次不设计新的 Task 创建接口，也不让技能负责创建 Task。
2. 本次不设计数据库 schema 变更，不新增 `Task` 生命周期字段之外的新持久化字段。
3. 本次不把技能扩展为通用工作流引擎，不负责替代仓库级 AGENTS 规则中的 worktree / PR / merge 行为。
4. 本次不引入消息队列、Webhook、SSE、gRPC 或其他上报通道；唯一通道是同步 HTTP REST。
5. 本次不要求技能自动推断所有业务失败原因；技能只负责在发生事实后按规则回报。
6. 本次不覆盖仓库外系统联动，不做 Slack、邮件或其他通知集成。

## 方案定位

`aim-task-lifecycle` 的职责不是替 Agent 做开发决策，而是把已发生的关键事实以最小、稳定、可审计的方式回写到 AIM。它是一个 reporting discipline skill，而不是执行编排器。

推荐把技能定位为：

1. 输入 `task_id` 与当前已知事实。
2. 在关键时点触发标准 PATCH 请求。
3. 约束 `status` / `done` / `worktree_path` / `pull_request_url` 的写法。
4. 在上报失败时给出明确升级与阻塞语义。

## 适用范围与输入前提

技能在以下条件同时满足时适用：

1. 当前任务对应 AIM 中一个已经存在的 `Task`。
2. 执行者能够拿到该 `Task` 的 `task_id`。
3. 允许通过 HTTP 访问 `SERVER_BASE_URL`。
4. 执行过程需要把阶段事实持续回报给 AIM，而不是只在终态一次性回写。

技能至少需要以下输入：

1. `task_id`：必填，用于 PATCH 既有 Task。
2. `SERVER_BASE_URL`：可选环境变量，默认 `http://localhost:8192`。
3. 当前事实快照：至少包括当前生命周期状态，以及是否已知 `worktree_path`、`pull_request_url`。

若缺少 `task_id`，技能不得伪造上报请求，应先显式暴露输入缺失。

## 生命周期状态设计

### 1. 状态定义

本技能涉及的状态含义如下：

1. `created`
   表示 Task 已存在，但执行尚未开始。该状态通常由创建流程写入，技能可以读取它，但不要求在开始执行时再次写回 `created`。
2. `waiting_assumptions`
   表示任务因缺少用户输入、范围确认、必要前置条件或明确假设而暂停推进。此时 `done` 必须为 `false`。
3. `running`
   表示执行已经开始，Agent 正在准备或推进任务，但尚未进入“PR 已出站”的阶段。
4. `outbound`
   表示 PR 已创建并已具备 `pull_request_url`，任务从本地开发阶段进入出站阶段，但尚未进入持续 follow-up。
5. `pr_following`
   表示 Agent 正在跟进 PR 的 checks、review、mergeability、auto-merge 或外部平台状态。
6. `closing`
   表示任务已进入收尾阶段，例如 PR 已合并/关闭/废弃，或实现路径已确认终止，正在进行 cleanup、状态定稿、worktree 清理、主工作区基线刷新等关闭动作。
7. `succeeded`
   表示任务成功完成，必须同时写入 `done = true`。
8. `failed`
   表示任务以失败终态结束，必须同时写入 `done = true`。

### 2. `done` 规则

`done` 与 `status` 的搭配必须满足以下硬约束：

1. `status` 为 `created`、`waiting_assumptions`、`running`、`outbound`、`pr_following`、`closing` 时，`done` 必须为 `false`。
2. `status` 为 `succeeded` 或 `failed` 时，`done` 必须为 `true`。
3. 禁止写入 `done = true` 且 `status` 不属于终态。
4. 一旦已成功写入终态 `succeeded` 或 `failed`，技能不得在后续回退到非终态。

### 3. 允许的状态转换

本技能只允许以下生命周期转换：

1. `created -> running`
2. `created -> waiting_assumptions`
3. `waiting_assumptions -> running`
4. `running -> outbound`
5. `running -> failed`
6. `outbound -> pr_following`
7. `outbound -> closing`
8. `outbound -> failed`
9. `pr_following -> pr_following`
10. `pr_following -> closing`
11. `pr_following -> failed`
12. `closing -> succeeded`
13. `closing -> failed`

其中：

1. `pr_following -> pr_following` 允许重复上报，用于持续跟进中的事实刷新。
2. `running -> closing` 默认不作为标准路径，除非后续实现另立设计明确支持“无 PR 直接关闭”的场景；第一版不把它作为推荐转换。
3. `waiting_assumptions` 不是失败，也不是终态；恢复前提满足后应重新进入 `running`。

## 字段回写规则

### 1. 基本规则

每次 PATCH 至少必须显式携带：

1. `status`
2. `done`

当以下事实已知后，还应按规则携带：

1. `worktree_path`
   在 worktree 创建成功后首次写入；其后每次关键阶段上报都应继续携带当前真实值，除非服务端明确保证 PATCH 会保留旧值且实现选择最小 payload。
2. `pull_request_url`
   在 PR 创建成功后首次写入；其后每次与 PR 相关的关键阶段上报都应继续携带当前真实值。

未知值处理规则：

1. 未知不等于空字符串。未知字段不得写空字符串占位。
2. 若值尚未产生，优先省略该字段，而不是伪造 `null` / `""`，除非服务端 PATCH 合同后续明确要求显式清空。
3. 本设计第一版不要求技能执行“清空字段”操作；重点是回写新事实，而不是删除旧事实。

### 2. 字段与阶段的关系

1. 开始执行时：必须写 `status = running`、`done = false`。
2. worktree 创建后：必须补写 `worktree_path`，状态保持 `running`。
3. PR 创建后：必须写 `status = outbound`、`done = false`、`pull_request_url`，若已知 `worktree_path` 也应一并带上。
4. PR follow-up 期间：必须写 `status = pr_following`、`done = false`，并携带 `pull_request_url`；若 `worktree_path` 已知也应保留。
5. closing 期间：必须写 `status = closing`、`done = false`，并保留已知的 `worktree_path`、`pull_request_url`。
6. 成功终态：必须写 `status = succeeded`、`done = true`，并保留全部已知事实字段。
7. 失败终态：必须写 `status = failed`、`done = true`，并保留全部已知事实字段。

## 必报时点

技能必须覆盖以下上报时点，且不得只在最终终态一次性补写：

1. **开始执行**
   当 Agent 真正开始处理该 Task，而不是还停留在 `created` 时，立即上报 `running`。
2. **worktree 创建后**
   当 worktree 路径已经实际存在并可确认时，立即补写 `worktree_path`。
3. **PR 创建后**
   当 PR URL 已经拿到时，立即写 `outbound` 与 `pull_request_url`。
4. **PR follow-up 期间**
   当进入 checks / review / mergeability 跟进阶段时，必须至少有一次写 `pr_following`；后续若仍处于该阶段，可重复写同状态以反映持续跟进。
5. **closing 期间**
   当进入最终清理、关闭、收尾动作时，必须写 `closing`。
6. **成功时**
   当任务满足成功终态条件时，必须写 `succeeded` 与 `done = true`。
7. **失败时**
   当任务满足失败终态条件时，必须写 `failed` 与 `done = true`。

补充规则：

1. 若任务在开始后立刻发现缺少前置假设或用户输入，可从 `running` 或 `created` 进入 `waiting_assumptions`，并保持 `done = false`。
2. `waiting_assumptions` 不是必报时点，但属于允许技能覆盖的阻塞状态；若进入该状态，技能应立即上报，避免 AIM 误以为任务仍在活跃推进。

## API 合同

### 1. 请求模型

技能必须使用 HTTP PATCH 更新既有 Task，推荐目标路径为：

```text
PATCH ${SERVER_BASE_URL}/tasks/${task_id}
```

请求约束：

1. `SERVER_BASE_URL` 默认值为 `http://localhost:8192`。
2. `task_id` 来自外部输入，技能本身不负责生成。
3. 请求体使用 JSON。
4. 请求体至少包含 `status` 与 `done`；当 `worktree_path`、`pull_request_url` 已知时按前述规则追加。

### 2. `curl` 示例

开始执行：

```bash
curl -X PATCH "${SERVER_BASE_URL:-http://localhost:8192}/tasks/${task_id}" \
  -H "Content-Type: application/json" \
  --data '{
    "status": "running",
    "done": false
  }'
```

PR 创建后：

```bash
curl -X PATCH "${SERVER_BASE_URL:-http://localhost:8192}/tasks/${task_id}" \
  -H "Content-Type: application/json" \
  --data '{
    "status": "outbound",
    "done": false,
    "worktree_path": "/repo/.worktrees/task-123",
    "pull_request_url": "https://github.com/org/repo/pull/123"
  }'
```

成功终态：

```bash
curl -X PATCH "${SERVER_BASE_URL:-http://localhost:8192}/tasks/${task_id}" \
  -H "Content-Type: application/json" \
  --data '{
    "status": "succeeded",
    "done": true,
    "worktree_path": "/repo/.worktrees/task-123",
    "pull_request_url": "https://github.com/org/repo/pull/123"
  }'
```

## 失败处理

### 1. 任务失败与上报失败必须分流

技能必须显式区分两类失败：

1. **任务失败**
   指开发、验证、PR、merge、review、closing 等业务流程本身已经确认失败，应上报 `status = failed`、`done = true`。
2. **上报失败**
   指调用 AIM PATCH 接口失败，例如网络异常、连接拒绝、超时、5xx 或非预期响应。这种失败不得被伪造成任务失败。

换言之，不能因为 PATCH 没打通，就把任务写成 `failed`；也不能因为任务已经失败，就跳过最终失败上报。

### 2. 有限重试策略

对于单次上报失败，技能应采用固定上限重试：

1. 首次请求失败后立即记录失败原因。
2. 最多再重试 2 次，总尝试次数不超过 3 次。
3. 重试间隔建议采用短退避，例如 1 秒、5 秒。
4. 若服务端返回明确的 4xx 输入错误，允许直接停止重试，因为这通常不是瞬时故障。

### 3. 重试耗尽后的行为

当某个必报时点在重试后仍无法成功上报时，技能必须：

1. 明确向当前会话输出“上报失败”的事实，包含失败时点、目标 `task_id`、目标 URL、最后一次错误摘要。
2. 明确指出这是 AIM reporting blocker，而不是任务业务失败。
3. 不得写入伪造的 `failed` 终态，也不得伪造 `done = true`。
4. 不得声称 AIM 已收到该阶段事实。

第一版推荐的保守语义是：

1. 若失败的是必报阶段切换，上报失败后不应静默继续跨入下一个生命周期声明“已同步”；应把 reporting blocker 显式暴露给调用者。
2. 若业务动作本身已实际发生但上报失败，技能只能陈述“事实已发生，但 AIM 未成功同步”，不得篡改业务结果。

## 技能文档结构要求

后续实现 `SKILL.md` 时，正文至少应包含以下结构：

1. frontmatter
2. `When to use`
3. `Required inputs`
4. `Environment`
5. `Lifecycle statuses`
6. `Required reporting moments`
7. `API call format`（含 `curl`）
8. `Rules`
9. `Failure handling`

这些章节必须覆盖本设计中的硬约束，避免实现时只保留示例而丢掉规则。

## 验收标准

后续实现完成时，至少需要满足以下验收标准：

1. 存在新技能文件 `modules/opencode-plugin/skills/aim-task-lifecycle/SKILL.md`。
2. 技能正文明确声明默认 `SERVER_BASE_URL=http://localhost:8192`。
3. 技能正文明确声明唯一上报方式为 `PATCH /tasks/{task_id}` 更新既有 Task。
4. 技能正文显式覆盖 `pull_request_url`、`worktree_path`、`done`、`status` 四个 AIM 字段。
5. 技能正文显式声明 `done = true` 仅允许与 `status = succeeded | failed` 搭配。
6. 技能正文显式覆盖 `created` / `waiting_assumptions` / `running` / `outbound` / `pr_following` / `closing` / `succeeded` / `failed` 的含义与转换边界。
7. 技能正文显式覆盖七个必报时点：开始执行、worktree 创建后、PR 创建后、PR follow-up、closing、succeeded、failed。
8. 技能正文显式区分任务失败与上报失败，并给出有限重试与显式暴露规则。
9. 技能正文至少包含一个 `running` 示例、一个 `outbound` 示例、一个终态示例的 `curl` 请求。
10. 技能正文不存在 `TODO`、`TBD`、`xxx`、占位链接或未定义术语。

## 最小验证要求

因为本次设计对象是技能文档，后续实现阶段至少需要完成以下最小验证：

1. 文档检查：确认 `SKILL.md` 中已经逐项覆盖本设计的目标、状态规则、必报时点、API 合同与失败分流。
2. 示例检查：确认所有 `curl` 示例都使用 PATCH、默认基地址 `http://localhost:8192`、路径 `/tasks/${task_id}`，且 JSON 中 `done` 与 `status` 搭配合法。
3. 规则检查：确认文档中没有允许 `done = true` + 非终态、也没有把 reporting failure 写成 task failure 的表述。
4. README 集成检查：当后续更新 `skills/README.md` 时，确认 `aim-task-lifecycle` 的描述与本设计一致，不弱化“事实回报优先”的定位。

## 风险与范围保护

1. 风险：实现时把技能写成“只有最终完成才上报一次”的简化版。
   控制：本设计已把过程态上报列为硬性必报时点。
2. 风险：实现时用空字符串覆盖未知字段。
   控制：本设计明确未知字段应省略，不得伪造空值占位。
3. 风险：实现时把 5xx/网络错误写成任务失败。
   控制：本设计明确 reporting failure 与 task failure 必须分流。
4. 风险：实现时为了省事忽略 `waiting_assumptions`。
   控制：本设计已把它纳入允许生命周期状态，并要求进入该状态时立即上报。
5. 风险：实现时跳过 `closing`，直接从 `pr_following` 写到 `succeeded`。
   控制：本设计明确 `closing` 是独立必报阶段，用于表达收尾尚未完成。

## 自检结论

本 spec 已在正文内消除以下常见歧义：

1. 明确了 PATCH 目标是更新既有 Task，而不是创建新 Task。
2. 明确了 `done` 与 `status` 的合法组合，不保留弹性解释空间。
3. 明确了 `waiting_assumptions` 的定位是阻塞中的非终态，而不是失败。
4. 明确了未知字段应省略而不是写空字符串。
5. 明确了 reporting failure 的处理是有限重试加显式暴露，而不是伪造 `failed`。

后续实现不得再引入与上述结论冲突的占位描述或模糊措辞。
