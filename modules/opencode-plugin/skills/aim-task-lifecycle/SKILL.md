---
name: aim-task-lifecycle
description: Report AIM task lifecycle facts to the existing Task record via PATCH.
---

## When to use

Use this skill when the current work maps to an existing AIM Task and the agent must keep AIM updated with lifecycle facts as they happen.

Do not use this skill to create tasks, replace repository AGENTS rules, or automate worktree / PR decisions.

## Required inputs

- `task_id` for the existing AIM Task record. If it is missing, stop and expose the missing input instead of sending a request.
- A current fact snapshot with the current lifecycle status plus any known `worktree_path` / `pull_request_url` values.

## Environment

- `SERVER_BASE_URL` defaults to `http://localhost:8192`.
- The only reporting target in v1 is `PATCH ${SERVER_BASE_URL}/tasks/${task_id}`.

## Lifecycle statuses

### Status meanings

- `created`: the Task already exists, but execution has not started.
- `waiting_assumptions`: execution is blocked on missing assumptions or user input; `done` must stay `false`.
- `running`: work has started, but the task has not reached the PR outbound stage yet.
- `outbound`: a PR exists and `pull_request_url` is known.
- `pr_following`: the agent is following PR checks, reviews, mergeability, or auto-merge state.
- `closing`: the task is in cleanup or final closing actions.
- `succeeded`: the task finished successfully and must be reported with `done = true`.
- `failed`: the task ended in a failure terminal state and must be reported with `done = true`.

### Allowed transitions

- `created -> running`
- `created -> waiting_assumptions`
- `running -> waiting_assumptions`
- `waiting_assumptions -> running`
- `running -> outbound`
- `running -> failed`
- `outbound -> pr_following`
- `outbound -> closing`
- `outbound -> failed`
- `pr_following -> pr_following` for repeated follow-up reports while the task stays in the PR follow-up phase.
- `pr_following -> closing`
- `pr_following -> failed`
- `closing -> succeeded`
- `closing -> failed`

`running -> closing` is not a standard v1 path and should not be documented as a normal transition.

### `done` rules

- `done` must be `false` for `created`, `waiting_assumptions`, `running`, `outbound`, `pr_following`, and `closing`.
- `done` must be `true` only for `succeeded` and `failed`.
- Never report `done = true` with a non-terminal status.
- After a successful terminal write, do not move back to a non-terminal status.

## Required reporting moments

Reporting must happen during the lifecycle and must not be deferred until only the final terminal state.

1. Start of execution: report `running` with `done = false`.
2. After worktree creation: report the known `worktree_path` while staying in `running`.
3. After PR creation: report `outbound`, `done = false`, and `pull_request_url`.
4. During PR follow-up: report `pr_following`, `done = false`, and preserve known `pull_request_url` / `worktree_path`.
5. During closing: report `closing`, `done = false`, and preserve all known facts.
6. On success: report `succeeded`, `done = true`, and preserve all known facts.
7. On failure: report `failed`, `done = true`, and preserve all known facts.

Also report `waiting_assumptions` immediately when the task is blocked on missing assumptions or input.

## API call format

Every PATCH must include `status` and `done`. Add `worktree_path` and `pull_request_url` only when they are already known.

Unknown is not an empty string. Omit unknown fields instead of sending `""` or fabricated `null` placeholders.

The first version does not require field-clearing behavior.

### Running example

```bash
curl -X PATCH "${SERVER_BASE_URL:-http://localhost:8192}/tasks/${task_id}" \
  -H "Content-Type: application/json" \
  --data '{
    "status": "running",
    "done": false
  }'
```

### Outbound example

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

### Terminal success example

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

## Rules

- Use PATCH only to update an existing Task.
- Keep `status` and `done` aligned with the lifecycle rules above.
- Continue carrying known `worktree_path` and `pull_request_url` in later reports when they are still true.
- Do not claim AIM has the latest fact unless the PATCH actually succeeded.
- This skill is a reporting discipline, not an execution orchestrator.

## Failure handling

Separate task failure from reporting failure.

- Task failure: the work itself has failed, so report `status = failed` and `done = true`.
- Reporting failure: the PATCH request failed due to network, timeout, connection, 5xx, or unexpected response problems. Do not convert this into a task failure.

Use at most three attempts total for one reporting moment: the initial request plus up to two retries. A short retry pattern such as 1 second then 5 seconds is acceptable. If the server returns a clear 4xx input error, stop retrying and expose the input problem.

If all retries fail, explicitly surface the AIM reporting blocker with the task id, target URL, reporting moment, and the final error summary. State that the business fact happened but AIM was not successfully updated. After retry exhaustion, do not claim the phase was synced.
