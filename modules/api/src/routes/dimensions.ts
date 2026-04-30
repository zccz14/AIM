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

const isDimensionEvaluationUniqueConstraintError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    /unique constraint failed/i.test(error.message) &&
    error.message.includes("dimension_evaluations") &&
    error.message.includes("project_id") &&
    error.message.includes("commit_sha") &&
    error.message.includes("dimension_id")
  );
};

const buildDuplicateEvaluationError = ({
  commitSha,
  dimensionId,
  projectId,
}: {
  commitSha: string;
  dimensionId: string;
  projectId: string;
}) =>
  buildValidationError(
    `Dimension evaluation already exists for dimension_id ${dimensionId}, project_id ${projectId}, and commit_sha ${commitSha}. Read the existing dimension evaluations for this dimension or wait for the next baseline before writing another evaluation.`,
  );

const requireDimensionId = (dimensionId: string | undefined) =>
  dimensionId ?? "dimension-unknown";

const requiredEvaluationSections = [
  {
    label: "baseline_ref",
    pattern: /^\s*(?:#{1,6}\s*)?baseline[_ -]ref\s*:/im,
  },
  {
    label: "readme_claim_to_evidence_protocol",
    pattern:
      /^\s*(?:#{1,6}\s*)?readme[_ -]claim[_ -]to[_ -]evidence[_ -]protocol\s*:/im,
  },
  {
    label: "dimension_evaluation",
    pattern: /^\s*(?:#{1,6}\s*)?dimension[_ -]evaluation\s*:/im,
  },
  {
    label: "gap_analysis",
    pattern: /^\s*(?:#{1,6}\s*)?gap[_ -]analysis\s*:/im,
  },
  {
    label: "coordinator_handoff",
    pattern: /^\s*(?:#{1,6}\s*)?coordinator[_ -]handoff\s*:/im,
  },
  {
    label: "confidence/limits",
    pattern: /^\s*(?:#{1,6}\s*)?confidence(?:\s*\/\s*|[_ -])limits\s*:/im,
  },
] as const;

const findMissingEvaluationSections = (evaluation: string) =>
  requiredEvaluationSections
    .filter(({ pattern }) => !pattern.test(evaluation))
    .map(({ label }) => label);

const validateDimensionEvaluationStructure = (evaluation: string) => {
  const missingSections = findMissingEvaluationSections(evaluation);

  if (missingSections.length === 0) {
    return null;
  }

  return buildValidationError(
    `Invalid dimension evaluation structure: missing ${missingSections.join(
      ", ",
    )}. Include baseline_ref, readme_claim_to_evidence_protocol, dimension_evaluation, gap_analysis, coordinator_handoff, and confidence/limits sections before creating the evaluation.`,
  );
};

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

  const structureError = validateDimensionEvaluationStructure(
    result.data.evaluation,
  );

  if (structureError) {
    return {
      error: structureError,
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

type RegisterDimensionRoutesOptions = {
  projectRoot?: string;
  resourceScope?: Pick<AsyncDisposableStack, "use">;
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

    try {
      const dimensionEvaluation =
        await getRepository().createDimensionEvaluation(
          dimensionId,
          parsedRequest.data,
        );

      if (!dimensionEvaluation) {
        return context.json(buildNotFoundError(dimensionId), 404);
      }

      return context.json(dimensionEvaluation, 201);
    } catch (error) {
      if (isDimensionEvaluationUniqueConstraintError(error)) {
        return context.json(
          buildDuplicateEvaluationError({
            commitSha: parsedRequest.data.commit_sha,
            dimensionId,
            projectId: parsedRequest.data.project_id,
          }),
          400,
        );
      }

      throw error;
    }
  });
};
