import {
  createTaskRequestSchema,
  patchTaskRequestSchema,
  type Task,
  type TaskStatus,
  taskByIdPath,
  taskErrorSchema,
  taskListResponseSchema,
  taskSchema,
  taskStatusSchema,
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

const buildValidationError = (message: string) =>
  taskErrorSchema.parse({
    code: "TASK_VALIDATION_ERROR",
    message,
  });

const requireTaskId = (taskId: string | undefined) => taskId ?? "task-unknown";
const isMissingStubTask = (taskId: string) => taskId === "task-404";

const parseListFilters = (request: Request) => {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const done = searchParams.get("done");
  const sessionId = searchParams.get("session_id");

  if (status !== null && !taskStatusSchema.safeParse(status).success) {
    return buildValidationError("Invalid task status filter");
  }

  if (done !== null && done !== "true" && done !== "false") {
    return buildValidationError("Invalid task done filter");
  }

  if (sessionId !== null && sessionId.length === 0) {
    return buildValidationError("Invalid task session filter");
  }

  return null;
};

const parseCreateTaskRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = createTaskRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid task payload"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

const parsePatchTaskRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = patchTaskRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid task patch"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

export const registerTaskRoutes = (app: Hono) => {
  app.get(tasksPath, (context) => {
    const validationError = parseListFilters(context.req.raw);

    if (validationError) {
      return context.json(validationError, 400);
    }

    const payload = taskListResponseSchema.parse({
      items: [buildTask({ task_id: "task-123" })],
    });

    return context.json(payload, 200);
  });

  app.post(tasksPath, async (context) => {
    const input = await parseCreateTaskRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    const payload = buildTask({
      task_id: "task-123",
      task_spec: input.data.task_spec,
      session_id: input.data.session_id ?? null,
      worktree_path: input.data.worktree_path ?? null,
      pull_request_url: input.data.pull_request_url ?? null,
      dependencies: input.data.dependencies ?? [],
      status: input.data.status ?? "created",
    });

    return context.json(payload, 201);
  });

  app.get(taskByIdRoutePath, (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));

    if (isMissingStubTask(taskId)) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    return context.json(buildTask({ task_id: taskId }), 200);
  });

  app.patch(taskByIdRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));

    if (isMissingStubTask(taskId)) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    const patch = await parsePatchTaskRequest(context.req.raw);

    if (!patch.ok) {
      return context.json(patch.error, 400);
    }

    const stubTask = buildTask({ task_id: taskId });
    const payload = buildTask({
      ...stubTask,
      ...patch.data,
      task_id: taskId,
    });

    return context.json(payload, 200);
  });

  app.delete(taskByIdRoutePath, (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));

    if (isMissingStubTask(taskId)) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    return new Response(null, { status: 204 });
  });
};
