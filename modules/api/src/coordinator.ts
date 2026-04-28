import { execFile } from "node:child_process";

import type {
  Dimension,
  DimensionEvaluation,
  Project,
  Task,
} from "@aim-ai/contract";

import type { OpenCodeSessionManager } from "./opencode-session-manager.js";

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

type CreateCoordinatorOptions = {
  activeTaskThreshold?: number;
  baselineRepository?: BaselineRepository;
  continuationSessionRepository?: ContinuationSessionRepository;
  dimensionRepository: DimensionRepository;
  heartbeatMs?: number;
  projectDirectory: string | (() => Promise<string> | string);
  sessionManager: Pick<OpenCodeSessionManager, "createSession">;
  taskRepository: TaskRepository;
};

type ManagedSession = Awaited<
  ReturnType<OpenCodeSessionManager["createSession"]>
>;

const defaultActiveTaskThreshold = 10;
const defaultHeartbeatMs = 1000;

const git = (projectDirectory: string, args: string[]) =>
  new Promise<string>((resolve, reject) => {
    execFile("git", args, { cwd: projectDirectory }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(String(stdout).trim());
    });
  });

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

const summarizeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const sleep = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();

      return;
    }

    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });

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

const summarizeRejectedTask = (task: Task) => {
  const validation = task.source_metadata.task_spec_validation;
  const validationSummary =
    typeof validation === "object" && validation !== null
      ? Object.entries(validation as Record<string, unknown>)
          .filter(([key]) =>
            [
              "conclusion",
              "conclusion_summary",
              "failure_reason",
              "blocking_assumptions",
            ].includes(key),
          )
          .map(([key, value]) => `${key}: ${String(value)}`)
          .join("; ")
      : "no task_spec_validation metadata";

  return `- ${task.title} (${task.task_id}) rejected at ${task.updated_at}: ${task.result || "no result"}. ${validationSummary}`;
};

const buildPrioritySummary = ({
  activeTasks,
  baselineFacts,
  evaluations,
}: {
  activeTasks: Task[];
  baselineFacts: BaselineFacts;
  evaluations: Array<{ dimension: Dimension; evaluation: DimensionEvaluation }>;
}) => {
  const rankedEvaluations = evaluations
    .map((entry, index) => {
      const evidence = entry.evaluation.evaluation.toLowerCase();
      const hasReadmeAhead = evidence.includes("readme_ahead");
      const hasConsiderCreate = evidence.includes("consider_create");
      const hasGap = evidence.includes("gap");
      const hasEmptyPoolSignal =
        activeTasks.length === 0 || evidence.includes("empty pool");
      const isCurrentBaseline =
        entry.evaluation.commit_sha === baselineFacts.commitSha;
      const baselineStatus = isCurrentBaseline
        ? "current"
        : `stale/historical: evaluation commit ${entry.evaluation.commit_sha} differs from current ${baselineFacts.commitSha}; do not use independently as create evidence`;
      const rank =
        (hasReadmeAhead ? 100 : 0) +
        (hasConsiderCreate ? 80 : 0) +
        (hasGap ? 40 : 0) +
        (hasEmptyPoolSignal ? 20 : 0) +
        Math.max(0, 100 - entry.evaluation.score) / 10;

      return {
        baselineStatus,
        entry,
        hasConsiderCreate,
        hasGap,
        hasReadmeAhead,
        index,
        isCurrentBaseline,
        rank,
      };
    })
    .sort(
      (left, right) =>
        Number(right.isCurrentBaseline) - Number(left.isCurrentBaseline) ||
        right.rank - left.rank ||
        left.index - right.index,
    );

  return rankedEvaluations
    .map(
      (
        { baselineStatus, entry, hasConsiderCreate, hasGap, hasReadmeAhead },
        index,
      ) => {
        const signals = [
          hasReadmeAhead ? "readme_ahead" : null,
          hasConsiderCreate ? "consider_create" : null,
          hasGap ? "gap" : null,
        ].filter(Boolean);

        return `${index + 1}. ${entry.dimension.name} (${entry.dimension.id}) priority signals: ${signals.join(", ") || "none explicit"}; score: ${entry.evaluation.score}; active_pool: ${activeTasks.length === 0 ? "empty" : `${activeTasks.length} unfinished`}; baseline: ${baselineStatus}; evidence: ${entry.evaluation.evaluation}`;
      },
    )
    .join("\n");
};

const summarizeEvaluation = (
  dimension: Dimension,
  evaluation: DimensionEvaluation,
  baselineFacts: BaselineFacts,
) => {
  const matchesCurrentBaseline =
    evaluation.commit_sha === baselineFacts.commitSha;
  const baselineStatus = matchesCurrentBaseline
    ? `matches current origin/main baseline ${baselineFacts.commitSha}`
    : `stale: evaluation commit ${evaluation.commit_sha} differs from current origin/main baseline ${baselineFacts.commitSha}; treat as historical signal only and do not use it independently as current baseline evidence for creating Tasks`;

  return `- ${dimension.name} (${dimension.id}) score ${evaluation.score} at ${evaluation.created_at}; commit ${evaluation.commit_sha} (${baselineStatus}): ${evaluation.evaluation}`;
};

const buildPrompt = ({
  activeTasks,
  baselineFacts,
  dimensions,
  evaluations,
  project,
  rejectedTasks,
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
  const evaluationSummary = evaluations
    .map(({ dimension, evaluation }) =>
      summarizeEvaluation(dimension, evaluation, baselineFacts),
    )
    .join("\n");
  const poolSummary = activeTasks
    .map((task) => `- ${task.title} (${task.task_id}) status ${task.status}`)
    .join("\n");
  const rejectedSummary = rejectedTasks.map(summarizeRejectedTask).join("\n");
  const prioritySummary = buildPrioritySummary({
    activeTasks,
    baselineFacts,
    evaluations,
  });

  return `You are the AIM Coordinator for project_id "${project.id}".

Maintain the Active Task Pool for this single project only. The current threshold is ${threshold}. Active Task Pool: ${activeTasks.length} unfinished Tasks.

Analyze the latest dimension_evaluations, current Active Task Pool, rejected Task feedback, and latest baseline facts, then append Tasks through the AIM API only when the pool needs more actionable work. Do not operate on other projects and do not run an Issue Reducer.

Current baseline facts:
- origin/main commit "${baselineFacts.commitSha}" fetched at ${baselineFacts.fetchedAt}: ${baselineFacts.summary}

POST /tasks/batch planning and validation guardrails:
- Create Tasks only through POST /tasks/batch after independently checking the latest origin/main baseline facts and current Active Task Pool.
- Do not create stale baseline work, self-overlap, duplicate coverage, or replacements that conflict with unfinished Tasks in this project.
- Every create operation must include source_metadata Coordinator planning evidence: current_task_pool_coverage, dependency_rationale, conflict_duplicate_assessment, and unfinished_task_non_conflict_rationale.
- Every create operation must include complete source_metadata.task_spec_validation evidence with conclusion "pass". Never submit waiting_assumptions or failed Task Spec validation through POST /tasks/batch.
- Use rejected Task feedback below to avoid repeating stale baseline, self-overlap, duplicate coverage, waiting_assumptions, and failed Task Spec validation patterns.

Dimensions:
${dimensions.map((dimension) => `- ${dimension.name} (${dimension.id}): ${dimension.goal}`).join("\n") || "- none"}

Priority summary for candidate signals:
${prioritySummary || "- none"}

Latest dimension_evaluations:
${evaluationSummary || "- none"}

Current Active Task Pool:
${poolSummary || "- none"}

Rejected Task feedback for this project:
${rejectedSummary || "- none"}`;
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

  const hasActiveSession = async () => {
    if (!activeSession) {
      return false;
    }

    if (!options.continuationSessionRepository) {
      return true;
    }

    const { sessionId } = activeSession;
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
      return;
    }

    const activeTasks = (
      await options.taskRepository.listUnfinishedTasks()
    ).filter((task) => task.project_id === projectId);
    const activeCoordinatorSession =
      sessionCreationPending || (await hasActiveSession());
    if (activeTasks.length >= threshold || activeCoordinatorSession) {
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

    sessionCreationPending = true;
    try {
      activeSession = await options.sessionManager.createSession({
        directory,
        model: {
          modelID: project.global_model_id,
          providerID: project.global_provider_id,
        },
        prompt: buildPrompt({
          activeTasks,
          baselineFacts,
          dimensions,
          evaluations,
          project,
          rejectedTasks,
          threshold,
        }),
        title: `AIM Coordinator task-pool session (${project.id})`,
      });
    } finally {
      sessionCreationPending = false;
    }
  };

  const loop = (async () => {
    while (!abortController.signal.aborted) {
      try {
        await scanOnce();
      } catch (error) {
        console.warn("Coordinator heartbeat failed", {
          error: summarizeError(error),
          project_id: projectId,
        });
      }
      await sleep(heartbeatMs, abortController.signal);
    }
  })();

  stack.defer(async () => {
    abortController.abort();
    await loop;
    await activeSession?.[Symbol.asyncDispose]();
  });

  return {
    async [Symbol.asyncDispose]() {
      await stack.disposeAsync();
    },
  };
};
