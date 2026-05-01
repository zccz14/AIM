import { createHash } from "node:crypto";

import type {
  Dimension,
  DimensionEvaluation,
  Project,
  Task,
} from "@aim-ai/contract";

import { cancelableSleep } from "./cancelable-sleep.js";
import type {
  CoordinatorState,
  CoordinatorStateInput,
} from "./coordinator-state-repository.js";
import { execGit } from "./exec-file.js";
import type { OpenCodeSessionManager } from "./opencode-session-manager.js";
import type { OptimizerLaneEventInput } from "./optimizer-lane-events.js";
import type { ProjectBudgetWarning } from "./project-budget-warning.js";

type CoordinatorProject = Omit<Project, "optimizer_enabled"> & {
  optimizer_enabled?: boolean | number;
};

type TaskRepository = {
  getProjectById(
    projectId: string,
  ): null | CoordinatorProject | Promise<null | CoordinatorProject>;
  listRejectedTasksByProject(projectId: string): Promise<Task[]> | Task[];
  listUnfinishedTasks(): Promise<Task[]> | Task[];
};

type BaselineFacts = {
  commitSha: string;
  fetchedAt: string;
  summary: string;
};

type BaselineRepository = {
  getLatestBaselineFacts(projectDirectory: string): Promise<BaselineFacts>;
};

type DimensionRepository = {
  listDimensions(projectId: string): Promise<Dimension[]> | Dimension[];
  listDimensionEvaluations(
    dimensionId: string,
  ): Promise<DimensionEvaluation[]> | DimensionEvaluation[];
};

type ContinuationSession = {
  session_id: string;
  state: "pending" | "rejected" | "resolved";
};

type ContinuationSessionRepository = {
  getSessionById(
    sessionId: string,
  ): null | ContinuationSession | Promise<null | ContinuationSession>;
};

type CoordinatorStateRepository = {
  clearCoordinatorState(projectId: string): boolean;
  getCoordinatorState(projectId: string): CoordinatorState | null;
  upsertCoordinatorState(input: CoordinatorStateInput): CoordinatorState;
};

type CreateCoordinatorOptions = {
  activeTaskThreshold?: number;
  baselineRepository?: BaselineRepository;
  budgetWarningProvider?: (input: {
    project: CoordinatorProject;
    projectId: string;
  }) => ProjectBudgetWarning | Promise<ProjectBudgetWarning>;
  continuationSessionRepository?: ContinuationSessionRepository;
  coordinatorStateRepository?: CoordinatorStateRepository;
  dimensionRepository: DimensionRepository;
  heartbeatMs?: number;
  onLaneEvent?: (event: OptimizerLaneEventInput) => void;
  projectDirectory: string | (() => Promise<string> | string);
  sessionManager: Pick<OpenCodeSessionManager, "createSession">;
  taskRepository: TaskRepository;
};

type ManagedSession = Awaited<
  ReturnType<OpenCodeSessionManager["createSession"]>
>;

const defaultActiveTaskThreshold = 10;
const defaultHeartbeatMs = 1000;

const git = async (projectDirectory: string, args: string[]) =>
  (await execGit(projectDirectory, args, { target: projectDirectory })).trim();

const defaultBaselineRepository: BaselineRepository = {
  async getLatestBaselineFacts(projectDirectory) {
    await git(projectDirectory, ["fetch", "origin", "main"]);

    return {
      commitSha: await git(projectDirectory, ["rev-parse", "origin/main"]),
      fetchedAt: new Date().toISOString(),
      summary: await git(projectDirectory, [
        "log",
        "-1",
        "--format=%s",
        "origin/main",
      ]),
    };
  },
};

const defaultBudgetWarningProvider = () => ({
  cost_warning_threshold: null,
  message: null,
  status: "not_configured" as const,
  token_warning_threshold: null,
});

const summarizeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const resolveProjectDirectory = (
  projectDirectory: CreateCoordinatorOptions["projectDirectory"],
) =>
  typeof projectDirectory === "function"
    ? Promise.resolve(projectDirectory())
    : Promise.resolve(projectDirectory);

const latestEvaluation = (evaluations: DimensionEvaluation[]) =>
  evaluations.reduce<DimensionEvaluation | null>(
    (latest, evaluation) =>
      !latest || evaluation.created_at > latest.created_at
        ? evaluation
        : latest,
    null,
  );

const planningInputHash = ({
  activeTasks,
  baselineFacts,
  dimensions,
  evaluations,
  rejectedTasks,
  threshold,
}: {
  activeTasks: Task[];
  baselineFacts: BaselineFacts;
  dimensions: Dimension[];
  evaluations: Array<{ dimension: Dimension; evaluation: DimensionEvaluation }>;
  rejectedTasks: Task[];
  threshold: number;
}) => {
  const input = {
    activeTasks: activeTasks
      .map((task) => ({
        status: task.status,
        task_id: task.task_id,
        updated_at: task.updated_at,
      }))
      .sort((left, right) => left.task_id.localeCompare(right.task_id)),
    commitSha: baselineFacts.commitSha,
    dimensions: dimensions
      .map((dimension) => ({
        goal: dimension.goal,
        id: dimension.id,
        name: dimension.name,
        updated_at: dimension.updated_at,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    latestEvaluations: evaluations
      .map(({ evaluation }) => ({
        commit_sha: evaluation.commit_sha,
        created_at: evaluation.created_at,
        dimension_id: evaluation.dimension_id,
        evaluation: evaluation.evaluation,
        id: evaluation.id,
        score: evaluation.score,
      }))
      .sort((left, right) =>
        left.dimension_id.localeCompare(right.dimension_id),
      ),
    rejectedTasks: rejectedTasks
      .map((task) => ({
        result: task.result,
        status: task.status,
        task_id: task.task_id,
        updated_at: task.updated_at,
      }))
      .sort((left, right) => left.task_id.localeCompare(right.task_id)),
    threshold,
  };

  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getNonEmptyString = (source: Record<string, unknown>, field: string) => {
  const value = source[field];

  return typeof value === "string" && value.trim().length > 0 ? value : null;
};

const getTaskValidatedBaseline = (task: Task) => {
  const validation = task.source_metadata.task_spec_validation;

  return isRecord(validation)
    ? getNonEmptyString(validation, "validated_baseline_commit")
    : null;
};

const getTaskFreshnessStatus = ({
  currentBaseline,
  sourceBaseline,
  validatedBaseline,
}: {
  currentBaseline: string;
  sourceBaseline: null | string;
  validatedBaseline: null | string;
}) => {
  if (!sourceBaseline && !validatedBaseline) {
    return "missing_baseline_metadata";
  }

  if (!currentBaseline || !sourceBaseline || !validatedBaseline) {
    return "unknown";
  }

  return sourceBaseline === currentBaseline &&
    validatedBaseline === currentBaseline
    ? "current"
    : "stale";
};

const summarizeActiveTask = (task: Task, baselineFacts: BaselineFacts) => {
  const sourceBaseline = getNonEmptyString(
    task.source_metadata,
    "latest_origin_main_commit",
  );
  const validatedBaseline = getTaskValidatedBaseline(task);
  const freshness = getTaskFreshnessStatus({
    currentBaseline: baselineFacts.commitSha,
    sourceBaseline,
    validatedBaseline,
  });

  return `- ${task.title} (${task.task_id}) status ${task.status}; source baseline ${sourceBaseline ?? "(missing)"}; validated baseline ${validatedBaseline ?? "(missing)"}; freshness ${freshness}; PR ${task.pull_request_url ?? "(not set)"}; worktree ${task.worktree_path ?? "(not set)"}; session ${task.session_id ?? "(not set)"}`;
};

const buildPrompt = ({
  activeTasks,
  baselineFacts,
  project,
  threshold,
}: {
  activeTasks: Task[];
  baselineFacts: BaselineFacts;
  dimensions: Dimension[];
  evaluations: Array<{ dimension: Dimension; evaluation: DimensionEvaluation }>;
  project: CoordinatorProject;
  rejectedTasks: Task[];
  threshold: number;
}) => {
  const activeTaskSummary = activeTasks
    .map((task) => summarizeActiveTask(task, baselineFacts))
    .join("\n");

  return `You are the AIM Coordinator for project_id "${project.id}".

AIM Server base URL: http://localhost:8192

FOLLOW the aim-coordinator-guide SKILL.

Maintain the Active Task Pool for this single project only. The current threshold is ${threshold}. Active Task Pool: ${activeTasks.length} unfinished Tasks.

Current Active Task Pool freshness summary:
${activeTaskSummary || "- No unfinished Tasks in this project."}

Fetch current dimensions, dimension evaluations, current Active Task Pool, and rejected tasks via the AIM API if needed. Fetch and validate the origin/main baseline locally before planning. Append Tasks only when the pool needs more actionable work. Do not operate on other projects and do not run an Issue Reducer.

Before considering POST /tasks/batch, run POST /coordinator/proposals/dry-run using the current Manager evaluations, current Active Task Pool, rejected Task feedback, and current baseline commit. Treat the dry_run_only output as planning evidence only: it must not write directly, must not bypass POST /tasks/batch, and must not replace source_metadata.task_spec_validation.

Use dry-run results to plan conservatively:
- Blocked create output means the blocked proposal must not enter POST /tasks/batch.
- Covered keep output means existing Active Task Pool coverage should be kept instead of duplicated.
- Stale delete output is only a delete candidate; verify the Task is stale, unneeded, and safe before including any delete operation.
- Only create drafts that survive dry-run and independent Task Spec validation with conclusion "pass" may enter POST /tasks/batch.

POST /tasks/batch planning and validation guardrails:
- Create Tasks only through POST /tasks/batch after independently checking the latest origin/main baseline facts and current Active Task Pool.
- Do not create stale baseline work, self-overlap, duplicate coverage, or replacements that conflict with unfinished Tasks in this project.
- Every create operation must include source_metadata Coordinator planning evidence: current_task_pool_coverage, dependency_rationale, conflict_duplicate_assessment, and unfinished_task_non_conflict_rationale.
- Every create operation must include complete source_metadata.task_spec_validation evidence with conclusion "pass". Never submit waiting_assumptions or failed Task Spec validation through POST /tasks/batch.
- Fetch rejected Task feedback yourself before planning so stale baseline, self-overlap, duplicate coverage, waiting_assumptions, and failed Task Spec validation patterns are not repeated.`;
};

export const createCoordinator = (
  projectId: string,
  options: CreateCoordinatorOptions,
): AsyncDisposable => {
  const stack = new AsyncDisposableStack();
  const abortController = new AbortController();
  const threshold = options.activeTaskThreshold ?? defaultActiveTaskThreshold;
  const heartbeatMs = options.heartbeatMs ?? defaultHeartbeatMs;
  const baselineRepository =
    options.baselineRepository ?? defaultBaselineRepository;
  let activeSession: ManagedSession | null = null;
  let sessionCreationPending = false;

  const isPersistedPlanningSessionPending = async () => {
    const persistedState =
      options.coordinatorStateRepository?.getCoordinatorState(projectId);

    if (persistedState?.state !== "planning" || !persistedState.session_id) {
      return false;
    }

    if (!options.continuationSessionRepository) {
      return true;
    }

    const continuationSession =
      await options.continuationSessionRepository.getSessionById(
        persistedState.session_id,
      );

    return continuationSession?.state === "pending";
  };

  const hasActiveSession = async () => {
    if (!activeSession) {
      return false;
    }

    if (!options.continuationSessionRepository) {
      return true;
    }

    const sessionId = activeSession.session_id;
    let continuationSession: null | ContinuationSession;
    try {
      continuationSession =
        await options.continuationSessionRepository.getSessionById(sessionId);
    } catch (error) {
      activeSession = null;
      throw error;
    }

    if (!continuationSession) {
      activeSession = null;
      throw new Error(
        `Coordinator session ${sessionId} was not found during settlement observation`,
      );
    }

    if (continuationSession.state === "pending") {
      return true;
    }

    activeSession = null;
    return false;
  };

  const scanOnce = async () => {
    const project = await options.taskRepository.getProjectById(projectId);
    if (!project) {
      options.onLaneEvent?.({
        event: "idle",
        lane_name: "coordinator",
        project_id: projectId,
        summary:
          "Coordinator lane skipped scan because the project was not found.",
      });
      return;
    }

    const activeTasks = (
      await options.taskRepository.listUnfinishedTasks()
    ).filter((task) => task.project_id === projectId);
    const activeCoordinatorSession =
      sessionCreationPending ||
      (await hasActiveSession()) ||
      (await isPersistedPlanningSessionPending());
    if (activeTasks.length >= threshold) {
      options.coordinatorStateRepository?.clearCoordinatorState(projectId);
      options.onLaneEvent?.({
        event: "idle",
        lane_name: "coordinator",
        project_id: projectId,
        summary: `Coordinator lane idle: active task pool has ${activeTasks.length} unfinished tasks.`,
      });
      return;
    }

    if (activeCoordinatorSession) {
      options.onLaneEvent?.({
        event: "idle",
        lane_name: "coordinator",
        project_id: projectId,
        summary: "Coordinator lane idle: coordinator session already active.",
      });
      return;
    }

    let budgetWarning: ProjectBudgetWarning;
    try {
      budgetWarning = await (
        options.budgetWarningProvider ?? defaultBudgetWarningProvider
      )({ project, projectId });
    } catch (error) {
      options.onLaneEvent?.({
        event: "failure",
        lane_name: "coordinator",
        project_id: projectId,
        summary: `Coordinator lane skipped task-pool planning because project token usage could not be collected: ${summarizeError(error)}. Restore token usage collection or clear the budget uncertainty before expecting automatic Task Pool refill.`,
      });
      return;
    }

    if (budgetWarning.status === "exceeded") {
      options.onLaneEvent?.({
        event: "idle",
        lane_name: "coordinator",
        project_id: projectId,
        summary: `Coordinator lane blocked by project budget warning: ${budgetWarning.message ?? "Project budget warning threshold exceeded."}`,
      });
      return;
    }

    const dimensions =
      await options.dimensionRepository.listDimensions(projectId);
    const rejectedTasks = (
      await options.taskRepository.listRejectedTasksByProject(projectId)
    ).filter((task) => task.project_id === projectId);
    const evaluations = (
      await Promise.all(
        dimensions.map(async (dimension) => {
          const evaluation = latestEvaluation(
            await options.dimensionRepository.listDimensionEvaluations(
              dimension.id,
            ),
          );

          return evaluation ? { dimension, evaluation } : null;
        }),
      )
    ).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const directory = await resolveProjectDirectory(options.projectDirectory);
    const baselineFacts =
      await baselineRepository.getLatestBaselineFacts(directory);
    const inputHash = planningInputHash({
      activeTasks,
      baselineFacts,
      dimensions,
      evaluations,
      rejectedTasks,
      threshold,
    });

    sessionCreationPending = true;
    options.coordinatorStateRepository?.upsertCoordinatorState({
      active_task_count: activeTasks.length,
      commit_sha: baselineFacts.commitSha,
      last_error: null,
      planning_input_hash: inputHash,
      project_id: projectId,
      session_id: null,
      state: "planning",
      threshold,
    });
    options.onLaneEvent?.({
      event: "start",
      lane_name: "coordinator",
      project_id: projectId,
      summary: "Coordinator lane started task-pool planning session creation.",
    });
    try {
      activeSession = await options.sessionManager.createSession({
        prompt: buildPrompt({
          activeTasks,
          baselineFacts,
          dimensions,
          evaluations,
          project,
          rejectedTasks,
          threshold,
        }),
        projectId: project.id,
        title: `AIM Coordinator task-pool session (${project.id})`,
      });
      options.coordinatorStateRepository?.upsertCoordinatorState({
        active_task_count: activeTasks.length,
        commit_sha: baselineFacts.commitSha,
        last_error: null,
        planning_input_hash: inputHash,
        project_id: projectId,
        session_id: activeSession.session_id,
        state: "planning",
        threshold,
      });
      options.onLaneEvent?.({
        event: "success",
        lane_name: "coordinator",
        project_id: projectId,
        session_id: activeSession.session_id,
        summary: `Coordinator lane created planning session ${activeSession.session_id}.`,
      });
    } catch (error) {
      options.coordinatorStateRepository?.upsertCoordinatorState({
        active_task_count: activeTasks.length,
        commit_sha: baselineFacts.commitSha,
        last_error: summarizeError(error),
        planning_input_hash: inputHash,
        project_id: projectId,
        session_id: null,
        state: "failed",
        threshold,
      });

      throw error;
    } finally {
      sessionCreationPending = false;
    }
  };

  const loop = (async () => {
    while (!abortController.signal.aborted) {
      try {
        await scanOnce();
      } catch (error) {
        options.onLaneEvent?.({
          event: "failure",
          lane_name: "coordinator",
          project_id: projectId,
          summary: `Coordinator lane failed: ${summarizeError(error)}. Review task-pool planning inputs and recover the lane blocker before expecting new Tasks.`,
        });
        console.warn("Coordinator heartbeat failed", {
          error: summarizeError(error),
          project_id: projectId,
        });
      }
      await cancelableSleep(heartbeatMs, {
        signal: abortController.signal,
      }).catch(() => undefined);
    }
  })();

  stack.defer(async () => {
    abortController.abort();
    await loop;
  });

  return {
    async [Symbol.asyncDispose]() {
      await stack.disposeAsync();
    },
  };
};
