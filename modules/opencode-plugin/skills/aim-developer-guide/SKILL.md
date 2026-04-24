---
name: aim-developer-guide
description: Required entry skill when you are an AIM Developer working on an existing AIM Task and must read the task via AIM Server, validate it against the latest baseline, execute the worktree and PR lifecycle, report status, and resolve or reject the task.
---

## 何时使用

当你是 AIM Developer，且当前工作对应一个已存在的 AIM Task 时，必须先使用此技能。

此技能是 AIM Developer 处理既有 Task 的强制入口指南，用于把以下动作串成单一闭环：AIM developer guide 明确纪律。

1. 通过 `task_id` 从 AIM Server 读取任务与 Spec。
2. 先对最新基线做只读验证，再决定是否进入执行。
3. 按仓库规则创建并汇报 worktree。
4. 在 worktree 中完成 TDD、验证、提交、PR、follow-up、合并与清理。
5. 向 AIM 持续上报生命周期事实，并最终 resolve 或 reject Task。

不要用此技能来创建新 Task，也不要把 AIM 上报当作可替代实际 Git / worktree / PR 执行的编排器。

## 必需输入

- `task_id`：缺失时必须停止，直接暴露缺失输入，而不是猜测或发送请求。
- 当前事实快照：包含已知的 `status`、`worktree_path`、`pull_request_url`，如果这些值已经存在则应保留并继续沿用。

## 角色与边界

此技能不改写仓库 `AGENTS.md`，只把仓库要求映射为 AIM Developer 在单个 Task 上必须遵守的执行与上报纪律。

- 主 Agent 只负责读取需求、派发 Sub Agent、审核结果、维护上下文，以及在主工作区做仓库准备操作与只读检查。
- 所有开发动作都必须由 Sub Agent 执行，包括 spec、implementation plan、代码、测试、验证、commit、push、PR、review 修复、merge 与清理。
- AIM 生命周期上报不会放宽任何 Git / worktree / PR 约束。
- 这是“已有 AIM Task 的开发执行入口技能”，不是授权主 Agent 直接下场开发的例外。

## 环境与接口

- `SERVER_BASE_URL` 默认为 `http://localhost:8192`。
- 读取 Task Spec 只能使用 `GET ${SERVER_BASE_URL}/tasks/${task_id}/spec`。
- 非终态事实上报使用 `PATCH ${SERVER_BASE_URL}/tasks/${task_id}`。
- 成功终态上报使用 `POST ${SERVER_BASE_URL}/tasks/${task_id}/resolve`。
- 失败终态上报使用 `POST ${SERVER_BASE_URL}/tasks/${task_id}/reject`。

## 主流程

按下面顺序推进，不要重排。

1. 使用 `task_id` 访问 AIM Server，读取 Task Spec 与当前任务事实上下文。
2. 获取最新基线，并调用 `aim-verify-task-spec` 做只读基线验证。
3. 如果基线验证失败，直接 reject Task；不要继续创建 worktree 或进入实现。
4. 如果基线验证通过，再基于最新 `origin/main` 创建 git worktree，并上报 `worktree_path`。
5. 在该 worktree 中调用 `aim-test-driven-development` 执行完整 TDD 与必要验证。
6. 验证全部通过后，创建 GitHub PR，立即启用 Auto Merge（Squash），并上报 `pull_request_url`。
7. 持续跟进该 PR，修复 checks、review、mergeability 或 auto-merge 阻塞，直到 PR 合并。
8. PR 终态成立后，清理并删除对应 worktree。
9. 回到主工作区执行 `git fetch origin && git checkout origin/main`，刷新本地基线。
10. 只有在以上步骤全部完成后，才能向 AIM resolve Task，并将任务视为真正完成。

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

- Spec 验证失败：表示 Task Spec 与最新基线不再匹配、关键前提已失效、或继续执行会偏离任务目标。这是任务本身失败，应直接使用 `POST /tasks/${task_id}/reject` 上报，并在 `result` 里写清基线失配原因。
- Spec API 失败、AIM PATCH 失败、AIM resolve/reject 失败：这是输入链路或上报链路阻塞，不是任务本身失败。必须显式暴露阻塞，停止声称 AIM 已同步成功，但不要把任务误判为失败。

### 4. 创建 worktree 并开始执行

- 只有在验证通过后，才能基于最新 `origin/main` 创建新的 git worktree。
- worktree 只能创建在 `<repo>/.worktrees/` 下。
- 所有开发动作都必须在该 worktree 中执行，并与该 Task 绑定到同一分支、同一 PR。
- worktree 创建后，立即通过 PATCH 上报 `running` 与已知的 `worktree_path`。

### 5. 用 `aim-test-driven-development` 执行

- 创建 worktree 后，加载 `aim-test-driven-development`，按真实测试优先纪律完成实现。
- spec、implementation plan、实现、验证、commit、push、PR 修复都必须留在同一个 worktree 闭环内。
- push 前必须先在 worktree 中执行 `git fetch origin`，再执行 `git rebase origin/main`。

### 6. 创建 PR 并启用 Auto Merge

- 只有在该 Task 范围内的验证全部通过后，才创建 GitHub PR。
- PR 创建后立刻尝试启用 Auto Merge，并要求使用 Squash。
- PR 创建成功后，立即 PATCH `outbound`；若 `pull_request_url` 已知则一并上报，不要拖延。
- 如果 Auto Merge 因权限、仓库策略或平台状态无法立即启用，必须把它当作真实阻塞继续跟进，而不是把流程视为已完成。

### 7. 持续跟进 PR 直到合并

- PR 创建后，PATCH `pr_following`，并持续跟进 checks、review、mergeability 与 auto-merge 状态；跟进 required checks 时可使用 `gh pr checks <pull_request_url or pr_number> --watch --required` 等待状态变化，避免手动轮询。
- 跟进时必须检查 PR 是否需要 update、是否落后于 base branch、或是否被 Linear History Rule 阻塞；若需要 update，必须在同一 worktree、同一分支、同一 PR 中按仓库规则处理，优先执行 `git fetch origin` 与 `git rebase origin/main` 更新分支后再 push，并继续跟进。
- 如果 checks 失败且原因仍在当前任务 scope 内，必须在同一 worktree、同一分支、同一 PR 中修复、验证、push，并继续跟进。
- 如果 checks 失败原因超出当前任务 scope，或 review 意见与 spec / scope / 权限边界冲突，必须升级决策，不得擅自扩大范围。
- 当 checks 全部通过、没有 blocking review、没有 merge conflict、保护规则满足且 auto-merge 可用时，应继续推动合并；不要把“PR 已创建”当作任务完成。

### 8. 清理与关闭

- 只有当 PR 已合并、关闭或确认废弃后，才能进入 `closing`。
- 在 `closing` 阶段仍需处理相关 review / 后续 review、删除 worktree，并确认不再需要该 worktree。
- 删除 worktree 后，必须回到主工作区执行 `git fetch origin && git checkout origin/main`。
- 只有在 PR 终态成立、worktree 已删除、主工作区基线已刷新后，才能 `POST /resolve`，并把 Task 视为真正完成。

## 生命周期状态

- `created`：Task 已存在，但执行尚未真正开始。
- `waiting_assumptions`：执行因缺失前提、用户输入或外部条件而阻塞。
- `running`：已开始执行，且仍处于 PR 创建前的阶段；包括最新基线验证通过后、worktree 创建后、TDD / 实现 / 验证 / commit / push 前后的执行期。
- `outbound`：PR 已创建，并已上报 `pull_request_url`。
- `pr_following`：正在跟进 checks、review、mergeability 或 auto-merge。
- `closing`：PR 已合并、关闭或确认废弃，正在做 review 收尾、worktree 删除与主工作区基线刷新。
- `succeeded`：任务已成功完成，并通过 `POST /resolve` 上报。
- `failed`：任务已失败结束，并通过 `POST /reject` 上报。

## 允许的状态流转

- `created -> running`
- `created -> waiting_assumptions`
- `running -> waiting_assumptions`
- `waiting_assumptions -> running`
- `running -> outbound`
- `running -> failed`
- `outbound -> pr_following`
- `outbound -> closing`
- `outbound -> failed`
- `pr_following -> pr_following`
- `pr_following -> closing`
- `pr_following -> failed`
- `closing -> succeeded`
- `closing -> failed`

`running -> closing` 不是标准路径；不要把“未建 PR 就结束”写成正常成功流转。

## 必须上报的时点

1. 确认开始执行后：PATCH `running`。
2. worktree 创建后：继续 PATCH `running`，并补充 `worktree_path`。
3. 因缺失前提而阻塞时：PATCH `waiting_assumptions`。
4. PR 创建后：PATCH `outbound`，并在已知时携带 `pull_request_url`。
5. 开始跟进 PR 时：PATCH `pr_following`。
6. PR 已合并、关闭或确认废弃后：PATCH `closing`。
7. 最终成功完成时：`POST /resolve`，请求体只发送非空 `result`。
8. 任务本身失败时：`POST /reject`，请求体只发送非空 `result`。

只要 `worktree_path` 与 `pull_request_url` 仍然有效，后续 PATCH 应继续携带这些已知事实。

## API 调用规则

- 只能使用 PATCH 来更新已存在 Task 的非终态事实。
- 非终态事实上报只使用 `PATCH /tasks/${task_id}`。
- `PATCH` 只发送受支持且已知的字段：`status`、`worktree_path`、`pull_request_url`。
- 未知值必须省略，不能发送空字符串、伪造值或 `null` 占位。
- 在非终态 PATCH 上报中，只发送受支持的 patch 字段，绝不要通过发送 `done` 来指挥 AIM。
- 成功终态只能使用 `POST /tasks/${task_id}/resolve`。
- 失败终态只能使用 `POST /tasks/${task_id}/reject`。
- 只能使用 `POST /resolve` 上报 `succeeded` 终态结果，且只能使用 `POST /reject` 上报 `failed` 终态结果。
- 终态上报的请求体必须且只能包含一个非空 `result` 字符串字段。
- 终态请求体必须且只能包含一个非空 `result` 字符串字段。
- 除非 PATCH 或终态 POST 实际成功，否则不要声称 AIM 已拥有最新事实。

### Running 示例

```bash
curl -X PATCH "${SERVER_BASE_URL:-http://localhost:8192}/tasks/${task_id}" \
  -H "Content-Type: application/json" \
  --data '{
    "status": "running",
    "worktree_path": "/repo/.worktrees/task-123"
  }'
```

### Outbound 示例

```bash
curl -X PATCH "${SERVER_BASE_URL:-http://localhost:8192}/tasks/${task_id}" \
  -H "Content-Type: application/json" \
  --data '{
    "status": "outbound",
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

### 终态失败示例

```bash
curl -X POST "${SERVER_BASE_URL:-http://localhost:8192}/tasks/${task_id}/reject" \
  -H "Content-Type: application/json" \
  --data '{
    "result": "Task Spec no longer matches the latest baseline and must be replanned."
  }'
```

## 失败处理

要把任务失败与上报失败区分开。

- 任务失败：工作本身失败，因此应通过 `POST /tasks/${task_id}/reject` 发送带非空 `result` 的终态失败上报。
- 上报失败：PATCH 请求或终态 POST 因网络、超时、连接、5xx 或意外响应等问题失败。不要把这类情况转换成任务失败。
- Task Spec 获取失败：`GET /tasks/${task_id}/spec` 因 404、网络、超时、连接、5xx、空响应或畸形响应等问题无法提供可用 Markdown。把它视为输入 / 上报链路阻塞，不要把这类情况转换成任务失败，也不要继续依赖本地文件推进。

对于单个 AIM 请求，最多尝试三次：首次请求加最多两次重试。可采用简短重试，例如先等 1 秒，再等 5 秒。如果服务端明确返回 4xx 输入错误，则停止重试，并暴露输入问题。

如果所有重试都失败，必须明确暴露 AIM 上报阻塞，并附带 task id、目标 URL、上报时点以及最终错误摘要。要说明业务事实可能已经发生，但 AIM 未被成功更新。重试耗尽后，不要声称该阶段已经同步。

如果 Task Spec API 无法返回可用 Markdown，也必须明确暴露 Spec 读取阻塞，并附带 task id、目标 URL 以及最终错误摘要。要说明当前阻塞的是 Spec 输入 / AIM 链路，而不是任务已被判定失败；在阻塞解除前，不要继续依赖猜测的 Spec 推进。
