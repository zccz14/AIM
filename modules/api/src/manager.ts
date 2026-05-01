import type { Project } from "@aim-ai/contract";

import type { ApiLogger } from "./api-logger.js";
import { execGh, execGit } from "./exec-file.js";
import type {
  ManagerState,
  ManagerStateInput,
} from "./manager-state-repository.js";
import type { OpenCodeSessionManager } from "./opencode-session-manager.js";
import type { OptimizerLaneEventInput } from "./optimizer-lane-events.js";
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

const gh = async (projectDirectory: string, args: string[]) =>
  (
    await execGh(args, { cwd: projectDirectory, target: projectDirectory })
  ).trim();

const quoteDimensionIds = (dimensionIds: string[]) =>
  dimensionIds.map((dimensionId) => `"${dimensionId}"`).join(", ");

const canonicalDimensionIds = (dimensionIds: string[]) =>
  [...new Set(dimensionIds)].sort();

const dimensionIdsJson = (dimensionIds: string[]) =>
  JSON.stringify(canonicalDimensionIds(dimensionIds));

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const parseJson = (value: string): unknown => JSON.parse(value) as unknown;

const readStringProperty = (
  value: Record<string, unknown> | null,
  key: string,
) => {
  const property = value?.[key];

  return typeof property === "string" && property.trim().length > 0
    ? property.trim()
    : null;
};

const summarizeWorkflows = (output: string) => {
  const workflows = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, state] = line.split("\t");
      const cleanName = name?.trim();
      const cleanState = state?.trim();

      if (!cleanName) {
        return null;
      }

      return cleanState ? `${cleanName} (${cleanState})` : cleanName;
    })
    .filter((workflow): workflow is string => workflow !== null);

  return workflows.length > 0
    ? `GitHub Actions workflows: ${workflows.join("; ")}.`
    : "Evidence limit: no GitHub Actions workflows were reported by gh.";
};

const summarizeRequiredChecks = (output: string) => {
  const protection = asRecord(parseJson(output));
  const statusChecks = asRecord(protection?.required_status_checks);
  const checks = Array.isArray(statusChecks?.checks)
    ? statusChecks.checks
        .map((check) => readStringProperty(asRecord(check), "context"))
        .filter((check): check is string => check !== null)
    : [];
  const contexts = Array.isArray(statusChecks?.contexts)
    ? statusChecks.contexts.filter(
        (context): context is string => typeof context === "string",
      )
    : [];
  const requiredChecks = [...new Set([...checks, ...contexts])].sort();

  return requiredChecks.length > 0
    ? `Required checks: ${requiredChecks.join("; ")}.`
    : "Evidence limit: branch protection did not report required checks.";
};

const summarizeRulesets = (output: string) => {
  const rulesets = parseJson(output);
  const summaries = Array.isArray(rulesets)
    ? rulesets
        .map((ruleset) => {
          const record = asRecord(ruleset);
          const name = readStringProperty(record, "name");
          const enforcement = readStringProperty(record, "enforcement");

          if (!name) {
            return null;
          }

          return enforcement ? `${name} (${enforcement})` : name;
        })
        .filter((ruleset): ruleset is string => ruleset !== null)
    : [];

  return summaries.length > 0
    ? `Branch rulesets: ${summaries.join("; ")}.`
    : "Evidence limit: gh reported no branch rulesets.";
};

const collectCiGateEvidence = async (projectDirectory: string) => {
  try {
    const repoOutput = await gh(projectDirectory, [
      "repo",
      "view",
      "--json",
      "nameWithOwner,defaultBranchRef",
    ]);
    const repo = asRecord(parseJson(repoOutput));
    const nameWithOwner = readStringProperty(repo, "nameWithOwner");
    const defaultBranchRef = asRecord(repo?.defaultBranchRef);
    const defaultBranch =
      readStringProperty(defaultBranchRef, "name") ?? "main";

    if (!nameWithOwner) {
      return `CI gate evidence for current baseline:\nEvidence limit: GitHub CI gate evidence unavailable: gh repo view did not return nameWithOwner.\nRecord this evidence limit instead of assuming live GitHub Actions, required checks, branch protection, or ruleset state.`;
    }

    const lines = [
      "CI gate evidence for current baseline:",
      `GitHub repository: "${nameWithOwner}".`,
      `Default branch: "${defaultBranch}".`,
    ];

    try {
      lines.push(
        summarizeWorkflows(
          await gh(projectDirectory, [
            "workflow",
            "list",
            "--repo",
            nameWithOwner,
          ]),
        ),
      );
    } catch (err) {
      lines.push(
        `Evidence limit: GitHub Actions workflow evidence unavailable: ${errorMessage(err)}.`,
      );
    }

    try {
      lines.push(
        summarizeRequiredChecks(
          await gh(projectDirectory, [
            "api",
            `repos/${nameWithOwner}/branches/${defaultBranch}/protection`,
          ]),
        ),
      );
    } catch (err) {
      lines.push(
        `Evidence limit: branch protection or required checks evidence unavailable: ${errorMessage(err)}.`,
      );
    }

    try {
      lines.push(
        summarizeRulesets(
          await gh(projectDirectory, [
            "api",
            `repos/${nameWithOwner}/rulesets?targets=branch`,
          ]),
        ),
      );
    } catch (err) {
      lines.push(
        `Evidence limit: branch ruleset evidence unavailable: ${errorMessage(err)}.`,
      );
    }

    lines.push(
      "Use this read-only GitHub gate evidence when evaluating CI and validation reliability dimensions.",
    );

    return lines.join("\n");
  } catch (err) {
    return `CI gate evidence for current baseline:\nEvidence limit: GitHub CI gate evidence unavailable: ${errorMessage(err)}.\nRecord this evidence limit instead of assuming live GitHub Actions, required checks, branch protection, or ruleset state.`;
  }
};

const projectScopedPrompt = (
  prompt: string,
  project: ManagerProject,
) => `${prompt}

Project scope: project_id "${project.id}". Only act on this configured Project and its workspace; do not infer or use an implicit first project.`;

const evaluationPrompt = (
  project: ManagerProject,
  commitSha: string,
  dimensionIds: string[],
  ciGateEvidence: string,
) => `${projectScopedPrompt(managerPrompt, project)}

Current baseline commit: "${commitSha}".
Evaluate only these dimension_id values for this baseline commit: ${quoteDimensionIds(dimensionIds)}.
Do not evaluate dimensions outside that explicit list.

${ciGateEvidence}`;

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
    const ciGateEvidence = await collectCiGateEvidence(projectDirectory);
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
          ciGateEvidence,
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
