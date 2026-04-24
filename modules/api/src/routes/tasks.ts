import { execFile } from "node:child_process";

import {
  createTaskRequestSchema,
  patchTaskRequestSchema,
  type TaskStatus,
  taskByIdPath,
  taskDependenciesPath,
  taskDependenciesRequestSchema,
  taskErrorSchema,
  taskPullRequestUrlPath,
  taskPullRequestUrlRequestSchema,
  taskRejectPath,
  taskResolvePath,
  taskResultRequestSchema,
  taskSpecPath,
  taskStatusSchema,
  tasksPath,
  taskWorktreePathPath,
  taskWorktreePathRequestSchema,
} from "@aim-ai/contract";
import type { Hono } from "hono";

import type { ApiLogger } from "../api-logger.js";
import {
  createOpenCodeSdkAdapter,
  type OpenCodeSdkAdapter,
} from "../opencode-sdk-adapter.js";
import { buildTaskLogFields } from "../task-log-fields.js";
import { createTaskRepository } from "../task-repository.js";

const taskByIdRoutePath = taskByIdPath.replace("{taskId}", ":taskId");
const taskWorktreePathRoutePath = taskWorktreePathPath.replace(
  "{taskId}",
  ":taskId",
);
const taskPullRequestUrlRoutePath = taskPullRequestUrlPath.replace(
  "{taskId}",
  ":taskId",
);
const taskDependenciesRoutePath = taskDependenciesPath.replace(
  "{taskId}",
  ":taskId",
);
const taskSpecRoutePath = taskSpecPath.replace("{taskId}", ":taskId");
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

const buildOpenCodeModelsUnavailableError = () =>
  taskErrorSchema.parse({
    code: "OPENCODE_MODELS_UNAVAILABLE",
    message:
      "Cannot validate developer_provider_id and developer_model_id because OpenCode models are unavailable",
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

const getPullRequestMergedOutput = (pullRequestUrl: string) =>
  new Promise<string>((resolve, reject) => {
    execFile(
      "gh",
      ["pr", "view", pullRequestUrl, "--json", "merged", "--jq", ".merged"],
      { encoding: "utf8" },
      (error, stdout) => {
        if (error) {
          reject(error);

          return;
        }

        resolve(stdout);
      },
    );
  });

const verifyPullRequestMerged = async (pullRequestUrl: string) => {
  let stdout: string;
  try {
    stdout = await getPullRequestMergedOutput(pullRequestUrl);
  } catch {
    return buildValidationError(
      "Could not confirm pull_request_url is merged with gh. Make sure GitHub CLI is installed, authenticated, and the PR exists.",
    );
  }

  if (stdout.trim() !== "true") {
    return buildValidationError(
      "Task cannot be resolved until pull_request_url points to a merged pull request.",
    );
  }

  return null;
};

const parseTaskWorktreePathRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = taskWorktreePathRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid task worktree_path payload"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

const parseTaskPullRequestUrlRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = taskPullRequestUrlRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid task pull_request_url payload"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

const parseTaskDependenciesRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = taskDependenciesRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid task dependencies payload"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

type RegisterTaskRoutesOptions = {
  logger?: ApiLogger;
  onTaskResolved?: () => Promise<void> | void;
  openCodeModelsAdapter?: Pick<OpenCodeSdkAdapter, "listSupportedModels">;
};

export const registerTaskRoutes = (
  app: Hono,
  options: RegisterTaskRoutesOptions = {},
) => {
  const logger = options.logger;
  const onTaskResolved = options.onTaskResolved;
  const projectRoot = process.env.AIM_PROJECT_ROOT;
  let openCodeModelsAdapter = options.openCodeModelsAdapter;
  let repository: null | ReturnType<typeof createTaskRepository> = null;
  const getRepository = () => {
    repository ??= createTaskRepository({ projectRoot });

    return repository;
  };
  const getOpenCodeModelsAdapter = () => {
    openCodeModelsAdapter ??= createOpenCodeSdkAdapter({
      baseUrl: process.env.OPENCODE_BASE_URL ?? "http://localhost:4096",
    });

    return openCodeModelsAdapter;
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

    let models: Awaited<ReturnType<OpenCodeSdkAdapter["listSupportedModels"]>>;

    try {
      models = await getOpenCodeModelsAdapter().listSupportedModels();
    } catch {
      return context.json(buildOpenCodeModelsUnavailableError(), 503);
    }

    const matchingModel = models.items.find(
      (model) =>
        model.provider_id === input.data.developer_provider_id &&
        model.model_id === input.data.developer_model_id,
    );

    if (!matchingModel) {
      return context.json(
        buildValidationError(
          `Requested developer_provider_id "${input.data.developer_provider_id}" with developer_model_id "${input.data.developer_model_id}" is not available. Use GET /opencode/models to choose a supported provider/model combination.`,
        ),
        400,
      );
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

  app.get(taskSpecRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));

    const task = await getRepository().getTaskById(taskId);

    if (!task) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    return new Response(task.task_spec, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
      },
      status: 200,
    });
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

  app.put(taskWorktreePathRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));
    const input = await parseTaskWorktreePathRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    const payload = await getRepository().updateTask(taskId, input.data);

    if (!payload) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    return context.json(payload, 200);
  });

  app.put(taskPullRequestUrlRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));
    const input = await parseTaskPullRequestUrlRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    const payload = await getRepository().updateTask(taskId, input.data);

    if (!payload) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    return context.json(payload, 200);
  });

  app.put(taskDependenciesRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));
    const input = await parseTaskDependenciesRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    const payload = await getRepository().updateTask(taskId, input.data);

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

    const task = await getRepository().getTaskById(taskId);

    if (!task) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    if (!task.pull_request_url) {
      return context.json(
        buildValidationError(
          "Task cannot be resolved until pull_request_url is recorded.",
        ),
        400,
      );
    }

    const pullRequestError = await verifyPullRequestMerged(
      task.pull_request_url,
    );

    if (pullRequestError) {
      return context.json(pullRequestError, 400);
    }

    const payload = await getRepository().resolveTask(
      taskId,
      input.data.result,
    );

    if (!payload) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    logger?.info(buildTaskLogFields("task_resolved", payload));

    if (onTaskResolved) {
      Promise.resolve()
        .then(onTaskResolved)
        .catch((error: unknown) => {
          logger?.error(
            { err: error, taskId },
            "Task scheduler scan trigger failed after task resolve",
          );
        });
    }

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
