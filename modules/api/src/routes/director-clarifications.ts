import {
  createDirectorClarificationRequestSchema,
  patchDirectorClarificationRequestSchema,
  projectDirectorClarificationByIdPath,
  projectDirectorClarificationsPath,
  taskErrorSchema,
} from "@aim-ai/contract";
import type { Hono } from "hono";

import { createDirectorClarificationRepository } from "../director-clarification-repository.js";

const projectDirectorClarificationsRoutePath =
  projectDirectorClarificationsPath.replace("{projectId}", ":projectId");
const projectDirectorClarificationByIdRoutePath =
  projectDirectorClarificationByIdPath
    .replace("{projectId}", ":projectId")
    .replace("{clarificationId}", ":clarificationId");

const buildNotFoundError = (message: string) =>
  taskErrorSchema.parse({
    code: "DIRECTOR_CLARIFICATION_NOT_FOUND",
    message,
  });

const buildValidationError = (message: string) =>
  taskErrorSchema.parse({
    code: "DIRECTOR_CLARIFICATION_VALIDATION_ERROR",
    message,
  });

const requireProjectId = (projectId: string | undefined) =>
  projectId ?? "project-unknown";

const requireClarificationId = (clarificationId: string | undefined) =>
  clarificationId ?? "clarification-unknown";

const parseCreateDirectorClarificationRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = createDirectorClarificationRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid Director clarification payload"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

const parsePatchDirectorClarificationRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = patchDirectorClarificationRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError(
        "Invalid Director clarification status patch",
      ),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

type RegisterDirectorClarificationRoutesOptions = {
  projectRoot?: string;
  resourceScope?: Pick<AsyncDisposableStack, "use">;
};

export const registerDirectorClarificationRoutes = (
  app: Hono,
  options: RegisterDirectorClarificationRoutesOptions = {},
) => {
  const projectRoot = options.projectRoot ?? process.env.AIM_PROJECT_ROOT;
  let repository: null | ReturnType<
    typeof createDirectorClarificationRepository
  > = null;
  const getRepository = () => {
    repository ??=
      options.resourceScope?.use(
        createDirectorClarificationRepository({ projectRoot }),
      ) ?? createDirectorClarificationRepository({ projectRoot });

    return repository;
  };

  app.get(projectDirectorClarificationsRoutePath, async (context) => {
    const projectId = requireProjectId(context.req.param("projectId"));
    const dimensionId = context.req.query("dimension_id");

    if (!(await getRepository().hasProject(projectId))) {
      return context.json(
        buildNotFoundError(`Project ${projectId} was not found`),
        404,
      );
    }

    if (dimensionId) {
      const dimension = await getRepository().getDimensionIdentity(dimensionId);

      if (!dimension) {
        return context.json(
          buildNotFoundError(`Dimension ${dimensionId} was not found`),
          404,
        );
      }

      if (dimension.project_id !== projectId) {
        return context.json(
          buildValidationError("dimension_id must belong to the project"),
          400,
        );
      }
    }

    const directorClarifications =
      await getRepository().listDirectorClarifications(projectId, dimensionId);

    return context.json({ items: directorClarifications }, 200);
  });

  app.post(projectDirectorClarificationsRoutePath, async (context) => {
    const projectId = requireProjectId(context.req.param("projectId"));
    const parsedRequest = await parseCreateDirectorClarificationRequest(
      context.req.raw,
    );

    if (!parsedRequest.ok) {
      return context.json(parsedRequest.error, 400);
    }

    if (parsedRequest.data.project_id !== projectId) {
      return context.json(
        buildValidationError(
          "project_id must match the project path parameter",
        ),
        400,
      );
    }

    if (!(await getRepository().hasProject(projectId))) {
      return context.json(
        buildNotFoundError(`Project ${projectId} was not found`),
        404,
      );
    }

    if (parsedRequest.data.dimension_id) {
      const dimension = await getRepository().getDimensionIdentity(
        parsedRequest.data.dimension_id,
      );

      if (!dimension) {
        return context.json(
          buildNotFoundError(
            `Dimension ${parsedRequest.data.dimension_id} was not found`,
          ),
          404,
        );
      }

      if (dimension.project_id !== projectId) {
        return context.json(
          buildValidationError("dimension_id must belong to the project"),
          400,
        );
      }
    }

    const directorClarification =
      await getRepository().createDirectorClarification(parsedRequest.data);

    return context.json(directorClarification, 201);
  });

  app.patch(projectDirectorClarificationByIdRoutePath, async (context) => {
    const projectId = requireProjectId(context.req.param("projectId"));
    const clarificationId = requireClarificationId(
      context.req.param("clarificationId"),
    );
    const parsedRequest = await parsePatchDirectorClarificationRequest(
      context.req.raw,
    );

    if (!parsedRequest.ok) {
      return context.json(parsedRequest.error, 400);
    }

    if (!(await getRepository().hasProject(projectId))) {
      return context.json(
        buildNotFoundError(`Project ${projectId} was not found`),
        404,
      );
    }

    const directorClarification =
      await getRepository().patchDirectorClarificationStatus(
        projectId,
        clarificationId,
        parsedRequest.data,
      );

    if (!directorClarification) {
      return context.json(
        buildNotFoundError(
          `Director clarification ${clarificationId} was not found`,
        ),
        404,
      );
    }

    return context.json(directorClarification, 200);
  });
};
