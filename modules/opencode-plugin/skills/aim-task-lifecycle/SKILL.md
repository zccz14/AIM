---
name: aim-task-lifecycle
description: Report AIM task lifecycle facts to an existing AIM Task during non-terminal PATCH updates and terminal resolve/reject reporting.
---

## 何时使用

当当前工作对应到一个已存在的 AIM Task，并且 agent 必须在生命周期事实发生时持续把这些事实同步回 AIM 时，使用此技能。

不要用此技能来创建任务、替代仓库 AGENTS 规则，或自动决定 worktree / PR 流程。

## 必需输入

- 已存在 AIM Task 记录的 `task_id`。如果缺失，必须停止，并暴露缺失的输入，而不是发送请求。
- 当前事实快照：包含当前生命周期状态，以及任何已知的 `worktree_path` / `pull_request_url` 值。

## 环境

- `SERVER_BASE_URL` 默认为 `http://localhost:8192`。
- 非终态生命周期更新使用 `PATCH ${SERVER_BASE_URL}/tasks/${task_id}`。
- 成功终态上报使用 `POST ${SERVER_BASE_URL}/tasks/${task_id}/resolve`。
- 失败终态上报使用 `POST ${SERVER_BASE_URL}/tasks/${task_id}/reject`。

## 生命周期状态

### 状态含义

- `created`：Task 已存在，但执行尚未开始。
- `waiting_assumptions`：执行因缺失前提假设或用户输入而阻塞；`done` 必须保持为 `false`。
- `running`：工作已经开始，但任务尚未到达 PR 出站阶段。
- `outbound`：PR 已存在，且 `pull_request_url` 已知。
- `pr_following`：agent 正在跟进 PR checks、reviews、mergeability 或 auto-merge 状态。
- `closing`：任务处于清理或最终关闭动作阶段。
- `succeeded`：任务成功完成，且必须以 `done = true` 上报。
- `failed`：任务以失败终态结束，且必须以 `done = true` 上报。

### 允许的状态流转

- `created -> running`
- `created -> waiting_assumptions`
- `running -> waiting_assumptions`
- `waiting_assumptions -> running`
- `running -> outbound`
- `running -> failed`
- `outbound -> pr_following`
- `outbound -> closing`
- `outbound -> failed`
- `pr_following -> pr_following`：当任务仍处于 PR 跟进阶段时，可用于重复的 follow-up 上报。
- `pr_following -> closing`
- `pr_following -> failed`
- `closing -> succeeded`
- `closing -> failed`

`running -> closing` 不是标准的 v1 路径，不应被写作正常状态流转。

### `done` 规则

- 对于 `created`、`waiting_assumptions`、`running`、`outbound`、`pr_following` 和 `closing`，`done` 必须为 `false`。
- 只有 `succeeded` 和 `failed` 的 `done` 必须为 `true`。
- 绝不要在非终态状态下上报 `done = true`。
- 终态写入一旦成功，不要再回退到非终态状态。

## 必须上报的时点

上报必须在生命周期过程中进行，不能拖延到只剩最终终态时才上报。

1. 执行开始时：上报 `running`，并带上 `done = false`。
2. worktree 创建后：在保持 `running` 的同时，上报已知的 `worktree_path`。
3. PR 创建后：上报 `outbound`、`done = false` 和 `pull_request_url`。
4. PR 跟进期间：上报 `pr_following`、`done = false`，并保留已知的 `pull_request_url` / `worktree_path`。
5. closing 期间：上报 `closing`、`done = false`，并保留所有已知事实。
6. 成功时：通过 `POST /tasks/${task_id}/resolve` 上报终态事实，并携带非空 `result`。
7. 失败时：通过 `POST /tasks/${task_id}/reject` 上报终态事实，并携带非空 `result`。

当任务因缺失前提假设或输入而被阻塞时，也要立即上报 `waiting_assumptions`。

## API 调用格式

每个 PATCH 都必须包含 `status` 和 `done`。只有在 `worktree_path` 和 `pull_request_url` 已知时，才添加这两个字段。

终态上报不使用 PATCH。对 `succeeded` 使用 `POST /resolve`，对 `failed` 使用 `POST /reject`，并在请求体中只发送一个必填且非空的 `result` 字符串字段。

未知值不等于空字符串。对于未知字段，应省略，而不是发送 `""` 或伪造的 `null` 占位值。

第一个版本不要求支持清空字段的行为。

### Running 示例

```bash
curl -X PATCH "${SERVER_BASE_URL:-http://localhost:8192}/tasks/${task_id}" \
  -H "Content-Type: application/json" \
  --data '{
    "status": "running",
    "done": false
  }'
```

### Outbound 示例

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

### 终态成功示例

```bash
curl -X POST "${SERVER_BASE_URL:-http://localhost:8192}/tasks/${task_id}/resolve" \
  -H "Content-Type: application/json" \
  --data '{
    "result": "PR merged, worktree removed, and local baseline refreshed."
  }'
```

### Terminal failure example

```bash
curl -X POST "${SERVER_BASE_URL:-http://localhost:8192}/tasks/${task_id}/reject" \
  -H "Content-Type: application/json" \
  --data '{
    "result": "Spec assumptions no longer match the latest baseline and need replanning."
  }'
```

## 规则

- 只能使用 PATCH 来更新已存在 Task 的非终态事实。
- 只能使用 `POST /resolve` 上报 `succeeded` 终态，且只能使用 `POST /reject` 上报 `failed` 终态。
- 保持 `status` 和 `done` 与上述生命周期规则一致。
- 终态上报的请求体必须且只能包含一个非空 `result` 字符串字段。
- 在后续非终态 PATCH 上报中，只要已知的 `worktree_path` 和 `pull_request_url` 仍然成立，就继续携带它们。
- 除非 PATCH 或终态 POST 实际成功，否则不要声称 AIM 已拥有最新事实。
- 这个技能是一种上报纪律，不是执行编排器。

## 失败处理

要把任务失败与上报失败区分开。

- 任务失败：工作本身失败，因此应通过 `POST /tasks/${task_id}/reject` 发送带非空 `result` 的终态失败上报。
- 上报失败：PATCH 请求或终态 POST 因网络、超时、连接、5xx 或意外响应等问题失败。不要把这类情况转换成任务失败。

对于单个上报时点，最多只进行三次尝试：首次请求加最多两次重试。可以采用简短的重试模式，例如先等 1 秒，再等 5 秒。如果服务端返回明确的 4xx 输入错误，则停止重试，并暴露输入问题。

如果所有重试都失败，必须明确暴露 AIM 上报阻塞，并附带 task id、目标 URL、上报时点以及最终错误摘要。要说明业务事实已经发生，但 AIM 未被成功更新。重试耗尽后，不要声称该阶段已经同步。
