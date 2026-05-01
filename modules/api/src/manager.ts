import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";

import type { Project } from "@aim-ai/contract";

import type { ApiLogger } from "./api-logger.js";
import { cancelableSleep } from "./cancelable-sleep.js";
import { execGh, execGit } from "./exec-file.js";
import type {
  ManagerState,
  ManagerStateInput,
} from "./manager-state-repository.js";
import type { OpenCodeSessionManager } from "./opencode-session-manager.js";
import type { OptimizerLaneEventInput } from "./optimizer-lane-events.js";
import { ensureProjectWorkspace } from "./project-workspace.js";

const heartbeatIntervalMs = 10_000;
const maxRecentCommitEvidenceChars = 4_000;
const maxRecentCommitEvidenceLines = 100;
const maxRecentCommitReadErrorChars = 600;
const maxRulesetDetailQueries = 5;
const dependencyEvidenceLimit = 12;
const dependencyRiskSummaryMaxLength = 3_000;
const dependencyAuditTimeoutMs = 15_000;
const lockfileNames = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

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

const normalizeGhApiTarget = (value: string) => {
  const trimmed = value.trim();

  if (trimmed.startsWith("https://api.github.com/")) {
    return trimmed.slice("https://api.github.com/".length);
  }

  return trimmed.startsWith("repos/") ? trimmed : null;
};

const readRulesetDetailTarget = (
  nameWithOwner: string,
  ruleset: Record<string, unknown>,
) => {
  const id = ruleset.id;

  if (typeof id === "number" || typeof id === "string") {
    const normalizedId = String(id).trim();

    if (normalizedId.length > 0) {
      return `repos/${nameWithOwner}/rulesets/${normalizedId}`;
    }
  }

  for (const key of ["url", "self_url"] as const) {
    const target = readStringProperty(ruleset, key);
    const normalized = target ? normalizeGhApiTarget(target) : null;

    if (normalized) {
      return normalized;
    }
  }

  const links = asRecord(ruleset._links) ?? asRecord(ruleset.links);
  const selfLink = asRecord(links?.self);
  const selfHref = readStringProperty(selfLink, "href");

  return selfHref ? normalizeGhApiTarget(selfHref) : null;
};

const formatStrictPolicy = (value: unknown): string | null => {
  if (typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  const record = asRecord(value);

  if (!record) {
    return null;
  }

  if (typeof record.enabled === "boolean") {
    return String(record.enabled);
  }

  if (typeof record.strict === "boolean") {
    return String(record.strict);
  }

  return null;
};

const readCheckContext = (value: unknown) => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  const record = asRecord(value);

  return (
    readStringProperty(record, "context") ??
    readStringProperty(record, "name") ??
    readStringProperty(record, "check_name")
  );
};

const collectRequiredStatusChecks = (value: unknown) => {
  const contexts: string[] = [];

  const collect = (candidate: unknown) => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const context = readCheckContext(item);

        if (context) {
          contexts.push(context);
        }
      }
    }
  };

  const parameters = asRecord(value);
  const requiredStatusChecks = parameters?.required_status_checks;
  const nestedRequiredStatusChecks = asRecord(requiredStatusChecks);

  collect(requiredStatusChecks);
  collect(parameters?.contexts);
  collect(parameters?.checks);
  collect(nestedRequiredStatusChecks?.contexts);
  collect(nestedRequiredStatusChecks?.checks);
  collect(nestedRequiredStatusChecks?.required_status_checks);

  return [...new Set(contexts)].sort();
};

const readRulesetRequiredChecks = (output: string) => {
  const ruleset = asRecord(parseJson(output));
  const rules = Array.isArray(ruleset?.rules) ? ruleset.rules : [];
  const contexts: string[] = [];
  let strict: string | null = null;

  for (const rule of rules) {
    const record = asRecord(rule);

    if (readStringProperty(record, "type") !== "required_status_checks") {
      continue;
    }

    const parameters = asRecord(record?.parameters);
    contexts.push(...collectRequiredStatusChecks(parameters));
    strict ??=
      formatStrictPolicy(parameters?.strict_required_status_checks_policy) ??
      formatStrictPolicy(parameters?.strict) ??
      formatStrictPolicy(
        asRecord(parameters?.required_status_checks)
          ?.strict_required_status_checks_policy,
      ) ??
      formatStrictPolicy(asRecord(parameters?.required_status_checks)?.strict);
  }

  return { contexts: [...new Set(contexts)].sort(), strict };
};

const summarizeRulesets = async (
  output: string,
  nameWithOwner: string,
  readRulesetDetail: (target: string) => Promise<string>,
) => {
  const rulesets = parseJson(output);
  const detailLimits: string[] = [];
  let detailQueries = 0;
  const summaries: string[] = [];

  if (Array.isArray(rulesets)) {
    for (const ruleset of rulesets) {
      const record = asRecord(ruleset);
      const name = readStringProperty(record, "name");
      const enforcement = readStringProperty(record, "enforcement");

      if (!name) {
        continue;
      }

      const attributes = enforcement ? [enforcement] : [];

      if (enforcement === "active") {
        const target = readRulesetDetailTarget(nameWithOwner, record ?? {});

        if (!target) {
          detailLimits.push(
            `Evidence limit: branch ruleset detail evidence unavailable for ${name}: no detail target reported.`,
          );
        } else if (detailQueries >= maxRulesetDetailQueries) {
          detailLimits.push(
            `Evidence limit: branch ruleset detail evidence unavailable for ${name}: bounded to ${maxRulesetDetailQueries} active ruleset detail queries.`,
          );
        } else {
          detailQueries += 1;

          try {
            const detail = readRulesetRequiredChecks(
              await readRulesetDetail(target),
            );

            if (detail.contexts.length > 0) {
              attributes.push(`required checks: ${detail.contexts.join("; ")}`);
            }

            if (detail.strict) {
              attributes.push(`strict: ${detail.strict}`);
            }
          } catch (err) {
            detailLimits.push(
              `Evidence limit: branch ruleset detail evidence unavailable for ${name}: ${errorMessage(err)}.`,
            );
          }
        }
      }

      summaries.push(
        attributes.length > 0 ? `${name} (${attributes.join("; ")})` : name,
      );
    }
  }

  const summary =
    summaries.length > 0
      ? `Branch rulesets: ${summaries.join("; ")}.`
      : "Evidence limit: gh reported no branch rulesets.";

  return [summary, ...detailLimits].join("\n");
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
        await summarizeRulesets(
          await gh(projectDirectory, [
            "api",
            `repos/${nameWithOwner}/rulesets?targets=branch`,
          ]),
          nameWithOwner,
          (target) => gh(projectDirectory, ["api", target]),
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

const truncate = (value: string, maxLength: number) =>
  value.length > maxLength
    ? `${value.slice(0, maxLength)}... [truncated]`
    : value;

const recentCommitNameStatusEvidence = async (
  projectDirectory: string,
  commitSha: string,
) => {
  const command = `git show --name-status --format= --no-renames --max-count=1 ${commitSha}`;

  try {
    const output = await git(projectDirectory, [
      "show",
      "--name-status",
      "--format=",
      "--no-renames",
      "--max-count=1",
      commitSha,
    ]);
    const lines = output.split("\n").filter(Boolean);
    const displayedLines = lines.slice(0, maxRecentCommitEvidenceLines);
    const touchedFiles = truncate(
      displayedLines.join("\n") || "(no touched files reported by git show)",
      maxRecentCommitEvidenceChars,
    );
    const limit =
      lines.length > displayedLines.length
        ? `\nEvidence is bounded to the first ${maxRecentCommitEvidenceLines} name-status lines; ${lines.length - displayedLines.length} additional line(s) omitted.`
        : "";

    return `Latest origin/main commit name-status touched-file evidence from ${command}:\n${touchedFiles}${limit}\nUse this evidence when evaluating dimensions about recent commit file complexity, and cite this source or any stated limitation in relevant dimension_evaluations.`;
  } catch (err) {
    return `Latest origin/main commit name-status touched-file evidence from ${command}:\nRecent commit name-status evidence could not be read; evidence limitation: ${truncate(errorMessage(err), maxRecentCommitReadErrorChars)}.\nUse this evidence limitation when evaluating dimensions about recent commit file complexity.`;
  }
};

const readTrackedFiles = async (projectDirectory: string) => {
  const output = await git(projectDirectory, ["ls-files"]);

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
};

const summarizeManifest = async (
  projectDirectory: string,
  relativePath: string,
) => {
  const content = await readFile(join(projectDirectory, relativePath), "utf8");
  const manifest = JSON.parse(content) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    name?: string;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };

  return `- ${relativePath}: ${manifest.name ?? "unnamed package"}; dependencies ${Object.keys(manifest.dependencies ?? {}).length}; devDependencies ${Object.keys(manifest.devDependencies ?? {}).length}; peerDependencies ${Object.keys(manifest.peerDependencies ?? {}).length}; optionalDependencies ${Object.keys(manifest.optionalDependencies ?? {}).length}`;
};

const summarizeLockfile = async (
  projectDirectory: string,
  relativePath: string,
) => {
  const fileStat = await stat(join(projectDirectory, relativePath));

  return `- ${relativePath}: present; ${fileStat.size} bytes`;
};

const runDependencyAudit = (projectDirectory: string) =>
  new Promise<{ output: string; unavailable: null | string }>((resolve) => {
    execFile(
      "pnpm",
      ["audit", "--json", "--prod"],
      {
        cwd: projectDirectory,
        encoding: "utf8",
        timeout: dependencyAuditTimeoutMs,
      },
      (error, stdout, stderr) => {
        const output = String(stdout ?? "").trim();
        if (output) {
          resolve({ output, unavailable: null });
          return;
        }

        if (error) {
          resolve({
            output: "",
            unavailable: truncate(
              `${errorMessage(error)}${stderr ? `; stderr: ${String(stderr).trim()}` : ""}`,
              dependencyRiskSummaryMaxLength,
            ),
          });
          return;
        }

        resolve({
          output:
            "No production dependency vulnerabilities reported by pnpm audit.",
          unavailable: null,
        });
      },
    );
  });

const dependencyEvidencePrompt = async (projectDirectory: string) => {
  const evidenceLimits: string[] = [];
  let trackedFiles: string[] = [];

  try {
    trackedFiles = await readTrackedFiles(projectDirectory);
  } catch (err) {
    evidenceLimits.push(
      `Evidence limit: tracked dependency files unavailable: ${errorMessage(err)}.`,
    );
  }

  const manifestPaths = trackedFiles
    .filter((path) => basename(path) === "package.json")
    .slice(0, dependencyEvidenceLimit);
  const lockfilePaths = trackedFiles
    .filter((path) => lockfileNames.has(basename(path)))
    .slice(0, dependencyEvidenceLimit);

  const manifestSummaries: string[] = [];
  for (const manifestPath of manifestPaths) {
    try {
      manifestSummaries.push(
        await summarizeManifest(projectDirectory, manifestPath),
      );
    } catch (err) {
      evidenceLimits.push(
        `Evidence limit: package manifest ${manifestPath} unavailable: ${errorMessage(err)}.`,
      );
    }
  }
  if (trackedFiles.length > 0 && manifestSummaries.length === 0) {
    evidenceLimits.push(
      "Evidence limit: no tracked package manifests were found.",
    );
  }

  const lockfileSummaries: string[] = [];
  for (const lockfilePath of lockfilePaths) {
    try {
      lockfileSummaries.push(
        await summarizeLockfile(projectDirectory, lockfilePath),
      );
    } catch (err) {
      evidenceLimits.push(
        `Evidence limit: lockfile ${lockfilePath} state unavailable: ${errorMessage(err)}.`,
      );
    }
  }
  if (trackedFiles.length > 0 && lockfileSummaries.length === 0) {
    evidenceLimits.push("Evidence limit: no tracked lockfile was found.");
  }

  const audit = await runDependencyAudit(projectDirectory);
  if (audit.unavailable) {
    evidenceLimits.push(
      `Evidence limit: dependency risk summary unavailable: ${audit.unavailable}.`,
    );
  }

  const manifestSection = manifestSummaries.length
    ? manifestSummaries.join("\n")
    : "- Evidence limit: package manifests unavailable.";
  const lockfileSection = lockfileSummaries.length
    ? lockfileSummaries.join("\n")
    : "- Evidence limit: lockfile state unavailable.";
  const riskSection = audit.output
    ? truncate(audit.output, dependencyRiskSummaryMaxLength)
    : "Evidence limit: dependency risk summary unavailable.";
  const limitSection = evidenceLimits.length
    ? evidenceLimits.map((limit) => `- ${limit}`).join("\n")
    : "- No dependency evidence limits recorded.";

  return `Dependency evidence:
- package manifests:
${manifestSection}
- lockfile state:
${lockfileSection}
- dependency risk summary:
${riskSection}
- evidence limits:
${limitSection}

Use this read-only dependency evidence when evaluating dependency health. If evidence is missing or partial, state the Evidence limit and confidence limit; dependency evidence collection did not block evaluation.`;
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
  recentCommitEvidence: string,
  dependencyEvidence: string,
) => `${projectScopedPrompt(managerPrompt, project)}

Current baseline commit: "${commitSha}".
${recentCommitEvidence}
Evaluate only these dimension_id values for this baseline commit: ${quoteDimensionIds(dimensionIds)}.
Do not evaluate dimensions outside that explicit list.

${ciGateEvidence}

${dependencyEvidence}`;

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
  let loopPromise: Promise<void> | null = null;
  const sleepAbortController = new AbortController();

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
    const recentCommitEvidence = await recentCommitNameStatusEvidence(
      projectDirectory,
      commitSha,
    );
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
    const dependencyEvidence = await dependencyEvidencePrompt(projectDirectory);
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
          recentCommitEvidence,
          dependencyEvidence,
        ),
        projectId: project.id,
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
    sleepAbortController.abort();
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
        await cancelableSleep(heartbeatIntervalMs, {
          signal: sleepAbortController.signal,
        }).catch(() => undefined);
      }
    }
  })().finally(() => {
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
