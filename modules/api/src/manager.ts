import { execFile } from "node:child_process";

import type { Project } from "@aim-ai/contract";

import type { AgentSessionCoordinator } from "./agent-session-coordinator.js";
import type { ApiLogger } from "./api-logger.js";
import { ensureProjectWorkspace } from "./project-workspace.js";

const heartbeatIntervalMs = 10_000;

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

type ManagerProject = Pick<
  Project,
  "git_origin_url" | "global_model_id" | "global_provider_id" | "id"
>;

type CreateManagerOptions = {
  coordinator: AgentSessionCoordinator;
  dimensionRepository: DimensionRepository;
  logger?: ApiLogger;
  project: ManagerProject;
};

type ManagerStatus = {
  last_error: null | string;
  last_scan_at: null | string;
  running: boolean;
};

export type Manager = AsyncDisposable & {
  getStatus(): ManagerStatus;
};

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

const quoteDimensionIds = (dimensionIds: string[]) =>
  dimensionIds.map((dimensionId) => `"${dimensionId}"`).join(", ");

const evaluationKey = (commitSha: string, dimensionIds: string[]) =>
  `${commitSha}:${[...dimensionIds].sort().join("\0")}`;

const projectScopedPrompt = (
  prompt: string,
  project: ManagerProject,
) => `${prompt}

Project scope: project_id "${project.id}". Only act on this configured Project and its workspace; do not infer or use an implicit first project.`;

const evaluationPrompt = (
  project: ManagerProject,
  commitSha: string,
  dimensionIds: string[],
) => `${projectScopedPrompt(managerPrompt, project)}

Current baseline commit: "${commitSha}".
Evaluate only these dimension_id values for this baseline commit: ${quoteDimensionIds(dimensionIds)}.
Do not evaluate dimensions outside that explicit list.`;

export const createManager = ({
  coordinator,
  dimensionRepository,
  logger,
  project,
}: CreateManagerOptions): Manager => {
  const stack = new AsyncDisposableStack();
  const sessions = new AsyncDisposableStack();
  stack.use(sessions);

  let disposed = false;
  let running = true;
  let lastError: null | string = null;
  let lastScanAt: null | string = null;
  let activeEvaluationKey: null | string = null;
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

    if (dimensionIds.length === 0) {
      activeEvaluationKey = null;
      logger?.info(
        {
          commit_sha: commitSha,
          event: "manager_idle",
          project_id: project.id,
          reason: "no_missing_evaluations",
        },
        "Manager heartbeat idle",
      );
      return;
    }

    const missingEvaluationKey = evaluationKey(commitSha, dimensionIds);
    if (activeEvaluationKey === missingEvaluationKey) {
      logger?.info(
        {
          commit_sha: commitSha,
          dimension_ids: dimensionIds,
          event: "manager_idle",
          project_id: project.id,
          reason: "evaluation_already_in_progress",
        },
        "Manager heartbeat idle",
      );
      return;
    }

    logger?.info(
      {
        commit_sha: commitSha,
        dimension_ids: dimensionIds,
        event: "manager_missing_evaluations_found",
        project_id: project.id,
      },
      "Manager missing evaluations found",
    );
    activeEvaluationKey = missingEvaluationKey;
    logger?.info(
      { event: "manager_session_started", project_id: project.id },
      "Manager session started",
    );

    try {
      const session = await coordinator.createSession({
        modelId: project.global_model_id,
        projectDirectory,
        prompt: evaluationPrompt(project, commitSha, dimensionIds),
        providerId: project.global_provider_id,
        title: `AIM Manager evaluation (${project.id})`,
      });
      sessions.use(session);
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
    } catch (err) {
      if (activeEvaluationKey === missingEvaluationKey) {
        activeEvaluationKey = null;
      }
      logger?.error(
        { err, event: "manager_session_failed", project_id: project.id },
        "Manager session failed",
      );
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
      await stack[Symbol.asyncDispose]();
    },
    getStatus() {
      return { last_error: lastError, last_scan_at: lastScanAt, running };
    },
  };
};
