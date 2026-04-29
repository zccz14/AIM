import type {
  Dimension,
  DimensionEvaluation,
  Project,
  ProjectOptimizerStatusResponse,
  Task,
} from "@aim-ai/contract";

import type { ApiLogger } from "./api-logger.js";
import { createCoordinator } from "./coordinator.js";
import { createDeveloper } from "./developer.js";
import type { Manager } from "./manager.js";
import { createManager } from "./manager.js";
import type {
  ManagerState,
  ManagerStateInput,
} from "./manager-state-repository.js";
import { createOpenCodeSessionManager } from "./opencode-session-manager.js";
import { createOptimizerLaneEventRecorder } from "./optimizer-lane-events.js";
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

export type OptimizerProjectStatus = Pick<
  ProjectOptimizerStatusResponse,
  "blocker_summary" | "recent_events"
>;

export type OptimizerSystem = AsyncDisposable & {
  getProjectStatus?(projectId: string): OptimizerProjectStatus;
};

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
  const managersByProjectId = new Map<string, Manager>();
  const laneEvents = stack.use(createOptimizerLaneEventRecorder());
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
        onLaneEvent: laneEvents.record,
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
      const manager = stack.use(
        createManager({
          dimensionRepository,
          logger,
          managerStateRepository,
          onLaneEvent: laneEvents.record,
          project,
          sessionManager: openCodeSessionManager,
        }),
      );
      managersByProjectId.set(project.id, manager);
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
          onLaneEvent: laneEvents.record,
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

  const resources = stack.move();

  return {
    async [Symbol.asyncDispose]() {
      await resources[Symbol.asyncDispose]();
    },
    getProjectStatus(projectId: string) {
      const manager = managersByProjectId.get(projectId);

      if (!manager) {
        return {
          blocker_summary: "Optimizer lane inactive",
          recent_events: laneEvents.list(projectId),
        };
      }

      const status = manager.getStatus();

      return {
        blocker_summary: status.last_error
          ? `Manager lane failed: ${status.last_error}`
          : status.last_scan_at
            ? `Manager lane active; recent scan at ${status.last_scan_at}`
            : status.running
              ? "Manager lane active; no recent scan yet"
              : "Manager lane inactive",
        recent_events: laneEvents.list(projectId),
      };
    },
  };
};
