import {
  coordinatorProposalDryRunPath,
  coordinatorProposalDryRunResponseSchema,
  createCoordinatorProposalDryRunRequestSchema,
  taskErrorSchema,
} from "@aim-ai/contract";
import type { Hono } from "hono";

import { buildCoordinatorProposalDryRun } from "../coordinator-proposal-dry-run.js";
import { createTaskRepository } from "../task-repository.js";

type RegisterCoordinatorProposalRoutesOptions = {
  resourceScope?: Pick<AsyncDisposableStack, "use">;
};

const buildValidationError = (message: string) =>
  taskErrorSchema.parse({
    code: "TASK_VALIDATION_ERROR",
    message,
  });

const parseDryRunRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result =
    createCoordinatorProposalDryRunRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError(
        "Invalid coordinator proposal dry-run payload: require project_id, currentBaselineCommit, evaluations, and taskPool with source_dimension/source_evaluation/source_gap entries.",
      ),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

export const registerCoordinatorProposalRoutes = (
  app: Hono,
  options: RegisterCoordinatorProposalRoutesOptions = {},
) => {
  const projectRoot = process.env.AIM_PROJECT_ROOT;
  let repository: null | ReturnType<typeof createTaskRepository> = null;
  const getRepository = () => {
    repository ??=
      options.resourceScope?.use(createTaskRepository({ projectRoot })) ??
      createTaskRepository({ projectRoot });

    return repository;
  };

  app.post(coordinatorProposalDryRunPath, async (context) => {
    const input = await parseDryRunRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    const project = await getRepository().getProjectById(input.data.project_id);

    if (!project) {
      return context.json(
        buildValidationError(`Project ${input.data.project_id} was not found`),
        400,
      );
    }

    const dryRun = buildCoordinatorProposalDryRun({
      currentBaselineCommit: input.data.currentBaselineCommit,
      evaluations: input.data.evaluations,
      rejectedTasks: input.data.rejectedTasks,
      staleTaskFeedback: input.data.staleTaskFeedback,
      taskPool: input.data.taskPool,
    });

    return context.json(
      coordinatorProposalDryRunResponseSchema.parse(dryRun),
      200,
    );
  });
};
