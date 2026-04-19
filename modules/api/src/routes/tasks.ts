import {
  createTaskRequestSchema,
  patchTaskRequestSchema,
  type Task,
  type TaskStatus,
  taskByIdPath,
  taskErrorSchema,
  taskListResponseSchema,
  taskSchema,
  tasksPath,
} from "@aim-ai/contract";
import type { Hono } from "hono";

const stubTimestamp = "2026-04-19T00:00:00.000Z";
const taskByIdRoutePath = taskByIdPath.replace("{taskId}", ":taskId");

const isDoneStatus = (status: TaskStatus) =>
  status === "succeeded" || status === "failed";

const buildTask = (
  overrides: Partial<Omit<Task, "done">> & Pick<Task, "task_id">,
) => {
  const status = overrides.status ?? "created";

  return taskSchema.parse({
    task_id: overrides.task_id,
    task_spec: overrides.task_spec ?? "stub task spec",
    session_id: overrides.session_id ?? null,
    worktree_path: overrides.worktree_path ?? null,
    pull_request_url: overrides.pull_request_url ?? null,
    dependencies: overrides.dependencies ?? [],
    done: isDoneStatus(status),
    status,
    created_at: overrides.created_at ?? stubTimestamp,
    updated_at: overrides.updated_at ?? stubTimestamp,
  });
};

const buildNotFoundError = (taskId: string) =>
  taskErrorSchema.parse({
    code: "TASK_NOT_FOUND",
    message: `Task ${taskId} was not found`,
  });

const requireTaskId = (taskId: string | undefined) => taskId ?? "task-unknown";

export const registerTaskRoutes = (app: Hono) => {
  app.get(tasksPath, (context) => {
    const payload = taskListResponseSchema.parse({
      items: [buildTask({ task_id: "task-123" })],
    });

    return context.json(payload, 200);
  });

  app.post(tasksPath, async (context) => {
    const input = createTaskRequestSchema.parse(await context.req.json());
    const payload = buildTask({
      task_id: "task-123",
      task_spec: input.task_spec,
      session_id: input.session_id ?? null,
      worktree_path: input.worktree_path ?? null,
      pull_request_url: input.pull_request_url ?? null,
      dependencies: input.dependencies ?? [],
      status: input.status ?? "created",
    });

    return context.json(payload, 201);
  });

  app.get(taskByIdRoutePath, (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));

    if (taskId === "task-404") {
      return context.json(buildNotFoundError(taskId), 404);
    }

    return context.json(buildTask({ task_id: taskId }), 200);
  });

  app.patch(taskByIdRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));
    const patch = patchTaskRequestSchema.parse(await context.req.json());
    const stubTask = buildTask({ task_id: taskId });
    const payload = buildTask({
      ...stubTask,
      ...patch,
      task_id: taskId,
    });

    return context.json(payload, 200);
  });

  app.delete(taskByIdRoutePath, () => new Response(null, { status: 204 }));
};
