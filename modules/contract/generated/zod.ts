import { z } from "zod";

const HealthResponse = z
  .object({ status: z.literal("ok") })
  .strict()
  .passthrough();
const HealthError = z
  .object({ code: z.literal("UNAVAILABLE"), message: z.string().min(1) })
  .strict()
  .passthrough();
const CreateTaskRequest = z
  .object({
    task_spec: z.string().min(1),
    project_path: z.string().min(1),
    dependencies: z.array(z.string().min(1)).optional(),
    result: z.string().optional().default(""),
    session_id: z.union([z.string(), z.null()]).optional(),
    worktree_path: z.union([z.string(), z.null()]).optional(),
    pull_request_url: z.union([z.string(), z.null()]).optional(),
    status: z
      .enum([
        "created",
        "waiting_assumptions",
        "running",
        "outbound",
        "pr_following",
        "closing",
        "succeeded",
        "failed",
      ])
      .optional(),
  })
  .strict();
const Task = z
  .object({
    task_id: z.string().min(1),
    task_spec: z.string().min(1),
    project_path: z.string().min(1),
    result: z.string(),
    session_id: z.union([z.string(), z.null()]),
    worktree_path: z.union([z.string(), z.null()]),
    pull_request_url: z.union([z.string(), z.null()]),
    dependencies: z.array(z.string().min(1)),
    done: z.boolean(),
    status: z.enum([
      "created",
      "waiting_assumptions",
      "running",
      "outbound",
      "pr_following",
      "closing",
      "succeeded",
      "failed",
    ]),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
  })
  .strict();
const ErrorResponse = z
  .object({
    code: z.enum([
      "TASK_NOT_FOUND",
      "TASK_CONFLICT",
      "TASK_VALIDATION_ERROR",
      "TASK_UNSUPPORTED_STATUS",
    ]),
    message: z.string().min(1),
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
    status: z.enum([
      "created",
      "waiting_assumptions",
      "running",
      "outbound",
      "pr_following",
      "closing",
      "succeeded",
      "failed",
    ]),
  })
  .partial()
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
  CreateTaskRequest,
  Task,
  ErrorResponse,
  TaskListResponse,
  PatchTaskRequest,
  TaskResultRequest,
};
