import type { Task } from "@aim-ai/contract";

export type TaskSuccessEvent =
  | "task_created"
  | "task_session_bound"
  | "task_session_continued"
  | "task_resolved"
  | "task_rejected";

type TaskLogSnapshot = Pick<
  Task,
  "project_id" | "result" | "session_id" | "status" | "task_id"
>;

const resultPreviewLimit = 200;

export const buildTaskResultPreview = (result: string) =>
  result.slice(0, resultPreviewLimit);

export const buildTaskLogFields = (
  event: TaskSuccessEvent,
  task: TaskLogSnapshot,
) => ({
  event,
  task_id: task.task_id,
  ...(task.session_id ? { session_id: task.session_id } : {}),
  ...(task.status ? { status: task.status } : {}),
  ...(task.project_id ? { project_id: task.project_id } : {}),
  ...((event === "task_resolved" || event === "task_rejected") &&
  typeof task.result === "string"
    ? { result_preview: buildTaskResultPreview(task.result) }
    : {}),
});
