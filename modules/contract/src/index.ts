import type { infer as Infer } from "zod";

import { schemas } from "../generated/zod.js";

export type { OpenApiDocument } from "./openapi.js";
export {
  healthPath,
  openApiDocument,
  taskByIdPath,
  tasksPath,
} from "./openapi.js";
export const healthResponseSchema = schemas.HealthResponse;
export const healthStatusSchema = healthResponseSchema.shape.status;
export const healthErrorSchema = schemas.HealthError;
export const healthErrorCodeSchema = healthErrorSchema.shape.code;
export const taskSchema = schemas.Task;
export const createTaskRequestSchema = schemas.CreateTaskRequest;
export const patchTaskRequestSchema = schemas.PatchTaskRequest.strict();
export const taskListResponseSchema = schemas.TaskListResponse;
export const taskErrorSchema = schemas.ErrorResponse;
export const taskStatusSchema = taskSchema.shape.status;
export const taskErrorCodeSchema = taskErrorSchema.shape.code;

export type HealthResponse = Infer<typeof healthResponseSchema>;
export type HealthStatus = Infer<typeof healthStatusSchema>;
export type HealthError = Infer<typeof healthErrorSchema>;
export type HealthErrorCode = Infer<typeof healthErrorCodeSchema>;
export type Task = Infer<typeof taskSchema>;
export type CreateTaskRequest = Infer<typeof createTaskRequestSchema>;
export type PatchTaskRequest = Infer<typeof patchTaskRequestSchema>;
export type TaskListResponse = Infer<typeof taskListResponseSchema>;
export type TaskError = Infer<typeof taskErrorSchema>;
export type TaskStatus = Infer<typeof taskStatusSchema>;
export type TaskErrorCode = Infer<typeof taskErrorCodeSchema>;
export type HealthResponseSchema = typeof healthResponseSchema;
export type HealthStatusSchema = typeof healthStatusSchema;
export type HealthErrorSchema = typeof healthErrorSchema;
export type HealthErrorCodeSchema = typeof healthErrorCodeSchema;
export type TaskSchema = typeof taskSchema;
export type CreateTaskRequestSchema = typeof createTaskRequestSchema;
export type PatchTaskRequestSchema = typeof patchTaskRequestSchema;
export type TaskListResponseSchema = typeof taskListResponseSchema;
export type TaskErrorSchema = typeof taskErrorSchema;
export type TaskStatusSchema = typeof taskStatusSchema;
export type TaskErrorCodeSchema = typeof taskErrorCodeSchema;
export type ParsedHealthResponse = HealthResponse;
export type ParsedHealthError = HealthError;
export type ParsedTask = Task;
export type ParsedCreateTaskRequest = CreateTaskRequest;
export type ParsedPatchTaskRequest = PatchTaskRequest;
export type ParsedTaskListResponse = TaskListResponse;
export type ParsedTaskError = TaskError;

export type { ContractClient, ContractClientOptions } from "./client.js";
export { ContractClientError, createContractClient } from "./client.js";
