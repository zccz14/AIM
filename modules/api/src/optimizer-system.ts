import type {
  Dimension,
  DimensionEvaluation,
  Project,
  Task,
} from "@aim-ai/contract";

import type { ApiLogger } from "./api-logger.js";
import { createCoordinator } from "./coordinator.js";
import { createDeveloper } from "./developer.js";
import { createManager } from "./manager.js";
import type {
  ManagerState,
  ManagerStateInput,
} from "./manager-state-repository.js";
import { createOpenCodeSessionManager } from "./opencode-session-manager.js";
import { ensureProjectWorkspace } from "./project-workspace.js";

type CoordinatorProject = Omit<Project, "optimizer_enabled"> & {
  optimizer_enabled?: boolean | number;
};

type TaskRepository = {
  assignSessionIfUnassigned(
    taskId: string,
    sessionId: string,
  ): Promise<null | Task>;
  getProjectById(
    projectId: string,
  ): null | CoordinatorProject | Promise<null | CoordinatorProject>;
  listProjects(): Project[];
  listRejectedTasksByProject(projectId: string): Promise<Task[]>;
  listUnfinishedTasks(): Promise<Task[]>;
};

type ContinuationSession = {
  continue_prompt: null | string;
  model_id?: null | string;
  provider_id?: null | string;
  reason: null | string;
  session_id: string;
  state: "pending" | "rejected" | "resolved";
  value: null | string;
};

type ContinuationSessionRepository = AsyncDisposable & {
  createSession(input: {
    continue_prompt?: null | string;
    model_id?: null | string;
    provider_id?: null | string;
    session_id: string;
  }): Promise<ContinuationSession>;
  getSessionById(sessionId: string): null | ContinuationSession;
  listSessions(filter: {
    state?: "pending" | "rejected" | "resolved";
  }): ContinuationSession[] | Promise<ContinuationSession[]>;
};

export type OpenCodeSessionManagerConfig = {
  baseUrl: string;
  sessionIdleFallbackTimeoutMs?: number;
};

type DimensionRepository = {
  listDimensions(projectId: string): Promise<Dimension[]> | Dimension[];
  listDimensionEvaluations(
    dimensionId: string,
  ): Promise<DimensionEvaluation[]> | DimensionEvaluation[];
  listUnevaluatedDimensionIds(
    projectId: string,
    commitSha: string,
  ): Promise<string[]>;
};

type ManagerStateRepository = {
  clearManagerState(projectId: string): boolean;
  getManagerState(projectId: string): ManagerState | null;
  upsertManagerState(input: ManagerStateInput): ManagerState;
};

export type OptimizerSystem = AsyncDisposable;

type CreateOptimizerSystemOptions = {
  continuationSessionRepository: ContinuationSessionRepository;
  coordinatorConfig: OpenCodeSessionManagerConfig;
  dimensionRepository: DimensionRepository;
  intervalMs: number;
  logger?: ApiLogger;
  managerStateRepository: ManagerStateRepository;
  taskRepository: TaskRepository;
};

const getErrorSummary = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const isConfiguredProject = (project: Project) =>
  Boolean(project.global_provider_id.trim() && project.global_model_id.trim());

const isOptimizerEnabled = (project: Project) => project.optimizer_enabled;

export const createOptimizerSystem = async ({
  continuationSessionRepository,
  coordinatorConfig,
  dimensionRepository,
  logger,
  managerStateRepository,
  taskRepository,
}: CreateOptimizerSystemOptions): Promise<OptimizerSystem> => {
  await using stack = new AsyncDisposableStack();
  let projects: Project[];

  try {
    projects = taskRepository.listProjects();
  } catch (error) {
    logger?.error(
      {
        component: "optimizer-system",
        error_summary: getErrorSummary(error),
        optimizer_configured_stage: "list_projects",
      },
      "Optimizer setup failed while listing projects",
    );
    throw error;
  }

  const configuredProjects = projects.filter(isConfiguredProject);
  const enabledConfiguredProjects =
    configuredProjects.filter(isOptimizerEnabled);
  const startupContext = {
    configured_project_count: configuredProjects.length,
    enabled_configured_project_count: enabledConfiguredProjects.length,
    optimizer_configured_stage: "configured_projects_filter",
    optimizer_enabled_stage: "enabled_projects_filter",
    total_project_count: projects.length,
  };
  let openCodeSessionManager: ReturnType<typeof createOpenCodeSessionManager>;

  try {
    openCodeSessionManager = stack.use(
      createOpenCodeSessionManager({
        baseUrl: coordinatorConfig.baseUrl,
        repository: continuationSessionRepository,
      }),
    );
  } catch (error) {
    logger?.error(
      {
        ...startupContext,
        component: "opencode-session-manager",
        error_summary: getErrorSummary(error),
      },
      "Optimizer setup failed while creating OpenCode session manager",
    );
    throw error;
  }

  try {
    stack.use(
      createDeveloper({
        logger,
        sessionManager: openCodeSessionManager,
        taskRepository,
      }),
    );
  } catch (error) {
    logger?.error(
      {
        ...startupContext,
        component: "developer",
        error_summary: getErrorSummary(error),
        lane: "developer",
      },
      "Optimizer setup failed while creating developer lane",
    );
    throw error;
  }

  for (const project of enabledConfiguredProjects) {
    const projectContext = {
      ...startupContext,
      optimizer_enabled: project.optimizer_enabled,
      project_id: project.id,
    };

    try {
      stack.use(
        createManager({
          dimensionRepository,
          logger,
          managerStateRepository,
          project,
          sessionManager: openCodeSessionManager,
        }),
      );
    } catch (error) {
      logger?.error(
        {
          ...projectContext,
          component: "manager",
          error_summary: getErrorSummary(error),
          lane: "manager",
        },
        "Optimizer setup failed while creating manager lane",
      );
      throw error;
    }

    try {
      stack.use(
        createCoordinator(project.id, {
          continuationSessionRepository,
          dimensionRepository,
          projectDirectory: () =>
            ensureProjectWorkspace({
              git_origin_url: project.git_origin_url,
              project_id: project.id,
            }),
          sessionManager: openCodeSessionManager,
          taskRepository,
        }),
      );
    } catch (error) {
      logger?.error(
        {
          ...projectContext,
          component: "coordinator",
          error_summary: getErrorSummary(error),
          lane: "coordinator",
        },
        "Optimizer setup failed while creating coordinator lane",
      );
      throw error;
    }
  }

  return stack.move();
};
