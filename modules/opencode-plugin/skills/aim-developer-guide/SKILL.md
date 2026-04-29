---
name: aim-developer-guide
description: Required entry skill when you are an AIM Developer working on an existing AIM Task and must read the task via AIM Server, validate it against the latest baseline, execute the worktree and PR lifecycle, report field facts, and complete the bound OpenCode session.
---

## 何时使用

当你是 AIM Developer，且当前工作对应一个已存在的 AIM Task 时，必须先使用此技能。

此技能是 AIM Developer 处理既有 Task 的强制入口指南，用于把以下动作串成单一闭环：AIM developer guide 明确纪律。

1. 通过 `task_id` 从 AIM Server 读取任务与 Spec。
2. 先对最新基线做只读验证，再决定是否进入执行。
3. 按仓库规则创建并汇报 worktree。
4. 在 worktree 中完成 TDD、验证、提交、PR、follow-up、合并与清理。
5. 向 AIM 持续上报生命周期事实，并最终通过 OpenCode session tool 完成 bound session。

不要用此技能来创建新 Task，也不要把 AIM 上报当作可替代实际 Git / worktree / PR 执行的编排器。

## 必需输入

- `task_id`：缺失时必须停止，直接暴露缺失输入，而不是猜测或发送请求。
- 当前事实快照：包含已知的 `worktree_path`、`pull_request_url`、`dependencies`，如果这些值已经存在则应保留并继续沿用。

## 角色与边界

此技能不改写仓库 `AGENTS.md`，只把仓库要求映射为 AIM Developer 在单个 Task 上必须遵守的执行与上报纪律。

- 主 Agent 只负责读取需求、派发 Sub Agent、审核结果、维护上下文，以及在主工作区做仓库准备操作与只读检查。
- 所有开发动作都必须由 Sub Agent 执行，包括 spec、implementation plan、代码、测试、验证、commit、push、PR、review 修复、merge 与清理。
- AIM 生命周期上报不会放宽任何 Git / worktree / PR 约束。
- 这是“已有 AIM Task 的开发执行入口技能”，不是授权主 Agent 直接下场开发的例外。

## 环境与接口

- `SERVER_BASE_URL` 默认为 `http://localhost:8192`。
- 读取 Task Spec 只能使用 `GET ${SERVER_BASE_URL}/tasks/${task_id}/spec`。
- `worktree_path` 上报使用 `PUT ${SERVER_BASE_URL}/tasks/${task_id}/worktree_path`。
- `pull_request_url` 上报使用 `PUT ${SERVER_BASE_URL}/tasks/${task_id}/pull_request_url`。
- `dependencies` 上报使用 `PUT ${SERVER_BASE_URL}/tasks/${task_id}/dependencies`。
- 成功终态通过 OpenCode session tool `aim_session_resolve({ value })` 完成。
- 失败终态通过 OpenCode session tool `aim_session_reject({ reason })` 完成。

## 主流程

按下面顺序推进，不要重排。

1. 使用 `task_id` 访问 AIM Server，读取 Task Spec 与当前任务事实上下文。
2. 获取最新基线，并调用 `aim-verify-task-spec` 做只读基线验证。
3. 如果基线验证失败，直接调用 `aim_session_reject({ reason })`；不要继续创建 worktree 或进入实现。
4. 如果基线验证通过，再基于最新 `origin/main` 创建 git worktree，并上报 `worktree_path`。
5. 在该 worktree 中调用 `aim-test-driven-development` 执行完整 TDD 与必要验证。
6. 验证全部通过后，创建 GitHub PR，立即启用 Auto Merge（Squash），并上报 `pull_request_url`。
7. 持续跟进该 PR，修复 checks、review、mergeability 或 auto-merge 阻塞，直到 PR 合并。
8. PR 终态成立后，清理并删除对应 worktree。
9. 回到主工作区执行 `git fetch origin && git checkout origin/main`，刷新本地基线。
10. 只有在以上步骤全部完成后，才能调用 `aim_session_resolve({ value })`，并将 session 视为真正完成。

## 分步操作说明

### 1. 读取 Task 与 Spec

- 当且仅当需要读取、核对或复述 Task Spec 时，使用 `GET ${SERVER_BASE_URL:-http://localhost:8192}/tasks/${task_id}/spec`。
- 该接口成功时返回原始 Markdown 文本，不是 JSON；应把响应体直接当作 Spec 正文。
- 本地 `.aim/task-specs/` 只是运行时产物，不是允许的事实源，不能替代 API。
- 不存在“Spec API 失败后退回本地文件”的例外。

### 2. 拉取最新基线并做只读验证

- 在主工作区先执行 `git fetch origin`，确保本地 `origin/main` 是最新基线。
- 然后加载 `aim-verify-task-spec`，按其要求对 Spec 是否仍可基于最新基线执行进行只读验证。
- 此阶段只允许读取和验证，不允许提前创建 worktree、写 spec、改代码或进入实现。

### 3. 区分验证失败与链路失败

- Spec 验证失败：表示 Task Spec 与最新基线不再匹配、关键前提已失效、或继续执行会偏离任务目标。这是任务本身失败，应使用 `aim_session_reject({ reason })`，并在 `reason` 里写清基线失配原因。
- Spec API 失败、字段级 PUT 失败、AIM terminal session tool 调用失败：这是输入链路或上报链路阻塞，不是任务本身失败。必须显式暴露阻塞，停止声称 AIM 已同步成功，但不要把任务误判为失败。

### 4. 创建 worktree 并开始执行

- 只有在验证通过后，才能基于最新 `origin/main` 创建新的 git worktree。
- worktree 只能创建在 `<repo>/.worktrees/` 下。
- 所有开发动作都必须在该 worktree 中执行，并与该 Task 绑定到同一分支、同一 PR。
- worktree 创建后，通过字段级 PUT 上报已知的 `worktree_path`。

### 5. 用 `aim-test-driven-development` 执行

- 创建 worktree 后，加载 `aim-test-driven-development`，按真实测试优先纪律完成实现。
- spec、implementation plan、实现、验证、commit、push、PR 修复都必须留在同一个 worktree 闭环内。
- push 前必须先在 worktree 中执行 `git fetch origin`，再执行 `git rebase origin/main`。

### 6. 创建 PR 并启用 Auto Merge

- 只有在该 Task 范围内的验证全部通过后，才创建 GitHub PR。
- PR 创建后立刻尝试启用 Auto Merge，并要求使用 Squash。
- PR 创建成功后，若 `pull_request_url` 已知则立即通过字段级 PUT 单独上报，不要拖延。
- 如果 Auto Merge 因权限、仓库策略或平台状态无法立即启用，必须把它当作真实阻塞继续跟进，而不是把流程视为已完成。

### 7. 持续跟进 PR 直到合并

- PR 创建后，持续跟进 checks、review、mergeability 与 auto-merge 状态；跟进 required checks 时可使用 `gh pr checks <pull_request_url or pr_number> --watch --required` 等待状态变化，避免手动轮询。
- 跟进时必须检查 PR 是否需要 update、是否落后于 base branch、或是否被 Linear History Rule 阻塞；若需要 update，必须在同一 worktree、同一分支、同一 PR 中按仓库规则处理，优先执行 `git fetch origin` 与 `git rebase origin/main` 更新分支后再 push，并继续跟进。
- 如果 checks 失败且原因仍在当前任务 scope 内，必须在同一 worktree、同一分支、同一 PR 中修复、验证、push，并继续跟进。
- 如果 checks 失败原因超出当前任务 scope，或 review 意见与 spec / scope / 权限边界冲突，必须升级决策，不得擅自扩大范围。
- 当 checks 全部通过、没有 blocking review、没有 merge conflict、保护规则满足且 auto-merge 可用时，应继续推动合并；不要把“PR 已创建”当作任务完成。

### 8. 清理与关闭

- PR 已合并、关闭或确认废弃后，继续完成 review 收尾、删除 worktree，并确认不再需要该 worktree。
- 删除 worktree 后，必须回到主工作区执行 `git fetch origin && git checkout origin/main`。
- 只有在 PR 终态成立、worktree 已删除、主工作区基线已刷新后，才能调用 `aim_session_resolve({ value })`，并把 bound session 视为真正完成。

## Session 终态

- 成功终态只通过 `aim_session_resolve({ value })` 完成，`value` 必须是非空完成摘要。
- 失败终态只通过 `aim_session_reject({ reason })` 完成，`reason` 必须是非空失败原因。
- Task 的完成状态由 bound OpenCode session 的终态派生；不要把内部步骤改写成 task status。

## 必须上报的时点

1. worktree 创建后：通过字段级 PUT 补充 `worktree_path`。
2. PR 创建后：通过字段级 PUT 补充 `pull_request_url`。
3. 依赖关系变化时：通过字段级 PUT 补充 `dependencies`。
4. 最终成功完成时：调用 `aim_session_resolve({ value })`，其中 `value` 为非空完成摘要。
5. 任务本身失败时：调用 `aim_session_reject({ reason })`，其中 `reason` 为非空失败原因。

只要 `worktree_path`、`pull_request_url` 或 `dependencies` 有新增或变化，应使用对应字段级 PUT 单独上报。

## API 调用规则

- 字段级事实必须使用对应的 PUT 端点单独上报。
- `PUT /tasks/${task_id}/worktree_path` 的请求体必须且只能包含 `worktree_path`。
- `PUT /tasks/${task_id}/pull_request_url` 的请求体必须且只能包含 `pull_request_url`。
- `PUT /tasks/${task_id}/dependencies` 的请求体必须且只能包含 `dependencies`。
- 未知值必须省略，不能发送空字符串、伪造值或 `null` 占位。
- 成功终态只能使用 OpenCode session tool `aim_session_resolve({ value })`。
- 失败终态只能使用 OpenCode session tool `aim_session_reject({ reason })`。
- 终态成功的 `value` 必须是非空字符串。
- 终态失败的 `reason` 必须是非空字符串。
- 除非字段级 PUT 或 terminal session tool 实际成功，否则不要声称 AIM 已拥有最新事实。

### Worktree Path 示例

```bash
curl -X PUT "${SERVER_BASE_URL:-http://localhost:8192}/tasks/${task_id}/worktree_path" \
  -H "Content-Type: application/json" \
  --data '{
    "worktree_path": "/repo/.worktrees/task-123"
  }'
```

### Pull Request URL 示例

```bash
curl -X PUT "${SERVER_BASE_URL:-http://localhost:8192}/tasks/${task_id}/pull_request_url" \
  -H "Content-Type: application/json" \
  --data '{
    "pull_request_url": "https://github.com/org/repo/pull/123"
  }'
```

### Dependencies 示例

```bash
curl -X PUT "${SERVER_BASE_URL:-http://localhost:8192}/tasks/${task_id}/dependencies" \
  -H "Content-Type: application/json" \
  --data '{
    "dependencies": ["task-api", "task-docs"]
  }'
```

### 终态成功示例

```ts
aim_session_resolve({
  value: "PR merged, worktree removed, and local baseline refreshed.",
})
```

### 终态失败示例

```ts
aim_session_reject({
  reason: "Task Spec no longer matches the latest baseline and must be replanned.",
})
```

## 失败处理

要把任务失败与上报失败区分开。

- 任务失败：工作本身失败，因此应通过 `aim_session_reject({ reason })` 发送带非空 `reason` 的终态失败结算。
- 上报失败：字段级 PUT 请求或 terminal session tool 调用因网络、超时、连接、5xx 或意外响应等问题失败。不要把这类情况转换成任务失败。
- Task Spec 获取失败：`GET /tasks/${task_id}/spec` 因 404、网络、超时、连接、5xx、空响应或畸形响应等问题无法提供可用 Markdown。把它视为输入 / 上报链路阻塞，不要把这类情况转换成任务失败，也不要继续依赖本地文件推进。

对于单个 AIM 请求，最多尝试三次：首次请求加最多两次重试。可采用简短重试，例如先等 1 秒，再等 5 秒。如果服务端明确返回 4xx 输入错误，则停止重试，并暴露输入问题。

如果所有重试都失败，必须明确暴露 AIM 上报阻塞，并附带 task id、目标 URL、上报时点以及最终错误摘要。要说明业务事实可能已经发生，但 AIM 未被成功更新。重试耗尽后，不要声称该阶段已经同步。

如果 Task Spec API 无法返回可用 Markdown，也必须明确暴露 Spec 读取阻塞，并附带 task id、目标 URL 以及最终错误摘要。要说明当前阻塞的是 Spec 输入 / AIM 链路，而不是任务已被判定失败；在阻塞解除前，不要继续依赖猜测的 Spec 推进。
