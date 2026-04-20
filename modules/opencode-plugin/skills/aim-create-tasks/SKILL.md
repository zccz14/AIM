---
name: aim-create-tasks
description: Use when turning approved user intent into AIM Task creation proposals and eventual POST /tasks writes without replacing scheduler ordering or later execution workflows.
---

# aim-create-tasks

## When to use

Use this skill when the user wants to create new AIM Tasks from a requirement, feature request, bug report, or scoped project outcome.

Do not use this skill to replace scheduler ordering.
Do not use this skill to replace `aim-verify-task-spec`, implementation plan writing, or `aim-task-lifecycle`.
Do not replace scheduler ordering.

## Required inputs

- A clear user goal.
- An explicit `project_path`.
- Enough context to write a stable five-part Task Spec.

## Process

### 1. Interview first

Interview first; do not create tasks from a vague request.
Do not guess `project_path`.

Clarify the target outcome, non-goals, important constraints, value tradeoffs, and any known nearby AIM Tasks or specs before drafting candidates.

### 2. Explore the latest baseline before proposing tasks

Review the latest baseline, related existing AIM Tasks, and nearby Task Specs or design docs before proposing new tasks.

This exploration is for duplicate detection, assumption quality, and scope alignment. It is not a license to write an implementation plan or execution checklist.

### 3. Propose candidate tasks before any write

Candidate tasks must include the full five-part Task Spec:
- `Title`
- `Assumptions`
- `Goal vs Non-Goal`
- `Core Path`
- `Value Alignment`

Each candidate must also include `project_path` and optional `dependencies` with a short rationale.

Do not collapse the proposal into title-only bullets, issue summaries, or implementation notes.

### 4. Approval gate

Wait for explicit user approval before any create call.
Discussion, refinement, or "looks close" is not approval.
Wait for explicit user approval before any create call.

### 5. Create tasks only after approval

Use POST only after approval:

```bash
curl -X POST "${SERVER_BASE_URL:-http://localhost:8192}/tasks" \
  -H "Content-Type: application/json" \
  --data '{
    "task_spec": "# Title\n\n## Assumptions\n...",
    "project_path": "/abs/path/to/repo",
    "dependencies": ["task-id-a"]
  }'
```

The write target is `POST ${SERVER_BASE_URL:-http://localhost:8192}/tasks`.
`task_spec` and `project_path` are required for creation.
`dependencies` are soft hints, not scheduler gates.
If a candidate has no useful dependency hint, send an empty array or omit the field if the server contract allows it.

After successful creates, report each created Task identifier back to the user.

## Failure handling

- If the goal is still vague, keep interviewing instead of creating tasks.
- If `project_path` is missing, stop and ask for it.
- If baseline exploration is incomplete, do not draft final candidate tasks yet.
- If the user has not explicitly approved the candidate list, do not call `POST /tasks`.
- After successful creates, report each created Task identifier back to the user.
- If `POST /tasks` fails, report which tasks were created, which failed, and why.

Split content problems from transport problems when reporting failure. Missing `task_spec`, invalid `project_path`, or malformed payloads are request issues. Timeouts, connection failures, or unexpected server responses are infrastructure issues.

## Boundaries

- `aim-create-tasks` does not replace scheduler ordering.
- `aim-create-tasks` does not replace `aim-verify-task-spec`.
- `aim-create-tasks` stops at Task creation and does not write the implementation plan.
- `aim-create-tasks` does not replace `aim-task-lifecycle` reporting.

## Common mistakes

- Mistake: Creating tasks after only a title-level request.
  Fix: Continue the interview until the goal, non-goals, value tradeoffs, and `project_path` are explicit enough for a full Task Spec.
- Mistake: Treating `dependencies` as hard execution gates.
  Fix: Keep them as soft hints; scheduler and latest-baseline checks can reorder or ignore them.
- Mistake: Writing implementation plans during task creation.
  Fix: Stop at Task creation; implementation planning belongs to later execution work.
- Mistake: Guessing the repository path or skipping baseline exploration to move faster.
  Fix: Ask for the explicit `project_path`, inspect the latest baseline and nearby AIM artifacts, then return with candidate Task Specs for approval.
