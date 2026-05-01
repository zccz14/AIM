import {
  createOpenCodeSessionRequestSchema,
  openCodeSessionByIdPath,
  openCodeSessionRejectPath,
  openCodeSessionResolvePath,
  openCodeSessionSettleRequestSchema,
  openCodeSessionStateSchema,
  openCodeSessionsPath,
  openCodeSessionTokenUsageRefreshPath,
  patchOpenCodeSessionRequestSchema,
  taskErrorSchema,
} from "@aim-ai/contract";
import type { Hono } from "hono";

import { execGh } from "../exec-file.js";
import { createOpenCodeSessionRepository } from "../opencode-session-repository.js";
import { statTokensBySessionId } from "../stat-tokens.js";
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
const openCodeSessionTokenUsageRefreshRoutePath =
  openCodeSessionTokenUsageRefreshPath.replace("{sessionId}", ":sessionId");

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

const buildConflictError = (message: string) =>
  taskErrorSchema.parse({
    code: "TASK_CONFLICT",
    message,
  });

const redactSensitiveErrorDetail = (message: string) =>
  message
    .replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "[REDACTED]")
    .replace(/\s+and stack\s+at\s+[^\s.]+(?:\.\w+)?:\d+/gi, "");

const requireSessionId = (sessionId: string | undefined) =>
  sessionId ?? "session-unknown";

const getTaskResult = (value: string | undefined, payloadName = "result") => {
  if (!value?.trim()) {
    return {
      error: buildValidationError(
        `Task settlement requires a ${payloadName} payload`,
      ),
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

const parsePatchRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = patchOpenCodeSessionRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid OpenCode session patch payload"),
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
  execGh(["pr", "view", pullRequestUrl, "--json", "state,mergedAt"], {
    target: pullRequestUrl,
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
  const updateSessionTokenUsage = async (sessionId: string) => {
    try {
      const stats = await statTokensBySessionId(
        process.env.OPENCODE_BASE_URL ?? "http://localhost:4096",
        sessionId,
      );

      return getRepository().updateSessionTokenUsage(sessionId, {
        cached_tokens: stats.totals.cache.read,
        cache_write_tokens: stats.totals.cache.write,
        input_tokens: stats.totals.input,
        output_tokens: stats.totals.output,
        reasoning_tokens: stats.totals.reasoning,
      });
    } catch (error) {
      console.warn("OpenCode session token usage collection failed", {
        error: error instanceof Error ? error.message : String(error),
        session_id: sessionId,
      });

      return getRepository().getSessionById(sessionId);
    }
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

      await getTaskRepository().updateTask(task.task_id, {
        result: result.result,
      });

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

    await getTaskRepository().updateTask(task.task_id, {
      result: result.result,
    });

    return null;
  };

  app.post(openCodeSessionsPath, async (context) => {
    const input = await parseCreateRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    try {
      const session = await getRepository().createSession(input.data);

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

  app.get(openCodeSessionsPath, (context) => {
    const rawState = context.req.query("state");
    const stateResult = rawState
      ? openCodeSessionStateSchema.safeParse(rawState)
      : null;

    if (stateResult && !stateResult.success) {
      return context.json(
        buildValidationError("Invalid OpenCode session state filter"),
        400,
      );
    }

    return context.json(
      {
        items: getRepository().listSessions({
          state: stateResult?.data,
        }),
      },
      200,
    );
  });

  app.get(openCodeSessionByIdRoutePath, (context) => {
    const sessionId = requireSessionId(context.req.param("sessionId"));
    const session = getRepository().getSessionById(sessionId);

    if (!session) {
      return context.json(buildNotFoundError(sessionId), 404);
    }

    return context.json(session, 200);
  });

  app.post(openCodeSessionTokenUsageRefreshRoutePath, async (context) => {
    const sessionId = requireSessionId(context.req.param("sessionId"));
    const session = getRepository().getSessionById(sessionId);

    if (!session) {
      return context.json(buildNotFoundError(sessionId), 404);
    }

    return context.json(
      (await updateSessionTokenUsage(sessionId)) ?? session,
      200,
    );
  });

  app.patch(openCodeSessionByIdRoutePath, async (context) => {
    const sessionId = requireSessionId(context.req.param("sessionId"));
    const input = await parsePatchRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    const session = getRepository().getSessionById(sessionId);

    if (!session) {
      return context.json(buildNotFoundError(sessionId), 404);
    }

    if (session.state !== "pending") {
      return context.json(
        buildConflictError(
          "OpenCode session continue_prompt can only be updated while pending",
        ),
        409,
      );
    }

    return context.json(
      getRepository().updateContinuePrompt(sessionId, input.data),
      200,
    );
  });

  app.post(openCodeSessionResolveRoutePath, async (context) => {
    const sessionId = requireSessionId(context.req.param("sessionId"));
    const input = await parseSettleRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    const settlementResult = getTaskResult(input.data.value);
    if (!settlementResult.ok) {
      return context.json(settlementResult.error, 400);
    }

    const session = getRepository().getSessionById(sessionId);

    if (!session) {
      return context.json(buildNotFoundError(sessionId), 404);
    }

    if (session.state !== "pending") {
      await updateSessionTokenUsage(sessionId);

      return new Response(null, { status: 204 });
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
    await updateSessionTokenUsage(sessionId);

    return new Response(null, { status: 204 });
  });

  app.post(openCodeSessionRejectRoutePath, async (context) => {
    const sessionId = requireSessionId(context.req.param("sessionId"));
    const input = await parseSettleRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    const settlementResult = getTaskResult(input.data.reason, "reason");
    if (!settlementResult.ok) {
      return context.json(settlementResult.error, 400);
    }

    const session = getRepository().getSessionById(sessionId);

    if (!session) {
      return context.json(buildNotFoundError(sessionId), 404);
    }

    if (session.state !== "pending") {
      await updateSessionTokenUsage(sessionId);

      return new Response(null, { status: 204 });
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
    await updateSessionTokenUsage(sessionId);

    return new Response(null, { status: 204 });
  });
};
