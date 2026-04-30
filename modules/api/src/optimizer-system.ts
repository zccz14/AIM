import type {
  Dimension,
  DimensionEvaluation,
  Project,
  ProjectOptimizerStatusResponse,
  Task,
} from "@aim-ai/contract";

import type { ApiLogger } from "./api-logger.js";
import { createCoordinator } from "./coordinator.js";
import type {
  CoordinatorState,
  CoordinatorStateInput,
} from "./coordinator-state-repository.js";
import { createDeveloper } from "./developer.js";
import type { Manager } from "./manager.js";
import { createManager } from "./manager.js";
import type {
  ManagerState,
  ManagerStateInput,
} from "./manager-state-repository.js";
import { createOpenCodeSessionManager } from "./opencode-session-manager.js";
import type { OptimizerLaneRecentEvent } from "./optimizer-lane-events.js";
import { createOptimizerLaneEventRecorder } from "./optimizer-lane-events.js";
import { buildProjectTokenBudgetWarning } from "./project-budget-warning.js";
import { ensureProjectWorkspace } from "./project-workspace.js";
import { statTokensBySessionId } from "./stat-tokens.js";

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
  listTasks(filters?: { project_id?: string }): Promise<Task[]> | Task[];
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

type CoordinatorStateRepository = {
  clearCoordinatorState(projectId: string): boolean;
  getCoordinatorState(projectId: string): CoordinatorState | null;
  upsertCoordinatorState(input: CoordinatorStateInput): CoordinatorState;
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
  coordinatorStateRepository: CoordinatorStateRepository;
  coordinatorConfig: OpenCodeSessionManagerConfig;
  dimensionRepository: DimensionRepository;
  intervalMs: number;
  logger?: ApiLogger;
  managerStateRepository: ManagerStateRepository;
  taskRepository: TaskRepository;
};

const getErrorSummary = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const zeroTokenUsageTotals = () => ({
  cache: { read: 0, write: 0 },
  cost: 0,
  input: 0,
  messages: 0,
  output: 0,
  reasoning: 0,
  total: 0,
});

const addTokenStats = (
  totals: ReturnType<typeof zeroTokenUsageTotals>,
  stats: Awaited<ReturnType<typeof statTokensBySessionId>>,
) => {
  totals.cache.read += stats.totals.cache.read;
  totals.cache.write += stats.totals.cache.write;
  totals.cost += stats.totals.cost;
  totals.input += stats.totals.input;
  totals.messages += stats.totals.messages;
  totals.output += stats.totals.output;
  totals.reasoning += stats.totals.reasoning;
  totals.total += stats.totals.total;
};

const collectProjectBudgetWarning = async ({
  baseUrl,
  project,
  taskRepository,
}: {
  baseUrl: string;
  project: Project;
  taskRepository: TaskRepository;
}) => {
  const totals = zeroTokenUsageTotals();
  const tasks = (await taskRepository.listTasks({ project_id: project.id }))
    .filter((task) => typeof task.session_id === "string")
    .sort((left, right) => left.created_at.localeCompare(right.created_at));

  for (const task of tasks) {
    if (!task.session_id) {
      continue;
    }

    addTokenStats(
      totals,
      await statTokensBySessionId(baseUrl, task.session_id),
    );
  }

  return buildProjectTokenBudgetWarning(project, totals);
};

const isConfiguredProject = (project: Project) =>
  Boolean(project.global_provider_id.trim() && project.global_model_id.trim());

const isOptimizerEnabled = (project: Project) => project.optimizer_enabled;

const laneSummaryNames = {
  coordinator: "Coordinator",
  developer: "Developer",
  manager: "Manager",
} as const;

const summarizeNonManagerLaneBlocker = (
  recentEvents: OptimizerLaneRecentEvent[],
) => {
  const blockerEvent = recentEvents.find(
    (event) =>
      event.lane_name !== "manager" &&
      (event.event === "failure" || event.event === "idle"),
  );

  return blockerEvent
    ? `${laneSummaryNames[blockerEvent.lane_name]} lane ${
        blockerEvent.event === "failure" ? "failed" : "idle"
      }: ${blockerEvent.summary}`
    : null;
};

export const createOptimizerSystem = async ({
  continuationSessionRepository,
  coordinatorStateRepository,
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
          coordinatorStateRepository,
          dimensionRepository,
          onLaneEvent: laneEvents.record,
          budgetWarningProvider: () =>
            collectProjectBudgetWarning({
              baseUrl: coordinatorConfig.baseUrl,
              project,
              taskRepository,
            }),
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
      const recentEvents = laneEvents.list(projectId);

      if (!manager) {
        return {
          blocker_summary: "Optimizer lane inactive",
          recent_events: recentEvents,
        };
      }

      const status = manager.getStatus();
      const nonManagerBlockerSummary =
        summarizeNonManagerLaneBlocker(recentEvents);

      return {
        blocker_summary: status.last_error
          ? `Manager lane failed: ${status.last_error}`
          : (nonManagerBlockerSummary ??
            (status.last_scan_at
              ? `Manager lane active; recent scan at ${status.last_scan_at}`
              : status.running
                ? "Manager lane active; no recent scan yet"
                : "Manager lane inactive")),
        recent_events: recentEvents,
      };
    },
  };
};
