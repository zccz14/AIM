import type { Task } from "@aim-ai/contract";

type TaskPromptAction = "continue" | "start";

const formatTaskPromptAction = (action: TaskPromptAction) =>
  action === "start" ? "Start" : "Continue";

const formatTaskPromptInstruction = (action: TaskPromptAction) =>
  action === "start"
    ? "Start this task from scratch and follow the normal session workflow. Follow the packaged skill aim-task-lifecycle for lifecycle/status reporting and workflow expectations during initial execution."
    : "Continue this task from its current state through the normal session workflow. Follow the aim-task-lifecycle SKILL.";

export const buildTaskSessionPrompt = (
  action: TaskPromptAction,
  task: Task,
) => `${formatTaskPromptAction(action)} the assigned task session.

AIM Task Context:
- task_id: ${task.task_id}
- session_id: ${task.session_id ?? "(not set)"}
- status: ${task.status}
- project_path: ${task.project_path}
- worktree_path: ${task.worktree_path ?? "(not set)"}
- pull_request_url: ${task.pull_request_url ?? "(not set)"}

If you need to read or verify the task spec, use GET /tasks/${task.task_id}/spec.
${
  action === "start"
    ? `Before starting work, fetch the task spec from GET /tasks/${task.task_id}/spec.
`
    : ""
}Do not rely on any local .aim/task-specs/*.md runtime file.
Do not expose task_spec_file or embed the full task_spec body.

Don't Ask My Any Questions. Just Follow your Recommendations and Continue.
I agree all recommendations and decisions should be made based on the above context.

${formatTaskPromptInstruction(action)}
If you cannot continue, write the task's failure state.
This task should finally use resolve or reject to report its completion or failure.
When the task is complete, write done=true.
`;

export const buildContinuePrompt = (task: Task) =>
  buildTaskSessionPrompt("continue", task);
