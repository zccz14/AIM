import type { infer as Infer, input as Input, output as Output } from "zod";

import { schemas } from "../generated/zod.js";

export type { OpenApiDocument } from "./openapi.js";
export {
  healthPath,
  openApiDocument,
  opencodeModelsPath,
  taskByIdPath,
  taskRejectPath,
  taskResolvePath,
  taskSpecPath,
  tasksPath,
} from "./openapi.js";
export const healthResponseSchema = schemas.HealthResponse;
export const healthStatusSchema = healthResponseSchema.shape.status;
export const healthErrorSchema = schemas.HealthError;
export const healthErrorCodeSchema = healthErrorSchema.shape.code;
export const taskSchema = schemas.Task;
export const createTaskRequestSchema = schemas.CreateTaskRequest;
export const patchTaskRequestSchema = schemas.PatchTaskRequest;
export const taskResultRequestSchema = schemas.TaskResultRequest;
export const taskListResponseSchema = schemas.TaskListResponse;
export const opencodeModelCombinationSchema = schemas.OpenCodeModelCombination;
export const opencodeModelsResponseSchema = schemas.OpenCodeModelsResponse;
export const taskErrorSchema = schemas.ErrorResponse;
export const taskStatusSchema = taskSchema.shape.status;
export const taskErrorCodeSchema = taskErrorSchema.shape.code;

export type HealthResponse = Infer<typeof healthResponseSchema>;
export type HealthStatus = Infer<typeof healthStatusSchema>;
export type HealthError = Infer<typeof healthErrorSchema>;
export type HealthErrorCode = Infer<typeof healthErrorCodeSchema>;
export type Task = Infer<typeof taskSchema>;
export type CreateTaskRequest = Input<typeof createTaskRequestSchema>;
export type PatchTaskRequest = Infer<typeof patchTaskRequestSchema>;
export type TaskResultRequest = Infer<typeof taskResultRequestSchema>;
export type TaskListResponse = Infer<typeof taskListResponseSchema>;
export type OpenCodeModelCombination = Infer<
  typeof opencodeModelCombinationSchema
>;
export type OpenCodeModelsResponse = Infer<typeof opencodeModelsResponseSchema>;
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
export type TaskResultRequestSchema = typeof taskResultRequestSchema;
export type TaskListResponseSchema = typeof taskListResponseSchema;
export type OpenCodeModelCombinationSchema =
  typeof opencodeModelCombinationSchema;
export type OpenCodeModelsResponseSchema = typeof opencodeModelsResponseSchema;
export type TaskErrorSchema = typeof taskErrorSchema;
export type TaskStatusSchema = typeof taskStatusSchema;
export type TaskErrorCodeSchema = typeof taskErrorCodeSchema;
export type ParsedHealthResponse = HealthResponse;
export type ParsedHealthError = HealthError;
export type ParsedTask = Task;
export type ParsedCreateTaskRequest = Output<typeof createTaskRequestSchema>;
export type ParsedPatchTaskRequest = PatchTaskRequest;
export type ParsedTaskResultRequest = TaskResultRequest;
export type ParsedTaskListResponse = TaskListResponse;
export type ParsedOpenCodeModelCombination = OpenCodeModelCombination;
export type ParsedOpenCodeModelsResponse = OpenCodeModelsResponse;
export type ParsedTaskError = TaskError;

export type { ContractClient, ContractClientOptions } from "./client.js";
export { ContractClientError, createContractClient } from "./client.js";
