import { execFile } from "node:child_process";

import {
  createOpenCodeSessionRequestSchema,
  openCodeSessionByIdPath,
  openCodeSessionRejectPath,
  openCodeSessionResolvePath,
  openCodeSessionSettleRequestSchema,
  openCodeSessionsPath,
  taskErrorSchema,
} from "@aim-ai/contract";
import type { Hono } from "hono";

import { createOpenCodeSessionRepository } from "../opencode-session-repository.js";
import { createTaskRepository } from "../task-repository.js";

const openCodeSessionByIdRoutePath = openCodeSessionByIdPath.replace(
  "{sessionId}",
  ":sessionId",
);
const openCodeSessionResolveRoutePath = openCodeSessionResolvePath.replace(
  "{sessionId}",
  ":sessionId",
);
const openCodeSessionRejectRoutePath = openCodeSessionRejectPath.replace(
  "{sessionId}",
  ":sessionId",
);

const buildNotFoundError = (sessionId: string) =>
  taskErrorSchema.parse({
    code: "TASK_NOT_FOUND",
    message: `OpenCode session ${sessionId} was not found`,
  });

const buildValidationError = (message: string) =>
  taskErrorSchema.parse({
    code: "TASK_VALIDATION_ERROR",
    message,
  });

const redactSensitiveErrorDetail = (message: string) =>
  message
    .replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "[REDACTED]")
    .replace(/\s+and stack\s+at\s+[^\s.]+(?:\.\w+)?:\d+/gi, "");

const requireSessionId = (sessionId: string | undefined) =>
  sessionId ?? "session-unknown";

const getTaskResult = (value: string | undefined) => {
  if (!value?.trim()) {
    return {
      error: buildValidationError("Task settlement requires a result payload"),
      ok: false as const,
    };
  }

  return { ok: true as const, result: value };
};

const parseCreateRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = createOpenCodeSessionRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid OpenCode session payload"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

const parseSettleRequest = async (request: Request) => {
  const payload = await request.json().catch(() => ({}));
  const result = openCodeSessionSettleRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid OpenCode session settlement"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

const getPullRequestMergedOutput = (pullRequestUrl: string) =>
  new Promise<string>((resolve, reject) => {
    execFile(
      "gh",
      ["pr", "view", pullRequestUrl, "--json", "state,mergedAt"],
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
  } catch (error) {
    const detail =
      error instanceof Error
        ? ` gh error: ${redactSensitiveErrorDetail(error.message)}.`
        : "";

    return buildValidationError(
      `Could not confirm pull_request_url is merged with gh.${detail} Verify the PR exists, confirm GitHub CLI authentication and repository access, then retry resolve.`,
    );
  }

  let pullRequest: { mergedAt?: unknown; state?: unknown };
  try {
    pullRequest = JSON.parse(stdout) as { mergedAt?: unknown; state?: unknown };
  } catch {
    return buildValidationError(
      "Could not confirm pull_request_url is merged with gh. Make sure GitHub CLI is installed, authenticated, and the PR exists.",
    );
  }

  const mergedAt =
    typeof pullRequest.mergedAt === "string" ? pullRequest.mergedAt.trim() : "";

  if (pullRequest.state !== "MERGED" && mergedAt.length === 0) {
    return buildValidationError(
      "Task cannot be resolved until pull_request_url points to a merged pull request.",
    );
  }

  return null;
};

type RegisterOpenCodeSessionRoutesOptions = {
  resourceScope?: Pick<AsyncDisposableStack, "use">;
};

export const registerOpenCodeSessionRoutes = (
  app: Hono,
  options: RegisterOpenCodeSessionRoutesOptions = {},
) => {
  const projectRoot = process.env.AIM_PROJECT_ROOT;
  let repository: null | ReturnType<typeof createOpenCodeSessionRepository> =
    null;
  let taskRepository: null | ReturnType<typeof createTaskRepository> = null;
  const getRepository = () => {
    repository ??=
      options.resourceScope?.use(
        createOpenCodeSessionRepository({ projectRoot }),
      ) ?? createOpenCodeSessionRepository({ projectRoot });

    return repository;
  };
  const getTaskRepository = () => {
    taskRepository ??=
      options.resourceScope?.use(createTaskRepository({ projectRoot })) ??
      createTaskRepository({ projectRoot });

    return taskRepository;
  };

  const settleBoundTask = async (
    sessionId: string,
    state: "rejected" | "resolved",
    input: { reason?: string; value?: string },
  ) => {
    const [task] = await getTaskRepository().listTasks({
      session_id: sessionId,
    });

    if (!task) {
      return null;
    }

    if (state === "rejected") {
      const result = getTaskResult(input.reason);

      if (!result.ok) {
        return result.error;
      }

      await getTaskRepository().rejectTask(task.task_id, result.result);

      return null;
    }

    const result = getTaskResult(input.value);

    if (!result.ok) {
      return result.error;
    }

    if (!task.pull_request_url) {
      return buildValidationError(
        "Task cannot be resolved until pull_request_url is recorded.",
      );
    }

    const pullRequestError = await verifyPullRequestMerged(
      task.pull_request_url,
    );

    if (pullRequestError) {
      return pullRequestError;
    }

    await getTaskRepository().resolveTask(task.task_id, result.result);

    return null;
  };

  app.post(openCodeSessionsPath, async (context) => {
    const input = await parseCreateRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    try {
      const session = getRepository().createSession(input.data);

      return context.json(session, 201);
    } catch (error) {
      return context.json(
        buildValidationError(
          error instanceof Error
            ? error.message
            : "Invalid OpenCode session operation",
        ),
        400,
      );
    }
  });

  app.get(openCodeSessionByIdRoutePath, (context) => {
    const sessionId = requireSessionId(context.req.param("sessionId"));
    const session = getRepository().getSessionById(sessionId);

    if (!session) {
      return context.json(buildNotFoundError(sessionId), 404);
    }

    return context.json(session, 200);
  });

  app.post(openCodeSessionResolveRoutePath, async (context) => {
    const sessionId = requireSessionId(context.req.param("sessionId"));
    const input = await parseSettleRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    if (!getRepository().getSessionById(sessionId)) {
      return context.json(buildNotFoundError(sessionId), 404);
    }

    const taskSettleError = await settleBoundTask(
      sessionId,
      "resolved",
      input.data,
    );

    if (taskSettleError) {
      return context.json(taskSettleError, 400);
    }

    getRepository().settleSession(sessionId, "resolved", input.data);

    return new Response(null, { status: 204 });
  });

  app.post(openCodeSessionRejectRoutePath, async (context) => {
    const sessionId = requireSessionId(context.req.param("sessionId"));
    const input = await parseSettleRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    if (!getRepository().getSessionById(sessionId)) {
      return context.json(buildNotFoundError(sessionId), 404);
    }

    const taskSettleError = await settleBoundTask(
      sessionId,
      "rejected",
      input.data,
    );

    if (taskSettleError) {
      return context.json(taskSettleError, 400);
    }

    getRepository().settleSession(sessionId, "rejected", input.data);

    return new Response(null, { status: 204 });
  });
};
