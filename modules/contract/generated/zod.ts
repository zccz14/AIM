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
      "MANAGER_REPORT_NOT_FOUND",
      "MANAGER_REPORT_CONFLICT",
      "MANAGER_REPORT_VALIDATION_ERROR",
      "TASK_WRITE_BULK_NOT_FOUND",
      "TASK_WRITE_BULK_CONFLICT",
      "TASK_WRITE_BULK_VALIDATION_ERROR",
      "COORDINATE_NOT_FOUND",
      "COORDINATE_VALIDATION_ERROR",
      "OPENCODE_MODELS_UNAVAILABLE",
    ]),
    message: z.string().min(1),
  })
  .strict();
const CreateTaskRequest = z
  .object({
    title: z.string().min(1),
    task_spec: z.string().min(1),
    project_path: z.string().min(1),
    developer_provider_id: z.string().min(1),
    developer_model_id: z.string().min(1),
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
    project_path: z.string().min(1),
    developer_provider_id: z.string().min(1),
    developer_model_id: z.string().min(1),
    result: z.string(),
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
const TaskResultRequest = z
  .object({
    result: z
      .string()
      .min(1)
      .regex(/^(?!\s*$).+/),
  })
  .strict();
const SourceMetadataEntry = z
  .object({ key: z.string().min(1), value: z.string() })
  .strict();
const CreateManagerReportRequest = z
  .object({
    project_path: z.string().min(1),
    report_id: z.string().min(1),
    content_markdown: z.string().min(1),
    baseline_ref: z.union([z.string(), z.null()]).optional(),
    source_metadata: z.array(SourceMetadataEntry).optional(),
  })
  .strict();
const ManagerReport = z
  .object({
    project_path: z.string().min(1),
    report_id: z.string().min(1),
    content_markdown: z.string().min(1),
    baseline_ref: z.union([z.string(), z.null()]),
    source_metadata: z.array(SourceMetadataEntry),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
  })
  .strict();
const ManagerReportListResponse = z
  .object({ items: z.array(ManagerReport) })
  .strict();
const TaskWriteBulkCreateFields = z
  .object({
    candidate_task_spec: z.string().min(1),
    project_path: z.string().min(1),
    dependencies: z.array(z.string().min(1)),
    verification_route: z.string().min(1),
  })
  .strict();
const TaskWriteBulkDeleteFields = z
  .object({
    target_task_id: z.string().min(1),
    delete_reason: z.string().min(1),
    replacement: z.union([z.string(), z.null()]),
  })
  .strict();
const TaskWriteBulkEntry = z
  .object({
    id: z.string().min(1),
    action: z.enum(["Create", "Delete"]),
    depends_on: z.array(z.string().min(1)),
    reason: z.string().min(1),
    source: z.string().min(1),
    create: z.union([TaskWriteBulkCreateFields, z.null()]),
    delete: z.union([TaskWriteBulkDeleteFields, z.null()]),
  })
  .strict();
const CreateTaskWriteBulkRequest = z
  .object({
    project_path: z.string().min(1),
    bulk_id: z.string().min(1),
    content_markdown: z.string().min(1),
    entries: z.array(TaskWriteBulkEntry),
    baseline_ref: z.union([z.string(), z.null()]).optional(),
    source_metadata: z.array(SourceMetadataEntry).optional(),
  })
  .strict();
const TaskWriteBulk = z
  .object({
    project_path: z.string().min(1),
    bulk_id: z.string().min(1),
    content_markdown: z.string().min(1),
    entries: z.array(TaskWriteBulkEntry),
    baseline_ref: z.union([z.string(), z.null()]),
    source_metadata: z.array(SourceMetadataEntry),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
  })
  .strict();
const TaskWriteBulkListResponse = z
  .object({ items: z.array(TaskWriteBulk) })
  .strict();
const CreateCoordinateRequest = z
  .object({
    project_path: z.string().min(1),
    name: z.string().min(1),
    goal: z.string().min(1),
    evaluation_method: z.string().min(1),
  })
  .strict();
const Coordinate = z
  .object({
    id: z.string().min(1),
    project_path: z.string().min(1),
    name: z.string().min(1),
    goal: z.string().min(1),
    evaluation_method: z.string().min(1),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
  })
  .strict();
const CoordinateListResponse = z
  .object({ items: z.array(Coordinate) })
  .strict();
const PatchCoordinateRequest = z
  .object({
    name: z.string().min(1),
    goal: z.string().min(1),
    evaluation_method: z.string().min(1),
  })
  .partial()
  .strict();
const CoordinateEvaluation = z
  .object({
    id: z.string().min(1),
    coordinate_id: z.string().min(1),
    project_path: z.string().min(1),
    commit_sha: z.string().min(1),
    evaluator_model: z.string().min(1),
    score: z.number().int().gte(0).lte(100),
    evaluation: z.string().min(1),
    created_at: z.string().datetime({ offset: true }),
  })
  .strict();
const CoordinateEvaluationListResponse = z
  .object({ items: z.array(CoordinateEvaluation) })
  .strict();
const CreateCoordinateEvaluationRequest = z
  .object({
    project_path: z.string().min(1),
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
  CreateTaskRequest,
  Task,
  TaskListResponse,
  PatchTaskRequest,
  TaskWorktreePathRequest,
  TaskPullRequestUrlRequest,
  TaskDependenciesRequest,
  TaskResultRequest,
  SourceMetadataEntry,
  CreateManagerReportRequest,
  ManagerReport,
  ManagerReportListResponse,
  TaskWriteBulkCreateFields,
  TaskWriteBulkDeleteFields,
  TaskWriteBulkEntry,
  CreateTaskWriteBulkRequest,
  TaskWriteBulk,
  TaskWriteBulkListResponse,
  CreateCoordinateRequest,
  Coordinate,
  CoordinateListResponse,
  PatchCoordinateRequest,
  CoordinateEvaluation,
  CoordinateEvaluationListResponse,
  CreateCoordinateEvaluationRequest,
};
