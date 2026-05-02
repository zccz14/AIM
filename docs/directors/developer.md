# AIM Developer

AIM Developer 模块负责管理 AIM tasks 表，组装 prompt 并绑定到 OpenCode Session 上。

AIM Developer 假设 OpenCode Session 是一个 Promise (resolved / rejected)。Developer 取消 OpenCode Session 是通过修改 `tasks.session_id` 字段来实现“改绑”的动作，从而使得 OpenCode Session Manager 自行进行孤儿 Session 的清理。

- 不负责推进 Session。Session 的推进完全由 OpenCode Session Manager 来控制。

## Task Session Prompt 设计

Session Prompt 会在每次推进的时候被发出，因此不能过长。基本上包含三部分：

- 静态工作流提示：放入 `aim-developer-guide` 中，提供基础的工作流说明和技能使用指南，避免在 prompt 中重复描述技能的功能和使用方法。
- 最小动态上下文：`task_id`, 以及其他可以省略一次 AIM API 查询的引用字段，例如 `project_id`, `session_id`, `pull_request_url`, `workspace_path` 等。
- 值得重复强调的结束条件: 以 PR 合并、工作区清理、本地基线刷新为结束条件；以基线验证不通过为失败条件，其他错误不属于失败条件。这是为了保证 Session 能被正确推进到结束状态，避免 Agent 遗忘了结束条件导致 Session 无法结束。

三个部分加起来的篇幅应该控制在很小范围内 (例如 1000 token 以内)，避免浪费 token 导致 Session 无法推进。

### 静态工作流提示

静态工作流提示是一些基础的工作流说明和技能使用指南，放在 `aim-developer-guide` 中。Developer 在组装 Session Prompt 的时候可以直接引用这些内容，而不需要在 Prompt 中重复描述技能的功能和使用方法。

如果需要修改工作流或者技能的使用方法，只需要修改 `aim-developer-guide` 中的内容即可，无需修改 Session Prompt 的生成逻辑，避免了重复劳动和潜在的错误。

### 最小动态上下文

Task Prompt 仅包含**执行推进此 Task 所需的最小上下文信息**。剩余的内容由 OpenCode Agent 自行探索和获取（渐进式披露）。

- `task_id`：任务 ID (必填，这是所有上下文的核心，其他字段都是围绕 task_id 来服务的)
- `project_id`：项目 ID (实际上可以不需要，可以通过 task_id 查询 AIM API 得到，但给了也不会浪费很多 token)
- `session_id`：OpenCode Session ID (最好提供)
  以及其他的一些引用但是不占用过多 token 的字段，例如 `pull_request_url`, `workspace_path` 等。

明确不包含的内容：

- Task Spec: 比较长，不适合放在推进 prompt 中，浪费 token。Agent 可以通过 task_id 查询 AIM API 来获取 Task Spec。
- Active Tasks: Developer 负责一个 Task 而不是一组 Tasks，这是 Coordinator 的职责。
- Rejected Tasks: Developer 不负责处理被拒绝的任务，这是 Coordinator 的职责。
- 不要包含基线的 commit hash。基线的变化会导致 commit hash 的变化。
- 禁止使用 Array.prototype.map 等方式来生成 prompt 中的列表内容，因为这会导致 token 的浪费。

### 结束条件

比较重要的是**结束条件**：底层的 OpenCode Session Manager 不知道任务结束的条件是什么。因此 AIM Developer 要明确告知：以 PR 合并、工作区清理、本地基线刷新为结束条件；并且以基线验证不通过为失败条件，其他错误不属于失败条件。

这个需要重复强调，因为 Agent 很容易遗忘结束条件（例如经过了压缩），导致 Session 无法推进到结束状态。

## 参考资料

- [OpenCode Session Manager 设计文档](./opencode-session-manager.md)
