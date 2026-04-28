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
  })
  .partial()
  .strict();
const OptimizerTriggerSource = z.literal("task_resolved");
const ProjectOptimizerRecentEvent = z
  .object({
    task_id: z.string().min(1),
    triggered_scan: z.boolean(),
    type: OptimizerTriggerSource,
  })
  .strict();
const ProjectOptimizerStatusResponse = z
  .object({
    project_id: z.string().uuid(),
    optimizer_enabled: z.boolean(),
    runtime_active: z.boolean(),
    enabled_triggers: z.array(OptimizerTriggerSource),
    recent_event: z.union([ProjectOptimizerRecentEvent, z.null()]),
    recent_scan_at: z.union([z.string(), z.null()]),
    blocker_summary: z.union([z.string(), z.null()]),
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
    status: z.enum(["processing", "resolved", "rejected"]).optional(),
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
    opencode_session: z.union([OpenCodeSession, z.null()]).optional(),
    session_id: z.union([z.string(), z.null()]),
    worktree_path: z.union([z.string(), z.null()]),
    pull_request_url: z.union([z.string(), z.null()]),
    dependencies: z.array(z.string().min(1)),
    done: z.boolean(),
    status: z.enum(["processing", "resolved", "rejected"]),
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
    status: z.enum(["processing", "resolved", "rejected"]),
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
    task_status: z.enum(["processing", "resolved", "rejected"]),
    task_done: z.boolean(),
    pull_request_url: z.union([z.string(), z.null()]),
  })
  .strict();
const TaskResultRequest = z
  .object({
    result: z
      .string()
      .min(1)
      .regex(/^(?!\s*$).+/),
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
    status: z.enum(["processing", "resolved", "rejected"]).optional(),
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
  OptimizerTriggerSource,
  ProjectOptimizerRecentEvent,
  ProjectOptimizerStatusResponse,
  CreateTaskRequest,
  Task,
  TaskListResponse,
  PatchTaskRequest,
  TaskWorktreePathRequest,
  TaskPullRequestUrlRequest,
  TaskDependenciesRequest,
  TaskPullRequestFollowupCategory,
  TaskPullRequestStatusResponse,
  TaskResultRequest,
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
