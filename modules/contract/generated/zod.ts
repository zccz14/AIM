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
};
