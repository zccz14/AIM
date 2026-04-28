import {
  createTaskBatchRequestSchema,
  createTaskRequestSchema,
  type DimensionEvaluation,
  type OpenCodeSession,
  type ParsedCreateTaskBatchRequest,
  patchTaskRequestSchema,
  type Task,
  type TaskPullRequestStatusResponse,
  type TaskStatus,
  taskByIdPath,
  taskDependenciesPath,
  taskDependenciesRequestSchema,
  taskErrorSchema,
  taskPullRequestStatusPath,
  taskPullRequestStatusResponseSchema,
  taskPullRequestUrlPath,
  taskPullRequestUrlRequestSchema,
  taskRejectPath,
  taskResolvePath,
  taskResultRequestSchema,
  taskSpecPath,
  taskStatusSchema,
  tasksBatchPath,
  tasksPath,
  taskWorktreePathPath,
  taskWorktreePathRequestSchema,
} from "@aim-ai/contract";
import type { Hono } from "hono";

import type { ApiLogger } from "../api-logger.js";
import { createDimensionRepository } from "../dimension-repository.js";
import { execGh } from "../exec-file.js";
import { listSupportedModels } from "../opencode/list-supported-models.js";
import { createOpenCodeSessionRepository } from "../opencode-session-repository.js";
import { buildTaskLogFields } from "../task-log-fields.js";
import { createTaskRepository } from "../task-repository.js";

type SourceBaselineFreshness = Task["source_baseline_freshness"];
type CurrentBaselineFacts = { commit: null | string };
type CurrentBaselineFactsProvider = () => Promise<CurrentBaselineFacts>;

const taskByIdRoutePath = taskByIdPath.replace("{taskId}", ":taskId");
const tasksBatchRoutePath = tasksBatchPath;
const taskWorktreePathRoutePath = taskWorktreePathPath.replace(
  "{taskId}",
  ":taskId",
);
const taskPullRequestUrlRoutePath = taskPullRequestUrlPath.replace(
  "{taskId}",
  ":taskId",
);
const taskPullRequestStatusRoutePath = taskPullRequestStatusPath.replace(
  "{taskId}",
  ":taskId",
);
const taskDependenciesRoutePath = taskDependenciesPath.replace(
  "{taskId}",
  ":taskId",
);
const taskSpecRoutePath = taskSpecPath.replace("{taskId}", ":taskId");
const taskResolveRoutePath = taskResolvePath.replace("{taskId}", ":taskId");
const taskRejectRoutePath = taskRejectPath.replace("{taskId}", ":taskId");

const redactSensitiveErrorDetail = (message: string) =>
  message
    .replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "[REDACTED]")
    .replace(/\s+and stack\s+at\s+[^\s.]+(?:\.\w+)?:\d+/gi, "");

const buildNotFoundError = (taskId: string) =>
  taskErrorSchema.parse({
    code: "TASK_NOT_FOUND",
    message: `Task ${taskId} was not found`,
  });

const buildValidationError = (message: string) =>
  taskErrorSchema.parse({
    code: "TASK_VALIDATION_ERROR",
    message,
  });

const buildOpenCodeModelsUnavailableError = () =>
  taskErrorSchema.parse({
    code: "OPENCODE_MODELS_UNAVAILABLE",
    message:
      "Cannot validate project global_provider_id and global_model_id because OpenCode models are unavailable",
  });

const createGitCurrentBaselineFactsProvider =
  (projectRoot: string | undefined): CurrentBaselineFactsProvider =>
  async () => {
    const commit =
      (projectRoot ? await readOriginMainCommit(projectRoot) : null) ??
      (await readOriginMainCommit(process.cwd()));

    return { commit };
  };

const readOriginMainCommit = (cwd: string) =>
  new Promise<null | string>((resolve) => {
    execFile(
      "git",
      ["rev-parse", "origin/main"],
      { cwd, encoding: "utf8" },
      (error, stdout) => {
        if (error) {
          resolve(null);

          return;
        }

        const commit = stdout.trim();

        resolve(commit.length > 0 ? commit : null);
      },
    );
  });

const requireTaskId = (taskId: string | undefined) => taskId ?? "task-unknown";

const parseListFilters = (request: Request) => {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const done = searchParams.get("done");
  const sessionId = searchParams.get("session_id");

  if (status !== null && !taskStatusSchema.safeParse(status).success) {
    return buildValidationError("Invalid task status filter");
  }

  if (done !== null && done !== "true" && done !== "false") {
    return buildValidationError("Invalid task done filter");
  }

  if (sessionId !== null && sessionId.length === 0) {
    return buildValidationError("Invalid task session filter");
  }

  return {
    done: done === null ? undefined : done === "true",
    session_id: sessionId ?? undefined,
    status: status === null ? undefined : (status as TaskStatus),
  };
};

const parseCreateTaskRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = createTaskRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid task payload"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

const parseCreateTaskBatchRequest = async (
  request: Request,
  currentBaselineFactsProvider: CurrentBaselineFactsProvider,
) => {
  const payload = await request.json().catch(() => undefined);
  const result = createTaskBatchRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid task batch payload"),
      ok: false as const,
    };
  }

  const taskIds = new Map<string, "create" | "delete">();

  for (const operation of result.data.operations) {
    const taskId =
      operation.type === "create" ? operation.task.task_id : operation.task_id;
    const existingOperationType = taskIds.get(taskId);

    if (existingOperationType && existingOperationType !== operation.type) {
      return {
        error: buildValidationError(
          `Task batch cannot create and delete task_id ${taskId} in the same batch`,
        ),
        ok: false as const,
      };
    }

    if (existingOperationType) {
      return {
        error: buildValidationError(
          "Task batch operations must not repeat task_id",
        ),
        ok: false as const,
      };
    }

    taskIds.set(taskId, operation.type);
  }

  const hasCreateOperation = result.data.operations.some(
    (operation) => operation.type === "create",
  );
  const currentBaselineFacts = hasCreateOperation
    ? await currentBaselineFactsProvider()
    : null;

  for (const operation of result.data.operations) {
    if (operation.type === "create") {
      const planningError = normalizeCoordinatorPlanningEvidence(
        operation.task,
      );

      if (planningError) {
        return {
          error: buildValidationError(planningError),
          ok: false as const,
        };
      }

      const validationError = normalizeTaskSpecValidation(operation.task);

      if (validationError) {
        return {
          error: buildValidationError(validationError),
          ok: false as const,
        };
      }

      const baselineFreshnessError = validateTaskBatchCreateBaselineFreshness(
        operation.task,
        currentBaselineFacts?.commit ?? null,
      );

      if (baselineFreshnessError) {
        return {
          error: buildValidationError(baselineFreshnessError),
          ok: false as const,
        };
      }

      continue;
    }

    if (!getNonEmptyString(operation, "delete_reason")) {
      return {
        error: buildValidationError(
          "Task batch delete requires delete_reason planning evidence explaining stale/conflict/baseline absorbed rationale and worktree/PR classification",
        ),
        ok: false as const,
      };
    }
  }

  return { data: result.data, ok: true as const };
};

const getNonEmptyString = (source: Record<string, unknown>, field: string) => {
  const value = source[field];

  return typeof value === "string" && value.trim().length > 0 ? value : null;
};

const unknownSourceBaselineFreshness = (
  sourceCommit: null | string,
  currentCommit: null | string,
): SourceBaselineFreshness => ({
  current_commit: currentCommit,
  source_commit: sourceCommit,
  status: "unknown",
  summary: sourceCommit
    ? "Current origin/main baseline is unavailable for comparison"
    : "Task source baseline metadata is missing latest_origin_main_commit",
});

const buildSourceBaselineFreshness = (
  task: Task,
  currentCommit: null | string,
): SourceBaselineFreshness => {
  const sourceCommit = getNonEmptyString(
    task.source_metadata,
    "latest_origin_main_commit",
  );

  if (!sourceCommit || !currentCommit) {
    return unknownSourceBaselineFreshness(sourceCommit, currentCommit);
  }

  if (sourceCommit === currentCommit) {
    return {
      current_commit: currentCommit,
      source_commit: sourceCommit,
      status: "current",
      summary: `Task source baseline matches current origin/main ${currentCommit}`,
    };
  }

  return {
    current_commit: currentCommit,
    source_commit: sourceCommit,
    status: "stale",
    summary: `Task source baseline ${sourceCommit} differs from current origin/main ${currentCommit}`,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeTaskSpecValidation = (
  task: Extract<
    ParsedCreateTaskBatchRequest["operations"][number],
    { type: "create" }
  >["task"],
) => {
  const sourceMetadata = task.source_metadata;

  if (!sourceMetadata) {
    return "Task batch create requires source_metadata.task_spec_validation evidence";
  }

  if (
    !getNonEmptyString(sourceMetadata, "dimension_id") ||
    !getNonEmptyString(sourceMetadata, "dimension_evaluation_id")
  ) {
    return "Task batch create requires top-level dimension_id and dimension_evaluation_id planning evidence separate from task_spec_validation";
  }

  const taskSpecValidation = sourceMetadata.task_spec_validation;

  if (!isRecord(taskSpecValidation)) {
    return "Task batch create requires source_metadata.task_spec_validation evidence";
  }

  const validationSource = getNonEmptyString(
    taskSpecValidation,
    "validation_source",
  );
  const validatedAt = getNonEmptyString(taskSpecValidation, "validated_at");
  const validationSessionId = getNonEmptyString(
    taskSpecValidation,
    "validation_session_id",
  );
  const conclusionSummary = getNonEmptyString(
    taskSpecValidation,
    "conclusion_summary",
  );
  const sourceGap =
    getNonEmptyString(taskSpecValidation, "dimension_evaluation_id") ||
    getNonEmptyString(taskSpecValidation, "dimension_id") ||
    getNonEmptyString(taskSpecValidation, "source_gap");

  if (
    !validationSource ||
    (!validatedAt && !validationSessionId) ||
    !conclusionSummary ||
    !sourceGap
  ) {
    return "Task batch create requires complete source_metadata.task_spec_validation evidence";
  }

  const explicitConclusion = getNonEmptyString(
    taskSpecValidation,
    "conclusion",
  );
  const conclusion =
    explicitConclusion ?? inferValidationConclusion(conclusionSummary);

  if (
    conclusion !== "pass" &&
    conclusion !== "waiting_assumptions" &&
    conclusion !== "failed"
  ) {
    return "Task Spec validation conclusion must be pass, waiting_assumptions, or failed";
  }

  taskSpecValidation.conclusion = conclusion;

  if (conclusion === "waiting_assumptions") {
    return buildBlockedValidationMessage(
      "waiting_assumptions Task Spec validation cannot enter POST /tasks/batch",
      taskSpecValidation.blocking_assumptions,
    );
  }

  if (conclusion === "failed") {
    return buildBlockedValidationMessage(
      "failed Task Spec validation cannot enter POST /tasks/batch",
      taskSpecValidation.failure_reason,
    );
  }

  return null;
};

const validateTaskBatchCreateBaselineFreshness = (
  task: Extract<
    ParsedCreateTaskBatchRequest["operations"][number],
    { type: "create" }
  >["task"],
  currentCommit: null | string,
) => {
  if (!currentCommit) {
    return "Task batch create cannot confirm current origin/main baseline. Fetch origin/main or configure baseline facts lookup, then retry POST /tasks/batch.";
  }

  const sourceMetadata = task.source_metadata;
  const taskSpecValidation = isRecord(sourceMetadata?.task_spec_validation)
    ? sourceMetadata.task_spec_validation
    : null;
  const sourceCommit = sourceMetadata
    ? getNonEmptyString(sourceMetadata, "latest_origin_main_commit")
    : null;
  const validatedCommit = taskSpecValidation
    ? getNonEmptyString(taskSpecValidation, "validated_baseline_commit")
    : null;
  const missingFields = [
    sourceCommit ? null : "source_metadata.latest_origin_main_commit",
    validatedCommit
      ? null
      : "source_metadata.task_spec_validation.validated_baseline_commit",
  ].filter((field): field is string => field !== null);
  const mismatchedFields = [
    sourceCommit && sourceCommit !== currentCommit
      ? `source_metadata.latest_origin_main_commit=${redactSensitiveErrorDetail(sourceCommit)}`
      : null,
    validatedCommit && validatedCommit !== currentCommit
      ? `source_metadata.task_spec_validation.validated_baseline_commit=${redactSensitiveErrorDetail(validatedCommit)}`
      : null,
  ].filter((field): field is string => field !== null);

  if (missingFields.length === 0 && mismatchedFields.length === 0) {
    return null;
  }

  const detailParts = [
    missingFields.length > 0 ? `missing ${missingFields.join(", ")}` : null,
    mismatchedFields.length > 0
      ? `mismatched ${mismatchedFields.join(", ")}`
      : null,
  ].filter((part): part is string => part !== null);

  return `Task batch create requires current baseline metadata matching origin/main ${currentCommit}: ${detailParts.join("; ")}. Expected/current commit is ${currentCommit}. Refresh the Task Spec from current origin/main, rerun task_spec_validation, and retry POST /tasks/batch.`;
};

const normalizeCoordinatorPlanningEvidence = (
  task: Extract<
    ParsedCreateTaskBatchRequest["operations"][number],
    { type: "create" }
  >["task"],
) => {
  const sourceMetadata = task.source_metadata;

  if (!sourceMetadata) {
    return "Task batch create requires source_metadata Coordinator planning evidence independent from task_spec_validation";
  }

  const requiredFields = [
    "current_task_pool_coverage",
    "dependency_rationale",
    "conflict_duplicate_assessment",
    "unfinished_task_non_conflict_rationale",
  ];
  const missingFields = requiredFields.filter(
    (field) => !getNonEmptyString(sourceMetadata, field),
  );

  if (missingFields.length > 0) {
    return `Task batch create requires source_metadata Coordinator planning evidence independent from task_spec_validation: ${missingFields.join(", ")}`;
  }

  return null;
};

const buildBlockedValidationMessage = (message: string, detail: unknown) => {
  if (typeof detail === "string" && detail.trim().length > 0) {
    const normalizedDetail = detail.trim();
    const redactedDetail = redactSensitiveErrorDetail(normalizedDetail);

    if (redactedDetail !== normalizedDetail) {
      return `${message}: ${redactedDetail}. Check source_metadata.task_spec_validation and Fix the validation evidence before retrying POST /tasks/batch.`;
    }

    return `${message}: ${normalizedDetail}`;
  }

  if (Array.isArray(detail)) {
    const details = detail
      .filter((item): item is string => typeof item === "string")
      .map((item) => redactSensitiveErrorDetail(item.trim()))
      .filter(Boolean);

    if (details.length > 0) {
      return `${message}: ${details.join("; ")}`;
    }
  }

  return message;
};

const inferValidationConclusion = (conclusionSummary: string) => {
  const normalized = conclusionSummary.toLowerCase();

  if (normalized.includes("waiting_assumptions")) {
    return "waiting_assumptions";
  }

  if (normalized.includes("failed") || normalized.includes("failure")) {
    return "failed";
  }

  if (normalized.includes("pass")) {
    return "pass";
  }

  return null;
};

const parsePatchTaskRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);

  const result = patchTaskRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid task patch"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

const parseTaskResultRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = taskResultRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid task result"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

const getPullRequestMergedOutput = (pullRequestUrl: string) =>
  execGh(["pr", "view", pullRequestUrl, "--json", "state,mergedAt"], {
    target: pullRequestUrl,
  });

const getPullRequestFollowupOutput = (pullRequestUrl: string) =>
  execGh(
    [
      "pr",
      "view",
      pullRequestUrl,
      "--json",
      "state,mergedAt,mergeable,reviewDecision,statusCheckRollup,autoMergeRequest",
    ],
    { target: pullRequestUrl },
  );

type PullRequestFollowupView = {
  autoMergeRequest?: unknown;
  mergeable?: unknown;
  mergedAt?: unknown;
  reviewDecision?: unknown;
  state?: unknown;
  statusCheckRollup?: unknown;
};

const readCheckName = (check: unknown) => {
  if (!check || typeof check !== "object") {
    return "unnamed check";
  }

  const candidate = check as { name?: unknown; workflowName?: unknown };

  return typeof candidate.name === "string" && candidate.name.trim().length > 0
    ? candidate.name.trim()
    : typeof candidate.workflowName === "string" &&
        candidate.workflowName.trim().length > 0
      ? candidate.workflowName.trim()
      : "unnamed check";
};

const readCheckState = (check: unknown) => {
  if (!check || typeof check !== "object") {
    return { conclusion: "", status: "" };
  }

  const candidate = check as { conclusion?: unknown; status?: unknown };

  return {
    conclusion:
      typeof candidate.conclusion === "string"
        ? candidate.conclusion.toUpperCase()
        : "",
    status:
      typeof candidate.status === "string"
        ? candidate.status.toUpperCase()
        : "",
  };
};

const buildPullRequestFollowupStatus = (
  task: {
    done: boolean;
    pull_request_url: string | null;
    session_id: string | null;
    status: TaskStatus;
    worktree_path: string | null;
  },
  pullRequest: PullRequestFollowupView | null,
  openCodeSession: OpenCodeSession | null = null,
): TaskPullRequestStatusResponse => {
  const base = {
    pull_request_url: task.pull_request_url,
    task_done: task.done,
    task_status: task.status,
  };

  if (!task.pull_request_url) {
    if (task.status === "processing" && !task.session_id) {
      return taskPullRequestStatusResponseSchema.parse({
        ...base,
        category: "waiting_for_assignment",
        recovery_action:
          "Assign a developer session before expecting PR follow-up; no PR exists yet.",
        summary:
          "Task is processing without an assigned OpenCode session or PR.",
      });
    }

    if (task.status === "processing" && openCodeSession?.stale) {
      return taskPullRequestStatusResponseSchema.parse({
        ...base,
        category: "session_pending_stale",
        recovery_action:
          "Continue or restart the stale OpenCode session, then create and record a PR when work is ready.",
        summary:
          "Task has a stale pending OpenCode session and no pull_request_url.",
      });
    }

    if (task.status === "processing" && task.worktree_path) {
      return taskPullRequestStatusResponseSchema.parse({
        ...base,
        category: "worktree_created_no_pr",
        recovery_action:
          "Inspect the task worktree, continue development there if still valid, then create and record pull_request_url.",
        summary: "Task has a recorded worktree but no pull_request_url.",
      });
    }

    if (task.status === "processing" && openCodeSession) {
      return taskPullRequestStatusResponseSchema.parse({
        ...base,
        category: "needs_developer_continue",
        recovery_action:
          "Continue the assigned OpenCode session until work is ready for PR, then record pull_request_url.",
        summary:
          "Task has an active assigned OpenCode session and no pull_request_url.",
      });
    }

    return taskPullRequestStatusResponseSchema.parse({
      ...base,
      category: "no_pull_request",
      recovery_action:
        "Record pull_request_url after creating the PR, or continue development until a PR exists.",
      summary: "No pull_request_url is recorded for this task.",
    });
  }

  if (!pullRequest) {
    return taskPullRequestStatusResponseSchema.parse({
      ...base,
      category: "pull_request_unavailable",
      recovery_action:
        "Verify the pull_request_url, GitHub CLI authentication, and repository access. If the PR was deleted or cannot be recovered, reject or escalate with the exact lookup failure.",
      summary: "Could not query the pull request with gh.",
    });
  }

  const state = typeof pullRequest.state === "string" ? pullRequest.state : "";
  const mergedAt =
    typeof pullRequest.mergedAt === "string" ? pullRequest.mergedAt.trim() : "";
  const checks = Array.isArray(pullRequest.statusCheckRollup)
    ? pullRequest.statusCheckRollup
    : [];
  const failedChecks = checks.filter((check) => {
    const { conclusion } = readCheckState(check);

    return ["ACTION_REQUIRED", "CANCELLED", "FAILURE", "TIMED_OUT"].includes(
      conclusion,
    );
  });
  const waitingChecks = checks.filter((check) => {
    const { status } = readCheckState(check);

    return [
      "EXPECTED",
      "IN_PROGRESS",
      "PENDING",
      "QUEUED",
      "REQUESTED",
    ].includes(status);
  });
  const reviewDecision =
    typeof pullRequest.reviewDecision === "string"
      ? pullRequest.reviewDecision
      : "";
  const mergeable =
    typeof pullRequest.mergeable === "string" ? pullRequest.mergeable : "";
  const autoMergeEnabled = pullRequest.autoMergeRequest != null;

  if (
    (state === "MERGED" || mergedAt.length > 0) &&
    task.status !== "resolved"
  ) {
    return taskPullRequestStatusResponseSchema.parse({
      ...base,
      category: "merged_but_not_resolved",
      recovery_action:
        "Report the final result with POST /tasks/{taskId}/resolve now that the pull request is merged.",
      summary: "Pull request is merged, but the AIM task is still processing.",
    });
  }

  if (state === "CLOSED") {
    return taskPullRequestStatusResponseSchema.parse({
      ...base,
      category: "closed_abandoned",
      recovery_action:
        "Confirm whether the closed PR was intentionally abandoned. Reopen or create a replacement PR if work should continue; otherwise reject with the closure reason.",
      summary: "Pull request is closed without being merged.",
    });
  }

  if (failedChecks.length > 0) {
    return taskPullRequestStatusResponseSchema.parse({
      ...base,
      category: "failed_checks",
      recovery_action:
        "Inspect the failing required checks, fix in-scope failures on the same branch, push, and continue PR follow-up. Escalate if the failure is outside task scope.",
      summary: `Required checks failed: ${failedChecks.map(readCheckName).join(", ")}.`,
    });
  }

  if (waitingChecks.length > 0) {
    return taskPullRequestStatusResponseSchema.parse({
      ...base,
      category: "waiting_checks",
      recovery_action:
        "Wait for required checks to finish, then reclassify the PR before merging or resolving the task.",
      summary: `Required checks are still running: ${waitingChecks.map(readCheckName).join(", ")}.`,
    });
  }

  if (["CHANGES_REQUESTED", "REVIEW_REQUIRED"].includes(reviewDecision)) {
    return taskPullRequestStatusResponseSchema.parse({
      ...base,
      category: "review_blocked",
      recovery_action:
        "Address blocking review feedback on the same branch, then wait for review dismissal or approval before merging.",
      summary: `Pull request review is blocking merge: ${reviewDecision}.`,
    });
  }

  if (["CONFLICTING", "UNKNOWN"].includes(mergeable)) {
    return taskPullRequestStatusResponseSchema.parse({
      ...base,
      category: "merge_conflict",
      recovery_action:
        "Fetch origin, rebase the task branch on origin/main, resolve conflicts, push, and continue PR follow-up.",
      summary: `Pull request mergeability is ${mergeable}.`,
    });
  }

  if (!autoMergeEnabled) {
    return taskPullRequestStatusResponseSchema.parse({
      ...base,
      category: "auto_merge_unavailable",
      recovery_action:
        "Enable auto-merge with squash if repository policy allows it. If GitHub refuses, record the exact reason and continue manual PR follow-up.",
      summary:
        "Pull request is open, but auto-merge is not enabled or unavailable.",
    });
  }

  return taskPullRequestStatusResponseSchema.parse({
    ...base,
    category: "ready_to_merge",
    recovery_action:
      "Checks and review are clear. Merge according to repository policy if auto-merge has not already completed it.",
    summary:
      "Pull request has no observed checks, review, or mergeability blockers.",
  });
};

const verifyPullRequestMerged = async (pullRequestUrl: string) => {
  let stdout: string;
  try {
    stdout = await getPullRequestMergedOutput(pullRequestUrl);
  } catch (error) {
    const detail =
      error instanceof Error
        ? ` gh error: ${redactSensitiveErrorDetail(error.message)}.`
        : "";

    return buildValidationError(
      `Could not confirm pull_request_url is merged with gh.${detail} Verify the PR exists, confirm GitHub CLI authentication and repository access, then retry resolve.`,
    );
  }

  let pullRequest: { mergedAt?: unknown; state?: unknown };
  try {
    pullRequest = JSON.parse(stdout) as { mergedAt?: unknown; state?: unknown };
  } catch {
    return buildValidationError(
      "Could not confirm pull_request_url is merged with gh. Make sure GitHub CLI is installed, authenticated, and the PR exists.",
    );
  }

  const mergedAt =
    typeof pullRequest.mergedAt === "string" ? pullRequest.mergedAt.trim() : "";

  if (pullRequest.state !== "MERGED" && mergedAt.length === 0) {
    return buildValidationError(
      "Task cannot be resolved until pull_request_url points to a merged pull request.",
    );
  }

  return null;
};

const parseTaskWorktreePathRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = taskWorktreePathRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid task worktree_path payload"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

const parseTaskPullRequestUrlRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = taskPullRequestUrlRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid task pull_request_url payload"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

const parseTaskDependenciesRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = taskDependenciesRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid task dependencies payload"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

type RegisterTaskRoutesOptions = {
  currentBaselineFactsProvider?: CurrentBaselineFactsProvider;
  logger?: ApiLogger;
  openCodeModelsAdapter?: {
    listSupportedModels(): ReturnType<typeof listSupportedModels>;
  };
  resourceScope?: Pick<AsyncDisposableStack, "use">;
};

export const registerTaskRoutes = (
  app: Hono,
  options: RegisterTaskRoutesOptions = {},
) => {
  const logger = options.logger;
  const projectRoot = process.env.AIM_PROJECT_ROOT;
  const currentBaselineFactsProvider =
    options.currentBaselineFactsProvider ??
    createGitCurrentBaselineFactsProvider(projectRoot);
  let openCodeModelsAdapter = options.openCodeModelsAdapter;
  let dimensionRepository: null | ReturnType<typeof createDimensionRepository> =
    null;
  let repository: null | ReturnType<typeof createTaskRepository> = null;
  let openCodeSessionRepository: null | ReturnType<
    typeof createOpenCodeSessionRepository
  > = null;
  const getDimensionRepository = () => {
    dimensionRepository ??=
      options.resourceScope?.use(createDimensionRepository({ projectRoot })) ??
      createDimensionRepository({ projectRoot });

    return dimensionRepository;
  };
  const getRepository = () => {
    repository ??=
      options.resourceScope?.use(createTaskRepository({ projectRoot })) ??
      createTaskRepository({ projectRoot });

    return repository;
  };
  const getOpenCodeModelsAdapter = () => {
    openCodeModelsAdapter ??= {
      listSupportedModels: () =>
        listSupportedModels({
          baseUrl: process.env.OPENCODE_BASE_URL ?? "http://localhost:4096",
        }),
    };

    return openCodeModelsAdapter;
  };
  const getOpenCodeSessionRepository = () => {
    openCodeSessionRepository ??=
      options.resourceScope?.use(
        createOpenCodeSessionRepository({ projectRoot }),
      ) ?? createOpenCodeSessionRepository({ projectRoot });

    return openCodeSessionRepository;
  };
  const attachOpenCodeSessions = (tasks: Task[]) => {
    if (tasks.length === 0) {
      return tasks;
    }

    const sessions = new Map(
      getOpenCodeSessionRepository()
        .listSessions()
        .map((session) => [session.session_id, session]),
    );

    return tasks.map((task) => ({
      ...task,
      opencode_session: task.session_id
        ? (sessions.get(task.session_id) ?? null)
        : null,
    }));
  };
  const getCurrentCommitsByProject = async (tasks: Task[]) => {
    const projectIds = [...new Set(tasks.map((task) => task.project_id))];
    const entries = await Promise.all(
      projectIds.map(async (projectId) => {
        const evaluations =
          await getDimensionRepository().listProjectDimensionEvaluations(
            projectId,
          );
        const latestEvaluation = evaluations.reduce(
          (latest, evaluation) =>
            !latest || evaluation.created_at > latest.created_at
              ? evaluation
              : latest,
          null as null | DimensionEvaluation,
        );

        return [projectId, latestEvaluation?.commit_sha ?? null] as const;
      }),
    );

    return new Map(entries);
  };
  const attachSourceBaselineFreshness = async (tasks: Task[]) => {
    const currentCommitsByProject = await getCurrentCommitsByProject(tasks);

    return tasks.map((task) => ({
      ...task,
      source_baseline_freshness: buildSourceBaselineFreshness(
        task,
        currentCommitsByProject.get(task.project_id) ?? null,
      ),
    }));
  };

  app.get(tasksPath, async (context) => {
    const filters = parseListFilters(context.req.raw);

    if ("code" in filters) {
      return context.json(filters, 400);
    }

    const freshTasks = await attachSourceBaselineFreshness(
      await getRepository().listTasks(filters),
    );
    const items = attachOpenCodeSessions(freshTasks);

    return context.json({ items }, 200);
  });

  app.post(tasksPath, async (context) => {
    const input = await parseCreateTaskRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    let models: Awaited<ReturnType<typeof listSupportedModels>>;
    const projectId = input.data.project_id;

    try {
      models = await getOpenCodeModelsAdapter().listSupportedModels();
    } catch {
      return context.json(buildOpenCodeModelsUnavailableError(), 503);
    }

    const project = projectId
      ? await getRepository().getProjectById(projectId)
      : null;

    if (!project) {
      return context.json(
        buildValidationError(`Project ${projectId} was not found`),
        400,
      );
    }

    if (!project.global_provider_id.trim() || !project.global_model_id.trim()) {
      return context.json(
        buildValidationError(
          `Project ${projectId} is missing global provider/model configuration`,
        ),
        400,
      );
    }

    const matchingModel = models.items.find(
      (model) =>
        model.provider_id === project.global_provider_id &&
        model.model_id === project.global_model_id,
    );

    if (!matchingModel) {
      return context.json(
        buildValidationError(
          `Project ${project.id} global_provider_id "${project.global_provider_id}" with global_model_id "${project.global_model_id}" is not available. Use GET /opencode/models to choose a supported provider/model combination.`,
        ),
        400,
      );
    }

    const payload = await getRepository().createTask(input.data);

    logger?.info(buildTaskLogFields("task_created", payload));

    return context.json(attachOpenCodeSessions([payload])[0], 201);
  });

  app.post(tasksBatchRoutePath, async (context) => {
    const input = await parseCreateTaskBatchRequest(
      context.req.raw,
      currentBaselineFactsProvider,
    );

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    try {
      const payload = await getRepository().createTaskBatch(input.data);

      return context.json(payload, 200);
    } catch (error) {
      return context.json(
        buildValidationError(
          error instanceof Error
            ? error.message
            : "Invalid task batch operation",
        ),
        400,
      );
    }
  });

  app.get(taskByIdRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));

    const task = await getRepository().getTaskById(taskId);

    if (!task) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    return context.json(
      attachOpenCodeSessions(await attachSourceBaselineFreshness([task]))[0],
      200,
    );
  });

  app.get(taskSpecRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));

    const task = await getRepository().getTaskById(taskId);

    if (!task) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    return new Response(task.task_spec, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
      },
      status: 200,
    });
  });

  app.patch(taskByIdRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));

    const patch = await parsePatchTaskRequest(context.req.raw);

    if (!patch.ok) {
      return context.json(patch.error, 400);
    }

    const payload = await getRepository().updateTask(taskId, patch.data);

    if (!payload) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    return context.json(attachOpenCodeSessions([payload])[0], 200);
  });

  app.put(taskWorktreePathRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));
    const input = await parseTaskWorktreePathRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    const payload = await getRepository().updateTask(taskId, input.data);

    if (!payload) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    return context.json(attachOpenCodeSessions([payload])[0], 200);
  });

  app.put(taskPullRequestUrlRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));
    const input = await parseTaskPullRequestUrlRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    const payload = await getRepository().updateTask(taskId, input.data);

    if (!payload) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    return context.json(attachOpenCodeSessions([payload])[0], 200);
  });

  app.get(taskPullRequestStatusRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));
    const task = await getRepository().getTaskById(taskId);

    if (!task) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    if (!task.pull_request_url) {
      const openCodeSession = task.session_id
        ? getOpenCodeSessionRepository().getSessionById(task.session_id)
        : null;

      return context.json(
        buildPullRequestFollowupStatus(task, null, openCodeSession),
        200,
      );
    }

    let pullRequest: PullRequestFollowupView | null = null;

    try {
      pullRequest = JSON.parse(
        await getPullRequestFollowupOutput(task.pull_request_url),
      ) as PullRequestFollowupView;
    } catch {
      pullRequest = null;
    }

    return context.json(buildPullRequestFollowupStatus(task, pullRequest), 200);
  });

  app.put(taskDependenciesRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));
    const input = await parseTaskDependenciesRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    const payload = await getRepository().updateTask(taskId, input.data);

    if (!payload) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    return context.json(attachOpenCodeSessions([payload])[0], 200);
  });

  app.post(taskResolveRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));
    const input = await parseTaskResultRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    const task = await getRepository().getTaskById(taskId);

    if (!task) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    if (!task.pull_request_url) {
      return context.json(
        buildValidationError(
          "Task cannot be resolved until pull_request_url is recorded.",
        ),
        400,
      );
    }

    const pullRequestError = await verifyPullRequestMerged(
      task.pull_request_url,
    );

    if (pullRequestError) {
      return context.json(pullRequestError, 400);
    }

    const payload = await getRepository().resolveTask(
      taskId,
      input.data.result,
    );

    if (!payload) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    logger?.info(buildTaskLogFields("task_resolved", payload));

    return new Response(null, { status: 204 });
  });

  app.post(taskRejectRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));
    const input = await parseTaskResultRequest(context.req.raw);

    if (!input.ok) {
      return context.json(input.error, 400);
    }

    const payload = await getRepository().rejectTask(taskId, input.data.result);

    if (!payload) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    logger?.info(buildTaskLogFields("task_rejected", payload));

    return new Response(null, { status: 204 });
  });

  app.delete(taskByIdRoutePath, async (context) => {
    const taskId = requireTaskId(context.req.param("taskId"));

    const deleted = await getRepository().deleteTask(taskId);

    if (!deleted) {
      return context.json(buildNotFoundError(taskId), 404);
    }

    return new Response(null, { status: 204 });
  });
};
