import { z } from "zod";

const HealthResponse = z
  .object({ status: z.literal("ok") })
  .strict()
  .passthrough();
const HealthError = z
  .object({ code: z.literal("UNAVAILABLE"), message: z.string().min(1) })
  .strict()
  .passthrough();
const OpenCodeModelCombination = z
  .object({
    provider_id: z.string().min(1),
    provider_name: z.string().min(1),
    model_id: z.string().min(1),
    model_name: z.string().min(1),
  })
  .strict();
const OpenCodeModelsResponse = z
  .object({ items: z.array(OpenCodeModelCombination) })
  .strict();
const ErrorResponse = z
  .object({
    code: z.enum([
      "TASK_NOT_FOUND",
      "TASK_CONFLICT",
      "TASK_VALIDATION_ERROR",
      "TASK_UNSUPPORTED_STATUS",
      "PROJECT_NOT_FOUND",
      "PROJECT_CONFLICT",
      "PROJECT_VALIDATION_ERROR",
      "MANAGER_REPORT_NOT_FOUND",
      "MANAGER_REPORT_CONFLICT",
      "MANAGER_REPORT_VALIDATION_ERROR",
      "TASK_WRITE_BULK_NOT_FOUND",
      "TASK_WRITE_BULK_CONFLICT",
      "TASK_WRITE_BULK_VALIDATION_ERROR",
      "DIMENSION_NOT_FOUND",
      "DIMENSION_VALIDATION_ERROR",
      "DIRECTOR_CLARIFICATION_NOT_FOUND",
      "DIRECTOR_CLARIFICATION_VALIDATION_ERROR",
      "OPENCODE_MODELS_UNAVAILABLE",
    ]),
    message: z.string().min(1),
  })
  .strict();
const OpenCodeSessionState = z.enum(["pending", "resolved", "rejected"]);
const OpenCodeSession = z
  .object({
    session_id: z.string().min(1),
    state: OpenCodeSessionState,
    value: z.union([z.string(), z.null()]),
    reason: z.union([z.string(), z.null()]),
    continue_prompt: z.union([z.string(), z.null()]),
    provider_id: z.union([z.string(), z.null()]),
    model_id: z.union([z.string(), z.null()]),
    input_tokens: z.number().int().gte(0),
    cached_tokens: z.number().int().gte(0),
    cache_write_tokens: z.number().int().gte(0),
    output_tokens: z.number().int().gte(0),
    reasoning_tokens: z.number().int().gte(0),
    stale: z.boolean(),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
  })
  .strict();
const OpenCodeSessionListResponse = z
  .object({ items: z.array(OpenCodeSession) })
  .strict();
const CreateOpenCodeSessionRequest = z
  .object({
    session_id: z.string().min(1),
    continue_prompt: z.union([z.string(), z.null()]).optional(),
    provider_id: z.union([z.string(), z.null()]).optional(),
    model_id: z.union([z.string(), z.null()]).optional(),
  })
  .strict();
const OpenCodeSessionContinueCounts = z
  .object({
    pushed: z.number().int().gte(0),
    skipped: z.number().int().gte(0),
    error: z.number().int().gte(0),
  })
  .strict();
const OpenCodeSessionContinueStatus = z.enum(["pushed", "skipped", "error"]);
const OpenCodeSessionContinueResult = z
  .object({
    session_id: z.string().min(1),
    status: OpenCodeSessionContinueStatus,
    reason: z.union([z.string(), z.null()]),
  })
  .strict();
const OpenCodeSessionContinueBulkResponse = z
  .object({
    counts: OpenCodeSessionContinueCounts,
    items: z.array(OpenCodeSessionContinueResult),
  })
  .strict();
const PatchOpenCodeSessionRequest = z
  .object({ continue_prompt: z.union([z.string(), z.null()]) })
  .strict();
const OpenCodeSessionSettleRequest = z
  .object({ value: z.string(), reason: z.string() })
  .partial()
  .strict();
const CreateProjectRequest = z
  .object({
    name: z.string().min(1),
    git_origin_url: z.string().min(1),
    global_provider_id: z.string().min(1),
    global_model_id: z.string().min(1),
    optimizer_enabled: z.boolean().optional(),
    token_warning_threshold: z.union([z.number(), z.null()]).optional(),
    cost_warning_threshold: z.union([z.number(), z.null()]).optional(),
  })
  .strict();
const Project = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    git_origin_url: z.string().min(1),
    global_provider_id: z.string().min(1),
    global_model_id: z.string().min(1),
    optimizer_enabled: z.boolean(),
    token_warning_threshold: z.union([z.number(), z.null()]),
    cost_warning_threshold: z.union([z.number(), z.null()]),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
  })
  .strict();
const ProjectListResponse = z.object({ items: z.array(Project) }).strict();
const PatchProjectRequest = z
  .object({
    name: z.string().min(1),
    git_origin_url: z.string().min(1),
    global_provider_id: z.string().min(1),
    global_model_id: z.string().min(1),
    optimizer_enabled: z.boolean(),
    token_warning_threshold: z.union([z.number(), z.null()]),
    cost_warning_threshold: z.union([z.number(), z.null()]),
  })
  .partial()
  .strict();
const ProjectOptimizerTokenUsageAvailability = z.enum([
  "available",
  "partial",
  "unavailable",
  "no_sessions",
]);
const ProjectTokenUsageTotals = z
  .object({
    input: z.number().gte(0),
    output: z.number().gte(0),
    reasoning: z.number().gte(0),
    cache: z
      .object({ read: z.number().gte(0), write: z.number().gte(0) })
      .strict(),
    total: z.number().gte(0),
    cost: z.number().gte(0),
    messages: z.number().int().gte(0),
  })
  .strict();
const ProjectTokenBudgetWarningStatus = z.enum([
  "not_configured",
  "within_budget",
  "exceeded",
]);
const ProjectTokenBudgetWarning = z
  .object({
    status: ProjectTokenBudgetWarningStatus,
    token_warning_threshold: z.union([z.number(), z.null()]),
    cost_warning_threshold: z.union([z.number(), z.null()]),
    message: z.union([z.string(), z.null()]),
  })
  .strict();
const ProjectOptimizerTokenUsageSummary = z
  .object({
    availability: ProjectOptimizerTokenUsageAvailability,
    totals: ProjectTokenUsageTotals,
    budget_warning: ProjectTokenBudgetWarning,
    root_session_count: z.number().int().gte(0),
    failed_root_session_count: z.number().int().gte(0),
    failure_summary: z.union([z.string(), z.null()]),
  })
  .strict();
const ProjectOptimizerStatusResponse = z
  .object({
    project_id: z.string().uuid(),
    optimizer_enabled: z.boolean(),
    runtime_active: z.boolean(),
    blocker_summary: z.union([z.string(), z.null()]),
    current_baseline_commit_sha: z.union([z.string(), z.null()]).optional(),
    token_usage: ProjectOptimizerTokenUsageSummary,
    recent_events: z.array(
      z
        .object({
          lane_name: z.enum(["manager", "coordinator", "developer"]),
          project_id: z.string().min(1).optional(),
          event: z.enum(["start", "success", "failure", "idle", "noop"]),
          timestamp: z.string().datetime({ offset: true }),
          summary: z.string().min(1),
          task_id: z.string().min(1).optional(),
          session_id: z.string().min(1).optional(),
        })
        .strict()
    ),
  })
  .strict();
const ProjectTokenUsageFailure = z
  .object({
    code: z.literal("OPENCODE_MESSAGES_UNAVAILABLE"),
    message: z.string().min(1),
    root_session_id: z.string().min(1),
    task_id: z.string().min(1),
  })
  .strict();
const ProjectTokenUsageTask = z
  .object({
    task_id: z.string().min(1),
    title: z.string().min(1),
    session_id: z.string().min(1),
    totals: ProjectTokenUsageTotals,
    failures: z.array(ProjectTokenUsageFailure),
  })
  .strict();
const ProjectTokenUsageSession = z
  .object({
    root_session_id: z.string().min(1),
    task_id: z.string().min(1),
    title: z.string().min(1),
    totals: ProjectTokenUsageTotals,
    failure: z.union([ProjectTokenUsageFailure, z.null()]),
  })
  .strict();
const ProjectTokenUsageResponse = z
  .object({
    project_id: z.string().uuid(),
    totals: ProjectTokenUsageTotals,
    budget_warning: ProjectTokenBudgetWarning,
    tasks: z.array(ProjectTokenUsageTask),
    sessions: z.array(ProjectTokenUsageSession),
    failures: z.array(ProjectTokenUsageFailure),
  })
  .strict();
const DirectorClarificationKind = z.enum(["clarification", "adjustment"]);
const DirectorClarificationStatus = z.enum(["open", "addressed", "dismissed"]);
const DirectorClarification = z
  .object({
    id: z.string().min(1),
    project_id: z.string().uuid(),
    dimension_id: z.union([z.string(), z.null()]),
    kind: DirectorClarificationKind,
    message: z
      .string()
      .min(1)
      .regex(/^(?!\s*$).+/),
    status: DirectorClarificationStatus,
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
  })
  .strict();
const DirectorClarificationListResponse = z
  .object({ items: z.array(DirectorClarification) })
  .strict();
const CreateDirectorClarificationRequest = z
  .object({
    project_id: z.string().uuid(),
    dimension_id: z.union([z.string(), z.null()]).optional(),
    kind: DirectorClarificationKind,
    message: z
      .string()
      .min(1)
      .regex(/^(?!\s*$).+/),
  })
  .strict();
const PatchDirectorClarificationRequest = z
  .object({ status: z.enum(["open", "addressed", "dismissed"]) })
  .strict();
const CoordinatorProposalSourceDimension = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    goal: z.string().min(1).optional(),
    evaluation_method: z.string().min(1).optional(),
  })
  .strict();
const CoordinatorProposalSourceEvaluation = z
  .object({
    id: z.string().min(1),
    evaluation: z.string().min(1),
    commit_sha: z.string().min(1).optional(),
    score: z.number().optional(),
  })
  .strict();
const CoordinatorProposalEvaluationGap = z
  .object({
    source_dimension: CoordinatorProposalSourceDimension,
    source_evaluation: CoordinatorProposalSourceEvaluation,
    source_gap: z.string().min(1),
  })
  .strict();
const CoordinatorProposalTaskPoolItem = z
  .object({
    task_id: z.string().min(1),
    title: z.string().min(1),
    done: z.boolean().optional(),
    result: z.string().optional(),
    status: z.string().optional(),
    worktree_path: z.union([z.string(), z.null()]).optional(),
    pull_request_url: z.union([z.string(), z.null()]).optional(),
    source_metadata: z.object({}).partial().strict().passthrough().optional(),
  })
  .strict();
const CoordinatorProposalStaleTaskFeedback = z
  .object({ reason: z.string().min(1), task: CoordinatorProposalTaskPoolItem })
  .strict();
const CreateCoordinatorProposalDryRunRequest = z
  .object({
    project_id: z.string().uuid(),
    currentBaselineCommit: z.string().min(1),
    evaluations: z.array(CoordinatorProposalEvaluationGap),
    taskPool: z.array(CoordinatorProposalTaskPoolItem),
    rejectedTasks: z.array(CoordinatorProposalTaskPoolItem).optional(),
    staleTaskFeedback: z.array(CoordinatorProposalStaleTaskFeedback).optional(),
  })
  .strict();
const CoordinatorProposalCoverageJudgment = z.union([
  z
    .object({
      status: z.literal("covered_by_unfinished_task"),
      covered_by_task_id: z.string().min(1),
      summary: z.string().min(1),
    })
    .strict(),
  z
    .object({
      status: z.enum(["stale_unfinished_task", "uncovered_gap"]),
      summary: z.string().min(1),
    })
    .strict(),
]);
const CoordinatorProposalDependencyConflictPlan = z
  .object({
    conflict_draft: z.string().min(1),
    dependency_draft: z.array(z.string().min(1)),
  })
  .strict();
const CoordinatorProposalSourceMetadataPlanningEvidence = z
  .object({
    conflict_duplicate_assessment: z.string().min(1),
    current_task_pool_coverage: z.string().min(1),
    dependency_rationale: z.string().min(1),
    unfinished_task_non_conflict_rationale: z.string().min(1),
  })
  .strict();
const CoordinatorProposalOperationBase = z
  .object({
    coverage_judgment: CoordinatorProposalCoverageJudgment,
    dependency_conflict_plan: CoordinatorProposalDependencyConflictPlan,
    dry_run_only: z.literal(true),
    must_not_write_directly: z.literal(true),
    requires_task_spec_validation: z.boolean(),
    source_metadata_planning_evidence:
      CoordinatorProposalSourceMetadataPlanningEvidence,
    source_dimension: z.union([CoordinatorProposalSourceDimension, z.null()]),
    source_evaluation: z.union([CoordinatorProposalSourceEvaluation, z.null()]),
    source_gap: z.string(),
  })
  .strict()
  .passthrough();
const CoordinatorProposalPlanningFeedback = z
  .object({
    blocked: z.boolean(),
    reason: z.string().min(1),
    rejected_task_id: z.string().min(1).optional(),
  })
  .strict();
const CoordinatorProposalTaskSpecDraft = z
  .object({ title: z.string().min(1), spec: z.string().min(1) })
  .strict();
const CoordinatorProposalCreateOperation = CoordinatorProposalOperationBase.and(
  z
    .object({
      decision: z.literal("create"),
      planning_feedback: z.union([
        CoordinatorProposalPlanningFeedback,
        z.null(),
      ]),
      task_spec_draft: z.union([CoordinatorProposalTaskSpecDraft, z.null()]),
    })
    .strict()
);
const CoordinatorProposalKeepOperation = CoordinatorProposalOperationBase.and(
  z
    .object({
      decision: z.literal("keep"),
      keep_reason: z.string().min(1),
      planning_feedback: z.null(),
      task_id: z.string().min(1),
      task_spec_draft: z.null(),
    })
    .strict()
);
const CoordinatorProposalDeleteOperation = CoordinatorProposalOperationBase.and(
  z
    .object({
      decision: z.literal("delete"),
      delete_reason: z.string().min(1),
      planning_feedback: CoordinatorProposalPlanningFeedback,
      task_id: z.string().min(1),
      task_spec_draft: z.null(),
    })
    .strict()
);
const CoordinatorProposalOperation = z.union([
  CoordinatorProposalCreateOperation,
  CoordinatorProposalKeepOperation,
  CoordinatorProposalDeleteOperation,
]);
const CoordinatorProposalDryRunResponse = z
  .object({
    dry_run: z.literal(true),
    operations: z.array(CoordinatorProposalOperation),
  })
  .strict();
const CreateTaskRequest = z
  .object({
    title: z.string().min(1),
    task_spec: z.string().min(1),
    project_id: z.string().uuid(),
    dependencies: z.array(z.string().min(1)).optional(),
    result: z.string().optional().default(""),
    session_id: z.union([z.string(), z.null()]).optional(),
    worktree_path: z.union([z.string(), z.null()]).optional(),
    pull_request_url: z.union([z.string(), z.null()]).optional(),
  })
  .strict();
const Task = z
  .object({
    task_id: z.string().min(1),
    task_spec: z.string().min(1),
    title: z.string().min(1),
    project_id: z.string().uuid(),
    git_origin_url: z.string().min(1),
    global_provider_id: z.string().min(1),
    global_model_id: z.string().min(1),
    result: z.string(),
    source_metadata: z.object({}).partial().strict().passthrough(),
    source_baseline_freshness: z
      .object({
        status: z.enum(["current", "stale", "unknown"]),
        source_commit: z.union([z.string(), z.null()]),
        current_commit: z.union([z.string(), z.null()]),
        summary: z.string().min(1),
      })
      .strict(),
    opencode_session: z.union([OpenCodeSession, z.null()]).optional(),
    session_id: z.union([z.string(), z.null()]),
    worktree_path: z.union([z.string(), z.null()]),
    pull_request_url: z.union([z.string(), z.null()]),
    dependencies: z.array(z.string().min(1)),
    done: z.boolean(),
    status: z.enum(["pending", "resolved", "rejected"]),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
  })
  .strict();
const TaskListResponse = z.object({ items: z.array(Task) }).strict();
const PatchTaskRequest = z
  .object({
    task_spec: z.string().min(1),
    session_id: z.union([z.string(), z.null()]),
    worktree_path: z.union([z.string(), z.null()]),
    pull_request_url: z.union([z.string(), z.null()]),
    dependencies: z.array(z.string().min(1)),
    result: z.string(),
  })
  .partial()
  .strict();
const TaskWorktreePathRequest = z
  .object({ worktree_path: z.union([z.string(), z.null()]) })
  .strict();
const TaskPullRequestUrlRequest = z
  .object({ pull_request_url: z.union([z.string(), z.null()]) })
  .strict();
const TaskDependenciesRequest = z
  .object({ dependencies: z.array(z.string().min(1)) })
  .strict();
const TaskPullRequestFollowupCategory = z.enum([
  "no_pull_request",
  "waiting_for_assignment",
  "session_pending_stale",
  "worktree_created_no_pr",
  "needs_developer_continue",
  "waiting_checks",
  "failed_checks",
  "review_blocked",
  "merge_conflict",
  "auto_merge_unavailable",
  "ready_to_merge",
  "merged_but_not_resolved",
  "closed_abandoned",
  "pull_request_unavailable",
]);
const TaskPullRequestStatusResponse = z
  .object({
    category: TaskPullRequestFollowupCategory,
    summary: z.string().min(1),
    recovery_action: z.string().min(1),
    task_status: z.enum(["pending", "resolved", "rejected"]),
    task_done: z.boolean(),
    pull_request_url: z.union([z.string(), z.null()]),
  })
  .strict();
const CreateTaskBatchTask = z
  .object({
    task_id: z.string().uuid(),
    title: z.string().min(1),
    spec: z.string().min(1),
    dependencies: z.array(z.string().min(1)).optional(),
    result: z.string().optional().default(""),
    session_id: z.union([z.string(), z.null()]).optional(),
    worktree_path: z.union([z.string(), z.null()]).optional(),
    pull_request_url: z.union([z.string(), z.null()]).optional(),
    source_metadata: z.object({}).partial().strict().passthrough().optional(),
  })
  .strict();
const CreateTaskBatchOperation = z
  .object({ type: z.literal("create"), task: CreateTaskBatchTask })
  .strict();
const DeleteTaskBatchOperation = z
  .object({
    type: z.literal("delete"),
    task_id: z.string().uuid(),
    delete_reason: z.string().min(1),
  })
  .strict();
const TaskBatchOperation = z.discriminatedUnion("type", [
  CreateTaskBatchOperation,
  DeleteTaskBatchOperation,
]);
const CreateTaskBatchRequest = z
  .object({
    project_id: z.string().uuid(),
    operations: z.array(TaskBatchOperation).min(1),
  })
  .strict();
const TaskBatchOperationResult = z
  .object({ type: z.enum(["create", "delete"]), task_id: z.string().uuid() })
  .strict();
const TaskBatchResponse = z
  .object({ results: z.array(TaskBatchOperationResult) })
  .strict();
const CreateDimensionRequest = z
  .object({
    project_id: z.string().uuid(),
    name: z.string().min(1),
    goal: z.string().min(1),
    evaluation_method: z.string().min(1),
  })
  .strict();
const Dimension = z
  .object({
    id: z.string().min(1),
    project_id: z.string().uuid(),
    name: z.string().min(1),
    goal: z.string().min(1),
    evaluation_method: z.string().min(1),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
  })
  .strict();
const DimensionListResponse = z.object({ items: z.array(Dimension) }).strict();
const PatchDimensionRequest = z
  .object({
    name: z.string().min(1),
    goal: z.string().min(1),
    evaluation_method: z.string().min(1),
  })
  .partial()
  .strict();
const DimensionEvaluation = z
  .object({
    id: z.string().min(1),
    dimension_id: z.string().min(1),
    project_id: z.string().uuid(),
    commit_sha: z.string().min(1),
    evaluator_model: z.string().min(1),
    score: z.number().int().gte(0).lte(100),
    evaluation: z.string().min(1),
    created_at: z.string().datetime({ offset: true }),
  })
  .strict();
const DimensionEvaluationListResponse = z
  .object({ items: z.array(DimensionEvaluation) })
  .strict();
const CreateDimensionEvaluationRequest = z
  .object({
    project_id: z.string().uuid(),
    commit_sha: z.string().min(1),
    evaluator_model: z.string().min(1),
    score: z.number().int().gte(0).lte(100),
    evaluation: z.string().min(1),
  })
  .strict();

export const schemas = {
  HealthResponse,
  HealthError,
  OpenCodeModelCombination,
  OpenCodeModelsResponse,
  ErrorResponse,
  OpenCodeSessionState,
  OpenCodeSession,
  OpenCodeSessionListResponse,
  CreateOpenCodeSessionRequest,
  OpenCodeSessionContinueCounts,
  OpenCodeSessionContinueStatus,
  OpenCodeSessionContinueResult,
  OpenCodeSessionContinueBulkResponse,
  PatchOpenCodeSessionRequest,
  OpenCodeSessionSettleRequest,
  CreateProjectRequest,
  Project,
  ProjectListResponse,
  PatchProjectRequest,
  ProjectOptimizerTokenUsageAvailability,
  ProjectTokenUsageTotals,
  ProjectTokenBudgetWarningStatus,
  ProjectTokenBudgetWarning,
  ProjectOptimizerTokenUsageSummary,
  ProjectOptimizerStatusResponse,
  ProjectTokenUsageFailure,
  ProjectTokenUsageTask,
  ProjectTokenUsageSession,
  ProjectTokenUsageResponse,
  DirectorClarificationKind,
  DirectorClarificationStatus,
  DirectorClarification,
  DirectorClarificationListResponse,
  CreateDirectorClarificationRequest,
  PatchDirectorClarificationRequest,
  CoordinatorProposalSourceDimension,
  CoordinatorProposalSourceEvaluation,
  CoordinatorProposalEvaluationGap,
  CoordinatorProposalTaskPoolItem,
  CoordinatorProposalStaleTaskFeedback,
  CreateCoordinatorProposalDryRunRequest,
  CoordinatorProposalCoverageJudgment,
  CoordinatorProposalDependencyConflictPlan,
  CoordinatorProposalSourceMetadataPlanningEvidence,
  CoordinatorProposalOperationBase,
  CoordinatorProposalPlanningFeedback,
  CoordinatorProposalTaskSpecDraft,
  CoordinatorProposalCreateOperation,
  CoordinatorProposalKeepOperation,
  CoordinatorProposalDeleteOperation,
  CoordinatorProposalOperation,
  CoordinatorProposalDryRunResponse,
  CreateTaskRequest,
  Task,
  TaskListResponse,
  PatchTaskRequest,
  TaskWorktreePathRequest,
  TaskPullRequestUrlRequest,
  TaskDependenciesRequest,
  TaskPullRequestFollowupCategory,
  TaskPullRequestStatusResponse,
  CreateTaskBatchTask,
  CreateTaskBatchOperation,
  DeleteTaskBatchOperation,
  TaskBatchOperation,
  CreateTaskBatchRequest,
  TaskBatchOperationResult,
  TaskBatchResponse,
  CreateDimensionRequest,
  Dimension,
  DimensionListResponse,
  PatchDimensionRequest,
  DimensionEvaluation,
  DimensionEvaluationListResponse,
  CreateDimensionEvaluationRequest,
};
