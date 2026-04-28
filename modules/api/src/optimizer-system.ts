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

const isConfiguredProject = (project: Project) =>
  Boolean(project.global_provider_id.trim() && project.global_model_id.trim());

const isOptimizerEnabled = (project: Project) => project.optimizer_enabled;

export const createOptimizerSystem = ({
  continuationSessionRepository,
  coordinatorConfig,
  dimensionRepository,
  logger,
  managerStateRepository,
  taskRepository,
}: CreateOptimizerSystemOptions): OptimizerSystem => {
  const stack = new AsyncDisposableStack();
  try {
    const configuredProjects = taskRepository
      .listProjects()
      .filter(isConfiguredProject);
    const enabledConfiguredProjects =
      configuredProjects.filter(isOptimizerEnabled);
    const openCodeSessionManager = stack.use(
      createOpenCodeSessionManager({
        baseUrl: coordinatorConfig.baseUrl,
        repository: continuationSessionRepository,
      }),
    );
    stack.use(
      createDeveloper({
        logger,
        sessionManager: openCodeSessionManager,
        taskRepository,
      }),
    );

    for (const project of enabledConfiguredProjects) {
      stack.use(
        createManager({
          dimensionRepository,
          logger,
          managerStateRepository,
          project,
          sessionManager: openCodeSessionManager,
        }),
      );
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
    }

    return {
      async [Symbol.asyncDispose]() {
        await stack.disposeAsync();
      },
    };
  } catch (error) {
    void (async () => {
      await stack.disposeAsync();
    })().catch((disposeError: unknown) => {
      logger?.error(
        {
          err: disposeError,
          event: "optimizer_setup_dispose_failed",
        },
        "Optimizer system setup cleanup failed",
      );
    });
    throw error;
  }
};
