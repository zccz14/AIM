import type { Project } from "@aim-ai/contract";

import type { ApiLogger } from "./api-logger.js";
import { execGit } from "./exec-file.js";
import type {
  ManagerState,
  ManagerStateInput,
} from "./manager-state-repository.js";
import type { OpenCodeSessionManager } from "./opencode-session-manager.js";
import type { OptimizerLaneEventInput } from "./optimizer-lane-events.js";
import { ensureProjectWorkspace } from "./project-workspace.js";

const heartbeatIntervalMs = 10_000;
const latestCommitTouchedFileLimit = 50;
const latestCommitTouchedFileSource =
  "git log -1 --name-status --format=%H origin/main";

const managerPrompt = `FOLLOW the aim-manager-guide SKILL.

Maintain AIM evaluation dimensions and evaluations by reading the latest origin/main baseline, README goals, current dimensions, evaluations, Task Pool, and rejected Tasks through AIM API Server.

Before every dimension_evaluations append, apply the README claim-to-evidence protocol: classify key README claims as aligned, readme_ahead, baseline_ahead, conflicted, ambiguous, or prerequisite_gap; include an evidence source or limit, confidence limit, and Coordinator handoff implication for each claim that materially affects the dimension.

Write results back through AIM API Server only: create or update dimensions/evaluations using the available AIM API contracts; append dimension_evaluations only for Manager findings. Do not create Developer Tasks from this Manager lane.`;

type DimensionRepository = {
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

type ManagerProject = Pick<
  Project,
  "git_origin_url" | "global_model_id" | "global_provider_id" | "id"
>;

type CreateManagerOptions = {
  dimensionRepository: DimensionRepository;
  logger?: ApiLogger;
  managerStateRepository: ManagerStateRepository;
  onLaneEvent?: (event: OptimizerLaneEventInput) => void;
  project: ManagerProject;
  sessionManager: Pick<OpenCodeSessionManager, "createSession">;
};

type ManagerStatus = {
  last_error: null | string;
  last_scan_at: null | string;
  running: boolean;
};

export type Manager = AsyncDisposable & {
  getStatus(): ManagerStatus;
};

const git = async (projectDirectory: string, args: string[]) =>
  (await execGit(projectDirectory, args, { target: projectDirectory })).trim();

const quoteDimensionIds = (dimensionIds: string[]) =>
  dimensionIds.map((dimensionId) => `"${dimensionId}"`).join(", ");

const canonicalDimensionIds = (dimensionIds: string[]) =>
  [...new Set(dimensionIds)].sort();

const dimensionIdsJson = (dimensionIds: string[]) =>
  JSON.stringify(canonicalDimensionIds(dimensionIds));

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

const projectScopedPrompt = (
  prompt: string,
  project: ManagerProject,
) => `${prompt}

Project scope: project_id "${project.id}". Only act on this configured Project and its workspace; do not infer or use an implicit first project.`;

const evaluationPrompt = (
  project: ManagerProject,
  commitSha: string,
  dimensionIds: string[],
  latestCommitTouchedFileEvidence: string,
) => `${projectScopedPrompt(managerPrompt, project)}

Current baseline commit: "${commitSha}".
Evaluate only these dimension_id values for this baseline commit: ${quoteDimensionIds(dimensionIds)}.
Do not evaluate dimensions outside that explicit list.

${latestCommitTouchedFileEvidence}`;

const latestCommitTouchedFileEvidence = async (projectDirectory: string) => {
  try {
    const output = await git(projectDirectory, [
      "log",
      "-1",
      "--name-status",
      "--format=%H",
      "origin/main",
    ]);
    const [commitSha, ...fileLines] = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const includedFileLines = fileLines.slice(0, latestCommitTouchedFileLimit);
    const truncatedCount = fileLines.length - includedFileLines.length;
    const fileSummary =
      includedFileLines.length === 0
        ? "(no touched files reported)"
        : includedFileLines.join("\n");
    const truncationSummary =
      truncatedCount > 0
        ? `\n(truncated ${truncatedCount} additional touched file${truncatedCount === 1 ? "" : "s"}; limit ${latestCommitTouchedFileLimit})`
        : "";

    return `Latest origin/main commit touched-file evidence from \`${latestCommitTouchedFileSource}\`:
commit ${commitSha || "unknown"}
${fileSummary}${truncationSummary}
State this evidence source, or state the evidence limit if it is unavailable or truncated.`;
  } catch (err) {
    return `Latest origin/main commit touched-file evidence from \`${latestCommitTouchedFileSource}\` is unavailable. Evidence limit: ${errorMessage(err)}. State this evidence limit instead of inferring touched files.`;
  }
};

export const createManager = ({
  dimensionRepository,
  logger,
  managerStateRepository,
  onLaneEvent,
  project,
  sessionManager,
}: CreateManagerOptions): Manager => {
  const stack = new AsyncDisposableStack();
  const sessions = new AsyncDisposableStack();
  stack.use(sessions);

  let disposed = false;
  let disposePromise: Promise<void> | null = null;
  let running = true;
  let lastError: null | string = null;
  let lastScanAt: null | string = null;
  let sleepTimer: NodeJS.Timeout | undefined;
  let wakeSleep: (() => void) | undefined;
  let loopPromise: Promise<void> | null = null;

  const sleep = () =>
    new Promise<void>((resolve) => {
      sleepTimer = setTimeout(() => {
        sleepTimer = undefined;
        wakeSleep = undefined;
        resolve();
      }, heartbeatIntervalMs);
      wakeSleep = () => {
        if (sleepTimer) {
          clearTimeout(sleepTimer);
          sleepTimer = undefined;
        }
        wakeSleep = undefined;
        resolve();
      };
    });

  const heartbeat = async () => {
    onLaneEvent?.({
      event: "start",
      lane_name: "manager",
      project_id: project.id,
      summary: "Manager lane started a heartbeat scan.",
    });
    logger?.info(
      { event: "manager_heartbeat_started", project_id: project.id },
      "Manager heartbeat started",
    );
    logger?.info(
      { event: "manager_workspace_ensure_started", project_id: project.id },
      "Manager workspace ensure started",
    );
    const projectDirectory = await ensureProjectWorkspace({
      git_origin_url: project.git_origin_url,
      project_id: project.id,
    });

    await git(projectDirectory, ["fetch", "origin", "main"]);
    await git(projectDirectory, ["checkout", "origin/main"]);
    const commitSha = await git(projectDirectory, ["rev-parse", "origin/main"]);
    logger?.info(
      {
        commit_sha: commitSha,
        event: "manager_workspace_synced",
        project_directory: projectDirectory,
        project_id: project.id,
      },
      "Manager workspace synced",
    );

    const dimensionIds = await dimensionRepository.listUnevaluatedDimensionIds(
      project.id,
      commitSha,
    );
    const canonicalMissingDimensionIds = canonicalDimensionIds(dimensionIds);

    if (canonicalMissingDimensionIds.length === 0) {
      managerStateRepository.clearManagerState(project.id);
      logger?.info(
        {
          commit_sha: commitSha,
          event: "manager_idle",
          project_id: project.id,
          reason: "no_missing_evaluations",
        },
        "Manager heartbeat idle",
      );
      onLaneEvent?.({
        event: "idle",
        lane_name: "manager",
        project_id: project.id,
        summary:
          "Manager lane idle: no missing evaluations for current baseline.",
      });
      return;
    }

    const missingDimensionIdsJson = dimensionIdsJson(dimensionIds);
    const persistedState = managerStateRepository.getManagerState(project.id);
    if (
      persistedState?.state === "evaluating" &&
      persistedState.commit_sha === commitSha &&
      persistedState.dimension_ids_json === missingDimensionIdsJson
    ) {
      logger?.info(
        {
          commit_sha: commitSha,
          dimension_ids: canonicalMissingDimensionIds,
          event: "manager_idle",
          project_id: project.id,
          reason: "evaluation_already_in_progress",
        },
        "Manager heartbeat idle",
      );
      onLaneEvent?.({
        event: "idle",
        lane_name: "manager",
        project_id: project.id,
        summary:
          "Manager lane idle: matching evaluation session already in progress.",
      });
      return;
    }

    logger?.info(
      {
        commit_sha: commitSha,
        dimension_ids: canonicalMissingDimensionIds,
        event: "manager_missing_evaluations_found",
        project_id: project.id,
      },
      "Manager missing evaluations found",
    );
    managerStateRepository.upsertManagerState({
      commit_sha: commitSha,
      dimension_ids_json: missingDimensionIdsJson,
      last_error: null,
      project_id: project.id,
      session_id: null,
      state: "evaluating",
    });
    logger?.info(
      { event: "manager_session_started", project_id: project.id },
      "Manager session started",
    );
    onLaneEvent?.({
      event: "start",
      lane_name: "manager",
      project_id: project.id,
      summary: `Manager lane started evaluation for ${canonicalMissingDimensionIds.length} dimension${canonicalMissingDimensionIds.length === 1 ? "" : "s"}.`,
    });

    try {
      const session = await sessionManager.createSession({
        directory: projectDirectory,
        model: {
          modelID: project.global_model_id,
          providerID: project.global_provider_id,
        },
        prompt: evaluationPrompt(
          project,
          commitSha,
          canonicalMissingDimensionIds,
          await latestCommitTouchedFileEvidence(projectDirectory),
        ),
        title: `AIM Manager evaluation (${project.id})`,
      });
      sessions.use(session);
      managerStateRepository.upsertManagerState({
        commit_sha: commitSha,
        dimension_ids_json: missingDimensionIdsJson,
        last_error: null,
        project_id: project.id,
        session_id: session.sessionId,
        state: "evaluating",
      });
      logger?.info(
        {
          event: "manager_session_created",
          project_id: project.id,
          session_id: session.sessionId,
        },
        "Manager session created",
      );
      logger?.info(
        {
          event: "manager_session_succeeded",
          project_id: project.id,
          session_id: session.sessionId,
        },
        "Manager session succeeded",
      );
      onLaneEvent?.({
        event: "success",
        lane_name: "manager",
        project_id: project.id,
        session_id: session.sessionId,
        summary: `Manager lane created evaluation session ${session.sessionId}.`,
      });
    } catch (err) {
      managerStateRepository.upsertManagerState({
        commit_sha: commitSha,
        dimension_ids_json: missingDimensionIdsJson,
        last_error: errorMessage(err),
        project_id: project.id,
        session_id: null,
        state: "failed",
      });
      logger?.error(
        { err, event: "manager_session_failed", project_id: project.id },
        "Manager session failed",
      );
      onLaneEvent?.({
        event: "failure",
        lane_name: "manager",
        project_id: project.id,
        summary: `Manager lane failed: ${errorMessage(err)}. Check manager session setup and retry after clearing the lane blocker.`,
      });
      throw err;
    }
  };

  const runHeartbeat = async () => {
    try {
      await heartbeat();
      lastError = null;
      lastScanAt = new Date().toISOString();
      logger?.info(
        {
          event: "manager_heartbeat_succeeded",
          last_scan_at: lastScanAt,
          next_scan_after_ms: heartbeatIntervalMs,
          project_id: project.id,
        },
        "Manager heartbeat succeeded",
      );
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      logger?.error(
        { err, event: "manager_heartbeat_failed", project_id: project.id },
        "Manager heartbeat failed",
      );
    }
  };

  stack.defer(async () => {
    disposed = true;
    wakeSleep?.();
    await loopPromise;
    running = false;
    logger?.info(
      { event: "manager_disposed", project_id: project.id },
      "Manager disposed",
    );
  });

  logger?.info(
    {
      event: "manager_started",
      interval_ms: heartbeatIntervalMs,
      project_id: project.id,
    },
    "Manager started",
  );
  loopPromise = (async () => {
    while (!disposed) {
      await runHeartbeat();

      if (!disposed) {
        await sleep();
      }
    }
  })().finally(() => {
    if (sleepTimer) {
      clearTimeout(sleepTimer);
      sleepTimer = undefined;
    }
    wakeSleep = undefined;
    running = false;
  });

  return {
    async [Symbol.asyncDispose]() {
      disposePromise ??= stack[Symbol.asyncDispose]();
      await disposePromise;
    },
    getStatus() {
      return { last_error: lastError, last_scan_at: lastScanAt, running };
    },
  };
};
