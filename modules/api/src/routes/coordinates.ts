import {
  coordinateByIdPath,
  coordinateEvaluationsPath,
  coordinatesPath,
  createCoordinateEvaluationRequestSchema,
  createCoordinateRequestSchema,
  patchCoordinateRequestSchema,
  taskErrorSchema,
} from "@aim-ai/contract";
import type { Hono } from "hono";

import { createCoordinateRepository } from "../coordinate-repository.js";

const coordinateByIdRoutePath = coordinateByIdPath.replace(
  "{coordinateId}",
  ":coordinateId",
);
const coordinateEvaluationsRoutePath = coordinateEvaluationsPath.replace(
  "{coordinateId}",
  ":coordinateId",
);

const buildNotFoundError = (coordinateId: string) =>
  taskErrorSchema.parse({
    code: "COORDINATE_NOT_FOUND",
    message: `Coordinate ${coordinateId} was not found`,
  });

const buildValidationError = (message: string) =>
  taskErrorSchema.parse({
    code: "COORDINATE_VALIDATION_ERROR",
    message,
  });

const requireCoordinateId = (coordinateId: string | undefined) =>
  coordinateId ?? "coordinate-unknown";

const parseProjectPath = (request: Request) => {
  const { searchParams } = new URL(request.url);
  const projectPath = searchParams.get("project_path");

  if (!projectPath) {
    return buildValidationError("project_path query parameter is required");
  }

  return projectPath;
};

const parseCreateCoordinateRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = createCoordinateRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid coordinate payload"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

const parsePatchCoordinateRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = patchCoordinateRequestSchema.safeParse(payload);

  if (!result.success || Object.keys(result.data).length === 0) {
    return {
      error: buildValidationError("Invalid coordinate patch"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

const parseCreateCoordinateEvaluationRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = createCoordinateEvaluationRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid coordinate evaluation payload"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

type RegisterCoordinateRoutesOptions = {
  projectRoot?: string;
};

export const registerCoordinateRoutes = (
  app: Hono,
  options: RegisterCoordinateRoutesOptions = {},
) => {
  const projectRoot = options.projectRoot ?? process.env.AIM_PROJECT_ROOT;
  let repository: null | ReturnType<typeof createCoordinateRepository> = null;
  const getRepository = () => {
    repository ??= createCoordinateRepository({ projectRoot });

    return repository;
  };

  app.post(coordinatesPath, async (context) => {
    const parsedRequest = await parseCreateCoordinateRequest(context.req.raw);

    if (!parsedRequest.ok) {
      return context.json(parsedRequest.error, 400);
    }

    const coordinate = await getRepository().createCoordinate(
      parsedRequest.data,
    );

    return context.json(coordinate, 201);
  });

  app.get(coordinatesPath, async (context) => {
    const projectPath = parseProjectPath(context.req.raw);

    if (typeof projectPath !== "string") {
      return context.json(projectPath, 400);
    }

    const coordinates = await getRepository().listCoordinates(projectPath);

    return context.json({ items: coordinates }, 200);
  });

  app.get(coordinateByIdRoutePath, async (context) => {
    const coordinateId = requireCoordinateId(context.req.param("coordinateId"));
    const coordinate = await getRepository().getCoordinate(coordinateId);

    if (!coordinate) {
      return context.json(buildNotFoundError(coordinateId), 404);
    }

    return context.json(coordinate, 200);
  });

  app.patch(coordinateByIdRoutePath, async (context) => {
    const coordinateId = requireCoordinateId(context.req.param("coordinateId"));
    const parsedRequest = await parsePatchCoordinateRequest(context.req.raw);

    if (!parsedRequest.ok) {
      return context.json(parsedRequest.error, 400);
    }

    const coordinate = await getRepository().patchCoordinate(
      coordinateId,
      parsedRequest.data,
    );

    if (!coordinate) {
      return context.json(buildNotFoundError(coordinateId), 404);
    }

    return context.json(coordinate, 200);
  });

  app.delete(coordinateByIdRoutePath, async (context) => {
    const coordinateId = requireCoordinateId(context.req.param("coordinateId"));
    const deleted = await getRepository().deleteCoordinate(coordinateId);

    if (!deleted) {
      return context.json(buildNotFoundError(coordinateId), 404);
    }

    return context.body(null, 204);
  });

  app.get(coordinateEvaluationsRoutePath, async (context) => {
    const coordinateId = requireCoordinateId(context.req.param("coordinateId"));
    const coordinate = await getRepository().getCoordinate(coordinateId);

    if (!coordinate) {
      return context.json(buildNotFoundError(coordinateId), 404);
    }

    const coordinateEvaluations =
      await getRepository().listCoordinateEvaluations(coordinateId);

    return context.json({ items: coordinateEvaluations }, 200);
  });

  app.post(coordinateEvaluationsRoutePath, async (context) => {
    const coordinateId = requireCoordinateId(context.req.param("coordinateId"));
    const parsedRequest = await parseCreateCoordinateEvaluationRequest(
      context.req.raw,
    );

    if (!parsedRequest.ok) {
      return context.json(parsedRequest.error, 400);
    }

    const coordinate = await getRepository().getCoordinate(coordinateId);

    if (!coordinate) {
      return context.json(buildNotFoundError(coordinateId), 404);
    }

    if (coordinate.project_path !== parsedRequest.data.project_path) {
      return context.json(
        buildValidationError(
          "coordinate evaluation project_path must match coordinate",
        ),
        400,
      );
    }

    const coordinateEvaluation =
      await getRepository().createCoordinateEvaluation(
        coordinateId,
        parsedRequest.data,
      );

    if (!coordinateEvaluation) {
      return context.json(buildNotFoundError(coordinateId), 404);
    }

    return context.json(coordinateEvaluation, 201);
  });
};
