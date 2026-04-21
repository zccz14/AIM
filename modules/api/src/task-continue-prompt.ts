import { join } from "node:path";
import type { Task } from "@aim-ai/contract";

export const getTaskSpecFilename = (task: Task) =>
  join(task.project_path, `.aim/task-specs/${task.task_id}.md`);

export const buildContinuePrompt = (
  task: Task,
) => `Continue the assigned task session.

AIM Task Context:
- task_id: ${task.task_id}
- task_spec_file: ${getTaskSpecFilename(task)}
- session_id: ${task.session_id}
- status: ${task.status}
- worktree_path: ${task.worktree_path ?? "(not set)"}
- pull_request_url: ${task.pull_request_url ?? "(not set)"}

Don't Ask My Any Questions. Just Follow your Recommendations and Continue. 
I agree all recommendations and decisions should be made based on the above context.

Follow the aim-task-lifecycle SKILL.
This task should finally use resolve or reject to report its completion or failure.
`;
