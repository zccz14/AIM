import {
  createTaskRequestSchema,
  patchTaskRequestSchema,
  type TaskStatus,
  taskByIdPath,
  taskErrorSchema,
  taskRejectPath,
  taskResolvePath,
  taskResultRequestSchema,
  taskStatusSchema,
  tasksPath,
} from "@aim-ai/contract";
import type { Hono } from "hono";

import type { ApiLogger } from "../logger.js";
import { buildTaskLogFields } from "../logger.js";
import { createTaskRepository } from "../task-repository.js";

const taskByIdRoutePath = taskByIdPath.replace("{taskId}", ":taskId");
const taskResolveRoutePath = taskResolvePath.replace("{taskId}", ":taskId");
const taskRejectRoutePath = taskRejectPath.replace("{taskId}", ":taskId");

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

  return {
    done: done === null ? undefined : done === "true",
    session_id: sessionId ?? undefined,
    status: status === null ? undefined : (status as TaskStatus),
  };
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

  if (
    payload !== null &&
    typeof payload === "object" &&
    Object.hasOwn(payload, "project_path")
  ) {
    return {
      error: buildValidationError("Invalid task patch"),
      ok: false as const,
    };
  }

  const result = patchTaskRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid task patch"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

const parseTaskResultRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = taskResultRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid task result"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

type RegisterTaskRoutesOptions = {
  logger?: ApiLogger;
};

export const registerTaskRoutes = (
  app: Hono,
  options: RegisterTaskRoutesOptions = {},
) => {
  const logger = options.logger;
  const projectRoot = process.env.AIM_PROJECT_ROOT;
  let repository: null | ReturnType<typeof createTaskRepository> = null;
  const getRepository = () => {
    repository ??= createTaskRepository({ projectRoot });

    return repository;
  };

  app.get(tasksPath, async (context) => {
    const filters = parseListFilters(context.req.raw);

    if ("code" in filters) {
      return context.json(filters, 400);
    }

    const items = await getRepository().listTasks(filters);

    return context.json({ items }, 200);
  });

  app.post(tasksPath, async (context) => {
    const input = await parseCreateTaskRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    const payload = await getRepository().createTask(input.data);

    logger?.info(buildTaskLogFields("task_created", payload));

    return context.json(payload, 201);
  });

  app.get(taskByIdRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));

    const task = await getRepository().getTaskById(taskId);

    if (!task) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    return context.json(task, 200);
  });

  app.patch(taskByIdRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));

    const patch = await parsePatchTaskRequest(context.req.raw);

    if (!patch.ok) {
      return context.json(patch.error, 400);
    }

    const payload = await getRepository().updateTask(taskId, patch.data);

    if (!payload) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    return context.json(payload, 200);
  });

  app.post(taskResolveRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));
    const input = await parseTaskResultRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    const payload = await getRepository().resolveTask(
      taskId,
      input.data.result,
    );

    if (!payload) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    logger?.info(buildTaskLogFields("task_resolved", payload));

    return new Response(null, { status: 204 });
  });

  app.post(taskRejectRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));
    const input = await parseTaskResultRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    const payload = await getRepository().rejectTask(taskId, input.data.result);

    if (!payload) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    logger?.info(buildTaskLogFields("task_rejected", payload));

    return new Response(null, { status: 204 });
  });

  app.delete(taskByIdRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));

    const deleted = await getRepository().deleteTask(taskId);

    if (!deleted) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    return new Response(null, { status: 204 });
  });
};
