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

const summarizeTask = (task: Task) =>
  `- ${task.title} (${task.task_id}) status ${task.status} session ${task.session_id ?? "(not set)"}`;

const summarizeRejectedTask = (task: Task) => {
  const validation = task.source_metadata.task_spec_validation;
  const validationSummary =
    typeof validation === "object" && validation !== null
      ? Object.entries(validation as Record<string, unknown>)
          .filter(([key]) =>
            [
              "conclusion",
              "conclusion_summary",
              "failure_reason",
              "blocking_assumptions",
            ].includes(key),
          )
          .map(([key, value]) => `${key}: ${String(value)}`)
          .join("; ")
      : "no task_spec_validation metadata";

  const result = task.result || "no result";
  const separator = /[.!?]$/.test(result) ? "" : ".";

  return `- ${task.title} (${task.task_id}) rejected at ${task.updated_at}: ${result}${separator} ${validationSummary}`;
};

export const buildTaskSessionPrompt = (
  task: Task,
  context?: TaskSessionPromptContext,
) => `
You are the AIM developer.

FOLLOW the aim-developer-guide SKILL and finish the task assigned to you by AIM Coordinator.

Remember reporting the final status to AIM API Server. The task's final status is either 'resolved' or 'rejected'.
1. resolved: "GitHub PR is merged" AND "local worktree is cleaned up" AND "local main branch is refreshed to origin/main".
2. rejected: The task spec's verification steps have FAILED.

You should retry if you encounter any other failure, such as CI failure, test failure, or any other error during the execution of the task.

AIM Task Context:
- task_id: ${task.task_id}
- session_id: ${task.session_id ?? "(not set)"}
- status: ${task.status}
- project_id: ${task.project_id}
- git_origin_url: ${task.git_origin_url}
- worktree_path: ${task.worktree_path ?? "(not set)"}
- pull_request_url: ${task.pull_request_url ?? "(not set)"}

Read the task spec by GET /tasks/${task.task_id}/spec.

${
  context
    ? `Current baseline facts:
- origin/main commit "${context.baselineFacts.commitSha}" fetched at ${context.baselineFacts.fetchedAt}: ${context.baselineFacts.summary}

Current Active Task Pool:
${context.activeTasks.map(summarizeTask).join("\n") || "- none"}

Rejected Task feedback for this project:
${context.rejectedTasks.map(summarizeRejectedTask).join("\n") || "- none"}

Spec freshness guardrails:
- Before creating or using a worktree, read GET /tasks/${task.task_id}/spec and verify its assumptions against the current baseline facts, Active Task Pool, and rejected feedback below.
- Reject the Task if the spec is stale, self-overlaps with unfinished work, conflicts with rejected feedback, or its verification assumptions fail.`
    : ""
}

DON'T ASK ME ANY QUESTIONS. Just Follow your Recommendations and Continue. I agree with all your actions.
`;
