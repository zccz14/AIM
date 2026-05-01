import type { Task } from "@aim-ai/contract";

export type BaselineFacts = {
  commitSha: string;
  fetchedAt: string;
  summary: string;
};

export type TaskSessionPromptContext = {
  activeTasks: Task[];
  baselineFacts: BaselineFacts;
  rejectedTasks: Task[];
};

const formatTaskSummary = (task: Task) => {
  const freshness = task.source_baseline_freshness;

  return [
    `- task_id: ${task.task_id}`,
    `  title: ${task.title}`,
    `  status: ${task.status}`,
    `  done: ${task.done}`,
    `  session_id: ${task.session_id ?? "not recorded"}`,
    `  worktree_path: ${task.worktree_path ?? "not recorded"}`,
    `  pull_request_url: ${task.pull_request_url ?? "not recorded"}`,
    `  source_baseline_freshness: ${freshness?.status ?? "unknown"}; ${freshness?.summary ?? "not set"}`,
  ].join("\n");
};

const formatRejectedTaskSummary = (task: Task) =>
  [
    formatTaskSummary(task),
    `  rejected_feedback: ${task.result || "not recorded"}`,
  ].join("\n");

const buildContextPromptSection = (context?: TaskSessionPromptContext) => {
  if (!context) {
    return "";
  }

  const activeTaskLines = context.activeTasks.length
    ? context.activeTasks.map(formatTaskSummary).join("\n")
    : "- none";
  const rejectedTaskLines = context.rejectedTasks.length
    ? context.rejectedTasks.map(formatRejectedTaskSummary).join("\n")
    : "- none";

  return `

Current baseline facts:
- origin/main commit: ${context.baselineFacts.commitSha}
- fetched_at: ${context.baselineFacts.fetchedAt}
- latest_commit_summary: ${context.baselineFacts.summary}

Current Active Task Pool:
${activeTaskLines}

Rejected Task feedback for this project:
${rejectedTaskLines}

source_baseline_freshness guardrails:
- Treat stale or unknown source_baseline_freshness as a collision warning, not permission to proceed blindly.
- Before editing, compare the task source baseline against the latest origin/main facts above.
- Avoid duplicating or conflicting with same-project unfinished Tasks in the Active Task Pool.
- Account for rejected Task feedback before continuing implementation.
`;
};

export const buildTaskSessionPrompt = (
  task: Task,
  context?: TaskSessionPromptContext,
) => `
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
${buildContextPromptSection(context)}

Final status reporting is concise: resolved only after the GitHub PR is merged, the worktree is cleaned up, and the local main branch is refreshed to origin/main; rejected only when Task Spec verification fails.

DON'T ASK ME ANY QUESTIONS. Just Follow your Recommendations and Continue. I agree with all your actions.
`;
