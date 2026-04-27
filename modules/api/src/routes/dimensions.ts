import {
  createDimensionEvaluationRequestSchema,
  createDimensionRequestSchema,
  dimensionByIdPath,
  dimensionEvaluationsPath,
  dimensionsPath,
  patchDimensionRequestSchema,
  taskErrorSchema,
} from "@aim-ai/contract";
import type { Hono } from "hono";

import { createDimensionRepository } from "../dimension-repository.js";

const dimensionByIdRoutePath = dimensionByIdPath.replace(
  "{dimensionId}",
  ":dimensionId",
);
const dimensionEvaluationsRoutePath = dimensionEvaluationsPath.replace(
  "{dimensionId}",
  ":dimensionId",
);

const buildNotFoundError = (dimensionId: string) =>
  taskErrorSchema.parse({
    code: "DIMENSION_NOT_FOUND",
    message: `Dimension ${dimensionId} was not found`,
  });

const buildValidationError = (message: string) =>
  taskErrorSchema.parse({
    code: "DIMENSION_VALIDATION_ERROR",
    message,
  });

const requireDimensionId = (dimensionId: string | undefined) =>
  dimensionId ?? "dimension-unknown";

const parseProjectId = (request: Request) => {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("project_id");

  if (!projectId) {
    return buildValidationError("project_id query parameter is required");
  }

  return projectId;
};

const parseCreateDimensionRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = createDimensionRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid dimension payload"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

const parsePatchDimensionRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = patchDimensionRequestSchema.safeParse(payload);

  if (!result.success || Object.keys(result.data).length === 0) {
    return {
      error: buildValidationError("Invalid dimension patch"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

const parseCreateDimensionEvaluationRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = createDimensionEvaluationRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid dimension evaluation payload"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

type RegisterDimensionRoutesOptions = {
  projectRoot?: string;
  resourceScope?: {
    use<T extends Partial<AsyncDisposable & Disposable>>(resource: T): T;
  };
};

export const registerDimensionRoutes = (
  app: Hono,
  options: RegisterDimensionRoutesOptions = {},
) => {
  const projectRoot = options.projectRoot ?? process.env.AIM_PROJECT_ROOT;
  let repository: null | ReturnType<typeof createDimensionRepository> = null;
  const getRepository = () => {
    repository ??=
      options.resourceScope?.use(createDimensionRepository({ projectRoot })) ??
      createDimensionRepository({ projectRoot });

    return repository;
  };

  app.post(dimensionsPath, async (context) => {
    const parsedRequest = await parseCreateDimensionRequest(context.req.raw);

    if (!parsedRequest.ok) {
      return context.json(parsedRequest.error, 400);
    }

    const dimension = await getRepository().createDimension(parsedRequest.data);

    return context.json(dimension, 201);
  });

  app.get(dimensionsPath, async (context) => {
    const projectId = parseProjectId(context.req.raw);

    if (typeof projectId !== "string") {
      return context.json(projectId, 400);
    }

    const dimensions = await getRepository().listDimensions(projectId);

    return context.json({ items: dimensions }, 200);
  });

  app.get(dimensionByIdRoutePath, async (context) => {
    const dimensionId = requireDimensionId(context.req.param("dimensionId"));
    const dimension = await getRepository().getDimension(dimensionId);

    if (!dimension) {
      return context.json(buildNotFoundError(dimensionId), 404);
    }

    return context.json(dimension, 200);
  });

  app.patch(dimensionByIdRoutePath, async (context) => {
    const dimensionId = requireDimensionId(context.req.param("dimensionId"));
    const parsedRequest = await parsePatchDimensionRequest(context.req.raw);

    if (!parsedRequest.ok) {
      return context.json(parsedRequest.error, 400);
    }

    const dimension = await getRepository().patchDimension(
      dimensionId,
      parsedRequest.data,
    );

    if (!dimension) {
      return context.json(buildNotFoundError(dimensionId), 404);
    }

    return context.json(dimension, 200);
  });

  app.delete(dimensionByIdRoutePath, async (context) => {
    const dimensionId = requireDimensionId(context.req.param("dimensionId"));
    const deleted = await getRepository().deleteDimension(dimensionId);

    if (!deleted) {
      return context.json(buildNotFoundError(dimensionId), 404);
    }

    return context.body(null, 204);
  });

  app.get(dimensionEvaluationsRoutePath, async (context) => {
    const dimensionId = requireDimensionId(context.req.param("dimensionId"));
    const dimension = await getRepository().getDimension(dimensionId);

    if (!dimension) {
      return context.json(buildNotFoundError(dimensionId), 404);
    }

    const dimensionEvaluations =
      await getRepository().listDimensionEvaluations(dimensionId);

    return context.json({ items: dimensionEvaluations }, 200);
  });

  app.post(dimensionEvaluationsRoutePath, async (context) => {
    const dimensionId = requireDimensionId(context.req.param("dimensionId"));
    const parsedRequest = await parseCreateDimensionEvaluationRequest(
      context.req.raw,
    );

    if (!parsedRequest.ok) {
      return context.json(parsedRequest.error, 400);
    }

    const dimension = await getRepository().getDimension(dimensionId);

    if (!dimension) {
      return context.json(buildNotFoundError(dimensionId), 404);
    }

    if (dimension.project_id !== parsedRequest.data.project_id) {
      return context.json(
        buildValidationError(
          "dimension evaluation project_id must match dimension",
        ),
        400,
      );
    }

    const dimensionEvaluation = await getRepository().createDimensionEvaluation(
      dimensionId,
      parsedRequest.data,
    );

    if (!dimensionEvaluation) {
      return context.json(buildNotFoundError(dimensionId), 404);
    }

    return context.json(dimensionEvaluation, 201);
  });
};
