import type { Project, Task } from "@aim-ai/contract";

import { createAgentSessionCoordinator } from "./agent-session-coordinator.js";
import { createAgentSessionLane } from "./agent-session-lane.js";
import type { ApiLogger } from "./api-logger.js";
import { prepareManagerLaneScanInput } from "./manager-lane-targets.js";
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
import {
  createTaskSessionCoordinator,
  type TaskSessionCoordinatorConfig,
} from "./task-session-coordinator.js";

const managerPrompt = `FOLLOW the aim-manager-guide SKILL.

Maintain AIM evaluation dimensions and evaluations by reading the latest origin/main baseline, README goals, current dimensions, evaluations, Task Pool, and rejected Tasks through AIM API Server.

Before every dimension_evaluations append, apply the README claim-to-evidence protocol: classify key README claims as aligned, readme_ahead, baseline_ahead, conflicted, ambiguous, or prerequisite_gap; include an evidence source or limit, confidence limit, and Coordinator handoff implication for each claim that materially affects the dimension.

Write results back through AIM API Server only: create or update dimensions/evaluations using the available AIM API contracts; append dimension_evaluations only for Manager findings. Do not create Developer Tasks from this Manager lane.`;
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
  reason: null | string;
  session_id: string;
  state: "pending" | "rejected" | "resolved";
  value: null | string;
};

type ContinuationSessionRepository = {
  createSession(input: {
    continue_prompt?: null | string;
    session_id: string;
  }): Promise<ContinuationSession>;
  getSessionById(sessionId: string): null | ContinuationSession;
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

export type OptimizerSystem = AsyncDisposable & {
  optimizerRuntime: OptimizerRuntime;
};

type CreateOptimizerSystemOptions = {
  continuationSessionRepository: ContinuationSessionRepository;
  coordinatorConfig: TaskSessionCoordinatorConfig;
  dimensionRepository: DimensionRepository;
  intervalMs: number;
  laneStateRepository: OptimizerLaneStateRepository;
  logger?: ApiLogger;
  taskRepository: TaskRepository;
};

const createMissingProjectLane = () => ({
  [Symbol.asyncDispose]() {
    return Promise.resolve();
  },
  scanOnce() {
    throw new Error(
      "AIM optimizer lane requires at least one configured project",
    );
  },
  start() {
    throw new Error(
      "AIM optimizer lane requires at least one configured project",
    );
  },
});

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
  taskRepository,
}: CreateOptimizerSystemOptions): OptimizerSystem => {
  const configuredProjects = taskRepository
    .listProjects()
    .filter(isConfiguredProject);
  const scheduler = createTaskScheduler({
    continuationSessionRepository,
    coordinator: createTaskSessionCoordinator(coordinatorConfig),
    logger,
    taskRepository,
  });
  const agentCoordinator = createAgentSessionCoordinator(coordinatorConfig);
  const managerLanes =
    configuredProjects.length > 0
      ? configuredProjects.map((project) =>
          createAgentSessionLane({
            continuationSessionRepository,
            coordinator: agentCoordinator,
            laneName: "manager_evaluation",
            laneStateRepository,
            logger,
            modelId: project.global_model_id,
            projectDirectory: () =>
              ensureProjectWorkspace({
                git_origin_url: project.git_origin_url,
                project_id: project.id,
              }),
            prompt: createProjectScopedPrompt(managerPrompt, project),
            prepareScanInput: (input) =>
              prepareManagerLaneScanInput({
                dimensionRepository,
                input,
                projectId: project.id,
              }),
            providerId: project.global_provider_id,
            projectId: project.id,
            title: `AIM Manager evaluation lane (${project.id})`,
          }),
        )
      : [createMissingProjectLane()];
  const coordinatorLanes =
    configuredProjects.length > 0
      ? configuredProjects.map((project) =>
          createAgentSessionLane({
            continuationSessionRepository,
            coordinator: agentCoordinator,
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
        )
      : [createMissingProjectLane()];
  const optimizerRuntime = createOptimizerRuntime({
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
  });

  if (configuredProjects.some(isOptimizerEnabled)) {
    optimizerRuntime.start();
  }

  return {
    async [Symbol.asyncDispose]() {
      await optimizerRuntime[Symbol.asyncDispose]();
    },
    optimizerRuntime,
  };
};
