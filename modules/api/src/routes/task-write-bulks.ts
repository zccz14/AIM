import {
  createTaskWriteBulkRequestSchema,
  taskErrorSchema,
  taskWriteBulkByIdPath,
  taskWriteBulksPath,
} from "@aim-ai/contract";
import type { Hono } from "hono";

import { createTaskWriteBulkRepository } from "../task-write-bulk-repository.js";

const taskWriteBulkByIdRoutePath = taskWriteBulkByIdPath.replace(
  "{bulkId}",
  ":bulkId",
);

const buildNotFoundError = (projectPath: string, bulkId: string) =>
  taskErrorSchema.parse({
    code: "TASK_WRITE_BULK_NOT_FOUND",
    message: `Task write bulk ${bulkId} for ${projectPath} was not found`,
  });

const buildConflictError = (projectPath: string, bulkId: string) =>
  taskErrorSchema.parse({
    code: "TASK_WRITE_BULK_CONFLICT",
    message: `Task write bulk ${bulkId} for ${projectPath} already exists`,
  });

const buildValidationError = (message: string) =>
  taskErrorSchema.parse({
    code: "TASK_WRITE_BULK_VALIDATION_ERROR",
    message,
  });

const parseProjectPath = (request: Request) => {
  const { searchParams } = new URL(request.url);
  const projectPath = searchParams.get("project_path");

  if (!projectPath) {
    return buildValidationError("project_path query parameter is required");
  }

  return projectPath;
};

const parseCreateTaskWriteBulkRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = createTaskWriteBulkRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid task write bulk payload"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

type RegisterTaskWriteBulkRoutesOptions = {
  projectRoot?: string;
};

export const registerTaskWriteBulkRoutes = (
  app: Hono,
  options: RegisterTaskWriteBulkRoutesOptions = {},
) => {
  const projectRoot = options.projectRoot ?? process.env.AIM_PROJECT_ROOT;
  let repository: null | ReturnType<typeof createTaskWriteBulkRepository> =
    null;
  const getRepository = () => {
    repository ??= createTaskWriteBulkRepository({ projectRoot });

    return repository;
  };

  app.post(taskWriteBulksPath, async (context) => {
    const parsedRequest = await parseCreateTaskWriteBulkRequest(
      context.req.raw,
    );

    if (!parsedRequest.ok) {
      return context.json(parsedRequest.error, 400);
    }

    const taskWriteBulk = await getRepository().createTaskWriteBulk(
      parsedRequest.data,
    );

    if (!taskWriteBulk) {
      return context.json(
        buildConflictError(
          parsedRequest.data.project_path,
          parsedRequest.data.bulk_id,
        ),
        409,
      );
    }

    return context.json(taskWriteBulk, 201);
  });

  app.get(taskWriteBulksPath, async (context) => {
    const projectPath = parseProjectPath(context.req.raw);

    if (typeof projectPath !== "string") {
      return context.json(projectPath, 400);
    }

    const taskWriteBulks =
      await getRepository().listTaskWriteBulks(projectPath);

    return context.json({ items: taskWriteBulks }, 200);
  });

  app.get(taskWriteBulkByIdRoutePath, async (context) => {
    const bulkId = context.req.param("bulkId") ?? "bulk-unknown";
    const projectPath = parseProjectPath(context.req.raw);

    if (typeof projectPath !== "string") {
      return context.json(projectPath, 400);
    }

    const taskWriteBulk = await getRepository().getTaskWriteBulk(
      projectPath,
      bulkId,
    );

    if (!taskWriteBulk) {
      return context.json(buildNotFoundError(projectPath, bulkId), 404);
    }

    return context.json(taskWriteBulk, 200);
  });
};
