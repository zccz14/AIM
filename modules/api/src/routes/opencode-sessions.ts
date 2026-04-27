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

const requireSessionId = (sessionId: string | undefined) =>
  sessionId ?? "session-unknown";

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
  const getRepository = () => {
    repository ??=
      options.resourceScope?.use(
        createOpenCodeSessionRepository({ projectRoot }),
      ) ?? createOpenCodeSessionRepository({ projectRoot });

    return repository;
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

    const session = getRepository().settleSession(
      sessionId,
      "resolved",
      input.data,
    );

    if (!session) {
      return context.json(buildNotFoundError(sessionId), 404);
    }

    return new Response(null, { status: 204 });
  });

  app.post(openCodeSessionRejectRoutePath, async (context) => {
    const sessionId = requireSessionId(context.req.param("sessionId"));
    const input = await parseSettleRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    const session = getRepository().settleSession(
      sessionId,
      "rejected",
      input.data,
    );

    if (!session) {
      return context.json(buildNotFoundError(sessionId), 404);
    }

    return new Response(null, { status: 204 });
  });
};
