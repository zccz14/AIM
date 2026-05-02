import type { Task } from "@aim-ai/contract";

export const buildTaskSessionPrompt = (task: Task) => `
You are the AIM developer.

FOLLOW the aim-developer-guide SKILL and finish the task assigned to you by AIM Coordinator.

AIM Server base URL: http://localhost:8192

Bootstrap identifiers:
- task_id: ${task.task_id}
- project_id: ${task.project_id}
- session_id: ${task.session_id ?? "not recorded"}
- worktree_path: ${task.worktree_path ?? "not recorded"}
- pull_request_url: ${task.pull_request_url ?? "not recorded"}

Before acting, fetch the current task facts from GET /tasks/${task.task_id} and the Task Spec from GET /tasks/${task.task_id}/spec. Do not rely on this bootstrap prompt as the full context source.

High-cost lifecycle warnings:
- If worktree_path is recorded, do not recreate the worktree; continue the existing lifecycle.
- If pull_request_url is recorded, do not recreate the PR; continue the existing lifecycle.
- If a lifecycle fact is not recorded, verify current task facts before creating anything.

Final status reporting is concise: resolved only after the GitHub PR is merged, the worktree is cleaned up, and the local main branch is refreshed to origin/main; rejected only when Task Spec verification fails.

DON'T ASK ME ANY QUESTIONS. Just Follow your Recommendations and Continue. I agree with all your actions.
`;
