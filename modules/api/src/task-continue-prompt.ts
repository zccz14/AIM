import type { Task } from "@aim-ai/contract";

const formatOptionalField = (label: string, value: null | string) =>
  `${label}: ${value ?? "null"}`;

export const buildContinuePrompt = (
  task: Task,
) => `Continue the assigned task session.

task_id: ${task.task_id}
task_spec: ${task.task_spec}
status: ${task.status}
${formatOptionalField("worktree_path", task.worktree_path)}
${formatOptionalField("pull_request_url", task.pull_request_url)}

Continue this task from its current state. Update the task's DB state yourself through the session's normal task workflow as progress changes.`;
