import {
  createProjectRequestSchema,
  patchProjectRequestSchema,
  projectByIdPath,
  projectOptimizerStatusPath,
  projectOptimizerStatusResponseSchema,
  projectsPath,
  taskErrorSchema,
} from "@aim-ai/contract";
import type { Hono } from "hono";

import type { OptimizerSystem } from "../optimizer-system.js";
import { createTaskRepository } from "../task-repository.js";

const projectByIdRoutePath = projectByIdPath.replace(
  "{projectId}",
  ":projectId",
);
const projectOptimizerStatusRoutePath = projectOptimizerStatusPath.replace(
  "{projectId}",
  ":projectId",
);

const buildNotFoundError = (projectId: string) =>
  taskErrorSchema.parse({
    code: "PROJECT_NOT_FOUND",
    message: `Project ${projectId} was not found`,
  });

const buildValidationError = (message: string) =>
  taskErrorSchema.parse({
    code: "PROJECT_VALIDATION_ERROR",
    message,
  });

const parseCreateProjectRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = createProjectRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid project payload"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

const parsePatchProjectRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = patchProjectRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid project patch"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

const requireProjectId = (projectId: string | undefined) =>
  projectId ?? "project-unknown";

type RegisterProjectRoutesOptions = {
  optimizerSystem?: OptimizerSystem;
  resourceScope?: Pick<AsyncDisposableStack, "use">;
};

const getOptimizerBlockerSummary = ({
  optimizerEnabled,
  runtimeActive,
}: {
  optimizerEnabled: boolean;
  runtimeActive: boolean;
}) => {
  if (!optimizerEnabled) {
    return "Optimizer disabled for project";
  }

  if (!runtimeActive) {
    return "Optimizer runtime inactive";
  }

  return null;
};

export const registerProjectRoutes = (
  app: Hono,
  options: RegisterProjectRoutesOptions = {},
) => {
  const projectRoot = process.env.AIM_PROJECT_ROOT;
  let repository: null | ReturnType<typeof createTaskRepository> = null;
  const getRepository = () => {
    repository ??=
      options.resourceScope?.use(createTaskRepository({ projectRoot })) ??
      createTaskRepository({ projectRoot });

    return repository;
  };

  app.get(projectsPath, async (context) => {
    const items = await getRepository().listProjects();

    return context.json({ items }, 200);
  });

  app.post(projectsPath, async (context) => {
    const input = await parseCreateProjectRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    try {
      const project = await getRepository().createProject(input.data);

      return context.json(project, 201);
    } catch {
      return context.json(
        buildValidationError("Project could not be created"),
        400,
      );
    }
  });

  app.patch(projectByIdRoutePath, async (context) => {
    const projectId = requireProjectId(context.req.param("projectId"));
    const patch = await parsePatchProjectRequest(context.req.raw);

    if (!patch.ok) {
      return context.json(patch.error, 400);
    }

    const project = await getRepository().updateProject(projectId, patch.data);

    if (!project) {
      return context.json(buildNotFoundError(projectId), 404);
    }

    return context.json(project, 200);
  });

  app.get(projectOptimizerStatusRoutePath, async (context) => {
    const projectId = requireProjectId(context.req.param("projectId"));
    const project = await getRepository().getProjectById(projectId);

    if (!project) {
      return context.json(buildNotFoundError(projectId), 404);
    }

    const optimizerEnabled = Boolean(project.optimizer_enabled);
    const runtimeActive = optimizerEnabled && Boolean(options.optimizerSystem);
    const response = projectOptimizerStatusResponseSchema.parse({
      project_id: projectId,
      optimizer_enabled: optimizerEnabled,
      runtime_active: runtimeActive,
      blocker_summary: getOptimizerBlockerSummary({
        optimizerEnabled,
        runtimeActive,
      }),
    });

    return context.json(response, 200);
  });

  app.delete(projectByIdRoutePath, async (context) => {
    const projectId = requireProjectId(context.req.param("projectId"));
    const deleted = await getRepository().deleteProject(projectId);

    if (!deleted) {
      return context.json(buildNotFoundError(projectId), 404);
    }

    return new Response(null, { status: 204 });
  });
};
