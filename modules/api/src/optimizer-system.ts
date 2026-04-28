import type { Project, Task } from "@aim-ai/contract";

import { createAgentSessionLane } from "./agent-session-lane.js";
import type { ApiLogger } from "./api-logger.js";
import { createManager } from "./manager.js";
import type {
  ManagerState,
  ManagerStateInput,
} from "./manager-state-repository.js";
import { createOpenCodeSessionManager } from "./opencode-session-manager.js";
import type {
  OptimizerLaneState,
  OptimizerLaneStateInput,
} from "./optimizer-lane-state-repository.js";
import {
  createOptimizerRuntime,
  type OptimizerRuntime,
} from "./optimizer-runtime.js";
import { ensureProjectWorkspace } from "./project-workspace.js";
import { createTaskScheduler } from "./task-scheduler.js";

const coordinatorPrompt = `FOLLOW the aim-coordinator-guide SKILL.

You are an AIM Coordinator responsible for keeping the Developer lane supplied with actionable Tasks. Maintain the unfinished Task Pool so Developers do not go idle while README goals still have measurable gaps.

Use Manager outputs as structured inputs, especially dimensions and dimension_evaluations. Treat each dimension evaluation as a planning signal: identify which dimension still has a gap, decide whether the current Task Pool already covers it, and create or delete Tasks only through POST /tasks/batch operations.

Maintain the AIM Task Pool from dimensions, dimension_evaluations, latest baseline facts, current unfinished Tasks, and rejected Task feedback. Conceptually optimize one dimension at a time from Manager project-level evaluations; if multiple dimensions have gaps, preserve the dimension source and priority in each operation's source_metadata instead of treating Manager output as one undifferentiated report. First read those inputs, then form concrete POST /tasks/batch operations with specific create/delete decisions before any Task Pool write.

Reject or record feedback for generic optimizer-loop Tasks that ask Developers to continue the loop, find an unspecified gap, or self-select the next baseline increment. Do not create a "Continue AIM optimizer loop" Task or any fixed static Developer Task as an optimizer-loop placeholder.

Write Task Pool operations through AIM API Server using the available AIM API contracts, and record rejection feedback when a Task is not actionable. Do not bypass POST /tasks/batch approval or independent Task Spec validation by turning Manager evaluation gaps directly into Tasks. Before any create write, run the minimal Coordinator Task Spec validation entrypoint and classify each candidate as pass, waiting_assumptions, or failed. Persist normalized Task Spec validation evidence in each passing create operation's source_metadata.task_spec_validation, including validation source, validation time or session, conclusion = pass, conclusion summary, and dimension_evaluation/source gap. Keep source_metadata planning evidence separate from task_spec_validation: dimension_id, dimension_evaluation_id, current_task_pool_coverage, dependency_rationale, conflict_duplicate_assessment, and unfinished_task_non_conflict_rationale must explain why the create candidate does not already cover or conflict with existing unfinished Tasks. Task Spec validation evidence cannot replace dependency or conflict planning evidence. If validation fails or waits on assumptions, do not call POST /tasks/batch; feed the blocking assumptions or failed validation reason back into Coordinator planning. Delete-only batches do not require Task Spec validation, but every delete operation must include delete_reason with stale/conflict/baseline absorbed rationale and worktree/PR classification; keep/noop decisions must retain an explicit rationale. Generic optimizer-loop placeholders are not validation evidence.

Resolve or reject only to terminate the OpenCode session promise after API writes or blockers are handled; do not put Task Pool operations or other Coordinator business output in the resolved value.`;

type TaskRepository = {
  assignSessionIfUnassigned(
    taskId: string,
    sessionId: string,
  ): Promise<null | Task>;
  listProjects(): Project[];
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
  listUnevaluatedDimensionIds(
    projectId: string,
    commitSha: string,
  ): Promise<string[]>;
};

type OptimizerLaneStateRepository = {
  getLaneState(
    projectId: string,
    laneName: "coordinator_task_pool" | "manager_evaluation",
  ): null | OptimizerLaneState;
  upsertLaneState(input: OptimizerLaneStateInput): OptimizerLaneState;
};

type ManagerStateRepository = {
  clearManagerState(projectId: string): boolean;
  getManagerState(projectId: string): ManagerState | null;
  upsertManagerState(input: ManagerStateInput): ManagerState;
};

export type OptimizerSystem = AsyncDisposable & {
  optimizerRuntime: OptimizerRuntime;
};

type CreateOptimizerSystemOptions = {
  continuationSessionRepository: ContinuationSessionRepository;
  coordinatorConfig: OpenCodeSessionManagerConfig;
  dimensionRepository: DimensionRepository;
  intervalMs: number;
  laneStateRepository: OptimizerLaneStateRepository;
  logger?: ApiLogger;
  managerStateRepository: ManagerStateRepository;
  taskRepository: TaskRepository;
};

const isConfiguredProject = (project: Project) =>
  Boolean(project.global_provider_id.trim() && project.global_model_id.trim());

const isOptimizerEnabled = (project: Project) => project.optimizer_enabled;

const createProjectScopedPrompt = (
  prompt: string,
  project: Project,
) => `${prompt}

Project scope: project_id "${project.id}". Only act on this configured Project and its workspace; do not infer or use an implicit first project.`;

export const createOptimizerSystem = ({
  continuationSessionRepository,
  coordinatorConfig,
  dimensionRepository,
  intervalMs,
  laneStateRepository,
  logger,
  managerStateRepository,
  taskRepository,
}: CreateOptimizerSystemOptions): OptimizerSystem => {
  const stack = new AsyncDisposableStack();
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
  const scheduler = createTaskScheduler({
    logger,
    sessionManager: openCodeSessionManager,
    taskRepository,
  });
  const managerLanes: ReturnType<typeof createManager>[] = [];
  const coordinatorLanes: ReturnType<typeof createAgentSessionLane>[] = [];

  for (const project of enabledConfiguredProjects) {
    managerLanes.push(
      stack.use(
        createManager({
          dimensionRepository,
          logger,
          managerStateRepository,
          project,
          sessionManager: openCodeSessionManager,
        }),
      ),
    );
    coordinatorLanes.push(
      stack.use(
        createAgentSessionLane({
          continuationSessionRepository,
          coordinator: openCodeSessionManager,
          laneName: "coordinator_task_pool",
          laneStateRepository,
          logger,
          modelId: project.global_model_id,
          projectDirectory: () =>
            ensureProjectWorkspace({
              git_origin_url: project.git_origin_url,
              project_id: project.id,
            }),
          prompt: createProjectScopedPrompt(coordinatorPrompt, project),
          providerId: project.global_provider_id,
          projectId: project.id,
          title: `AIM Coordinator task-pool lane (${project.id})`,
        }),
      ),
    );
  }

  const optimizerRuntime = stack.use(
    createOptimizerRuntime({
      intervalMs,
      lanes: [
        ...managerLanes.map((lane) => ({
          lane,
          name: "manager_evaluation" as const,
        })),
        ...coordinatorLanes.map((lane) => ({
          lane,
          name: "coordinator_task_pool" as const,
        })),
        { lane: scheduler, name: "developer_follow_up" as const },
      ],
      logger,
    }),
  );

  if (enabledConfiguredProjects.length > 0) {
    optimizerRuntime.start();
  }

  return {
    async [Symbol.asyncDispose]() {
      await stack.disposeAsync();
    },
    optimizerRuntime,
  };
};
