import { execFile } from "node:child_process";
import { existsSync } from "node:fs";

import {
  createProjectRequestSchema,
  patchProjectRequestSchema,
  projectByIdPath,
  projectOptimizerStatusPath,
  projectOptimizerStatusResponseSchema,
  projectSchema,
  projectsPath,
  projectTokenUsagePath,
  projectTokenUsageResponseSchema,
  type Task,
  taskErrorSchema,
} from "@aim-ai/contract";
import type { Hono } from "hono";

import type { OptimizerSystem } from "../optimizer-system.js";
import {
  buildProjectTokenBudgetStatus,
  buildProjectTokenBudgetWarning,
  type ProjectBudgetThresholds,
} from "../project-budget-warning.js";
import { resolveProjectWorkspacePath } from "../project-workspace.js";
import { statTokensBySessionId, type TokenStats } from "../stat-tokens.js";
import { createTaskRepository } from "../task-repository.js";

const projectByIdRoutePath = projectByIdPath.replace(
  "{projectId}",
  ":projectId",
);
const projectOptimizerStatusRoutePath = projectOptimizerStatusPath.replace(
  "{projectId}",
  ":projectId",
);
const projectTokenUsageRoutePath = projectTokenUsagePath.replace(
  "{projectId}",
  ":projectId",
);
const projectTokenUsageSessionTimeoutMs = 10_000;
type RepositoryProject = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createTaskRepository>["getProjectById"]>>
>;

const createTimeoutSignal = (timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(
      new DOMException("OpenCode message collection timed out", "AbortError"),
    );
  }, timeoutMs);

  return {
    dispose: () => clearTimeout(timeout),
    signal: controller.signal,
  };
};

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

const toProjectResponse = (project: RepositoryProject) =>
  projectSchema.parse({
    ...project,
    optimizer_enabled: Boolean(project.optimizer_enabled),
  });

const zeroTokenUsageTotals = () => ({
  cache: { read: 0, write: 0 },
  cost: 0,
  input: 0,
  messages: 0,
  output: 0,
  reasoning: 0,
  total: 0,
});

const addTokenUsageTotals = (
  target: ReturnType<typeof zeroTokenUsageTotals>,
  source: ReturnType<typeof zeroTokenUsageTotals>,
) => {
  target.cache.read += source.cache.read;
  target.cache.write += source.cache.write;
  target.cost += source.cost;
  target.input += source.input;
  target.messages += source.messages;
  target.output += source.output;
  target.reasoning += source.reasoning;
  target.total += source.total;
};

const toTokenUsageTotals = (stats: TokenStats) => ({
  cache: {
    read: stats.totals.cache.read,
    write: stats.totals.cache.write,
  },
  cost: stats.totals.cost,
  input: stats.totals.input,
  messages: stats.totals.messages,
  output: stats.totals.output,
  reasoning: stats.totals.reasoning,
  total: stats.totals.total,
});

type ProjectTokenUsageAggregation = {
  failures: ReturnType<typeof buildOpenCodeMessagesFailure>[];
  sessionUsages: {
    failure: ReturnType<typeof buildOpenCodeMessagesFailure> | null;
    root_session_id: string;
    task_id: string;
    title: string;
    totals: ReturnType<typeof zeroTokenUsageTotals>;
  }[];
  taskUsages: {
    failures: ReturnType<typeof buildOpenCodeMessagesFailure>[];
    session_id: string;
    task_id: string;
    title: string;
    totals: ReturnType<typeof zeroTokenUsageTotals>;
  }[];
  totals: ReturnType<typeof zeroTokenUsageTotals>;
};

const redactSensitiveErrorDetail = (message: string) =>
  message.replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "[REDACTED]");

const buildOpenCodeMessagesFailure = ({
  error,
  rootSessionId,
  taskId,
}: {
  error: unknown;
  rootSessionId: string;
  taskId: string;
}) => {
  const detail =
    error instanceof Error
      ? ` Detail: ${redactSensitiveErrorDetail(error.message)}`
      : "";

  return {
    code: "OPENCODE_MESSAGES_UNAVAILABLE" as const,
    message: `Could not fetch OpenCode messages for root session ${rootSessionId}. Verify OpenCode is reachable and retry the project token usage request.${detail}`,
    root_session_id: rootSessionId,
    task_id: taskId,
  };
};

const taskHasRootSession = (
  task: Task,
): task is Task & { session_id: string } =>
  typeof task.session_id === "string" && task.session_id.trim().length > 0;

const summarizeTokenUsageAggregation = (
  aggregation: Pick<
    ProjectTokenUsageAggregation,
    "failures" | "sessionUsages" | "totals"
  >,
  thresholds: ProjectBudgetThresholds,
) => {
  const rootSessionCount = aggregation.sessionUsages.length;
  const failedRootSessionCount = aggregation.failures.length;
  const availability =
    rootSessionCount === 0
      ? "no_sessions"
      : failedRootSessionCount === 0
        ? "available"
        : failedRootSessionCount === rootSessionCount
          ? "unavailable"
          : "partial";

  return {
    availability,
    budget_warning: buildProjectTokenBudgetWarning(
      thresholds,
      aggregation.totals,
    ),
    token_budget: buildProjectTokenBudgetStatus(thresholds, aggregation.totals),
    failed_root_session_count: failedRootSessionCount,
    failure_summary:
      failedRootSessionCount === 0
        ? null
        : `Token usage unavailable for ${failedRootSessionCount} of ${rootSessionCount} root sessions.`,
    root_session_count: rootSessionCount,
    totals: aggregation.totals,
  };
};

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

const getCurrentBaselineCommitSha = async (projectId: string) => {
  const workspacePath = resolveProjectWorkspacePath(projectId);

  if (!existsSync(workspacePath)) {
    return null;
  }

  try {
    return await new Promise<string>((resolve, reject) => {
      execFile(
        "git",
        ["rev-parse", "origin/main"],
        { cwd: workspacePath },
        (error, stdout) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(stdout.trim());
        },
      );
    });
  } catch {
    return null;
  }
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

  const collectProjectTokenUsage = async (
    projectId: string,
  ): Promise<ProjectTokenUsageAggregation> => {
    const baseUrl = process.env.OPENCODE_BASE_URL ?? "http://localhost:4096";
    const tasks = (await getRepository().listTasks({ project_id: projectId }))
      .filter(taskHasRootSession)
      .sort((left, right) => left.created_at.localeCompare(right.created_at));
    const totals = zeroTokenUsageTotals();
    const taskUsages: ProjectTokenUsageAggregation["taskUsages"] = [];
    const sessionUsages: ProjectTokenUsageAggregation["sessionUsages"] = [];
    const failures: ProjectTokenUsageAggregation["failures"] = [];

    for (const task of tasks) {
      const timeout = createTimeoutSignal(projectTokenUsageSessionTimeoutMs);

      try {
        const stats = await statTokensBySessionId(baseUrl, task.session_id, {
          signal: timeout.signal,
        });
        const taskTotals = toTokenUsageTotals(stats);

        addTokenUsageTotals(totals, taskTotals);
        taskUsages.push({
          failures: [],
          session_id: task.session_id,
          task_id: task.task_id,
          title: task.title,
          totals: taskTotals,
        });
        sessionUsages.push({
          failure: null,
          root_session_id: task.session_id,
          task_id: task.task_id,
          title: task.title,
          totals: taskTotals,
        });
      } catch (error) {
        const failure = buildOpenCodeMessagesFailure({
          error,
          rootSessionId: task.session_id,
          taskId: task.task_id,
        });
        const taskTotals = zeroTokenUsageTotals();

        failures.push(failure);
        taskUsages.push({
          failures: [failure],
          session_id: task.session_id,
          task_id: task.task_id,
          title: task.title,
          totals: taskTotals,
        });
        sessionUsages.push({
          failure,
          root_session_id: task.session_id,
          task_id: task.task_id,
          title: task.title,
          totals: taskTotals,
        });
      } finally {
        timeout.dispose();
      }
    }

    return { failures, sessionUsages, taskUsages, totals };
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

  app.get(projectByIdRoutePath, async (context) => {
    const projectId = requireProjectId(context.req.param("projectId"));
    const project = await getRepository().getProjectById(projectId);

    if (!project) {
      return context.json(buildNotFoundError(projectId), 404);
    }

    return context.json(toProjectResponse(project), 200);
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
    const optimizerStatus = runtimeActive
      ? options.optimizerSystem?.getProjectStatus?.(projectId)
      : undefined;
    const response = projectOptimizerStatusResponseSchema.parse({
      project_id: projectId,
      optimizer_enabled: optimizerEnabled,
      runtime_active: runtimeActive,
      current_baseline_commit_sha: await getCurrentBaselineCommitSha(projectId),
      blocker_summary:
        optimizerStatus === undefined
          ? getOptimizerBlockerSummary({
              optimizerEnabled,
              runtimeActive,
            })
          : optimizerStatus.blocker_summary,
      recent_events: optimizerStatus?.recent_events ?? [],
      token_usage: summarizeTokenUsageAggregation(
        await collectProjectTokenUsage(projectId),
        project,
      ),
    });

    return context.json(response, 200);
  });

  app.get(projectTokenUsageRoutePath, async (context) => {
    const projectId = requireProjectId(context.req.param("projectId"));
    const project = await getRepository().getProjectById(projectId);

    if (!project) {
      return context.json(buildNotFoundError(projectId), 404);
    }

    const { failures, sessionUsages, taskUsages, totals } =
      await collectProjectTokenUsage(projectId);

    const response = projectTokenUsageResponseSchema.parse({
      failures,
      budget_warning: buildProjectTokenBudgetWarning(project, totals),
      token_budget: buildProjectTokenBudgetStatus(project, totals),
      project_id: projectId,
      sessions: sessionUsages,
      tasks: taskUsages,
      totals,
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
