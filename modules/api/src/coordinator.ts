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
  listUnfinishedTasks(): Promise<Task[]> | Task[];
};

type DimensionRepository = {
  listDimensions(projectId: string): Promise<Dimension[]> | Dimension[];
  listDimensionEvaluations(
    dimensionId: string,
  ): Promise<DimensionEvaluation[]> | DimensionEvaluation[];
};

type CreateCoordinatorOptions = {
  activeTaskThreshold?: number;
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

const buildPrompt = ({
  activeTasks,
  dimensions,
  evaluations,
  project,
  threshold,
}: {
  activeTasks: Task[];
  dimensions: Dimension[];
  evaluations: Array<{ dimension: Dimension; evaluation: DimensionEvaluation }>;
  project: CoordinatorProject;
  threshold: number;
}) => {
  const evaluationSummary = evaluations
    .map(
      ({ dimension, evaluation }) =>
        `- ${dimension.name} (${dimension.id}) score ${evaluation.score} at ${evaluation.created_at}: ${evaluation.evaluation}`,
    )
    .join("\n");
  const poolSummary = activeTasks
    .map((task) => `- ${task.title} (${task.task_id}) status ${task.status}`)
    .join("\n");

  return `You are the AIM Coordinator for project_id "${project.id}".

Maintain the Active Task Pool for this single project only. The current threshold is ${threshold}. Active Task Pool: ${activeTasks.length} unfinished Tasks.

Analyze the latest dimension_evaluations and current Active Task Pool, then append Tasks through the AIM API only when the pool needs more actionable work. Do not operate on other projects and do not run an Issue Reducer.

Dimensions:
${dimensions.map((dimension) => `- ${dimension.name} (${dimension.id}): ${dimension.goal}`).join("\n") || "- none"}

Latest dimension_evaluations:
${evaluationSummary || "- none"}

Current Active Task Pool:
${poolSummary || "- none"}`;
};

export const createCoordinator = (
  projectId: string,
  options: CreateCoordinatorOptions,
): AsyncDisposable => {
  const stack = new AsyncDisposableStack();
  const abortController = new AbortController();
  const threshold = options.activeTaskThreshold ?? defaultActiveTaskThreshold;
  const heartbeatMs = options.heartbeatMs ?? defaultHeartbeatMs;
  let activeSession: ManagedSession | null = null;

  const scanOnce = async () => {
    const project = await options.taskRepository.getProjectById(projectId);
    if (!project) {
      return;
    }

    const activeTasks = (
      await options.taskRepository.listUnfinishedTasks()
    ).filter((task) => task.project_id === projectId);
    if (activeTasks.length >= threshold || activeSession) {
      return;
    }

    const dimensions =
      await options.dimensionRepository.listDimensions(projectId);
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

    activeSession = await options.sessionManager.createSession({
      directory,
      model: {
        modelID: project.global_model_id,
        providerID: project.global_provider_id,
      },
      prompt: buildPrompt({
        activeTasks,
        dimensions,
        evaluations,
        project,
        threshold,
      }),
      title: `AIM Coordinator task-pool session (${project.id})`,
    });
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
