import type { infer as Infer, input as Input, output as Output } from "zod";

import { schemas } from "../generated/zod.js";

export type { OpenApiDocument } from "./openapi.js";
export {
  healthPath,
  managerReportByIdPath,
  managerReportsPath,
  openApiDocument,
  opencodeModelsPath,
  taskByIdPath,
  taskDependenciesPath,
  taskPullRequestUrlPath,
  taskRejectPath,
  taskResolvePath,
  taskSpecPath,
  tasksPath,
  taskWorktreePathPath,
  taskWriteBulkByIdPath,
  taskWriteBulksPath,
} from "./openapi.js";
export const healthResponseSchema = schemas.HealthResponse;
export const healthStatusSchema = healthResponseSchema.shape.status;
export const healthErrorSchema = schemas.HealthError;
export const healthErrorCodeSchema = healthErrorSchema.shape.code;
export const taskSchema = schemas.Task;
export const createTaskRequestSchema = schemas.CreateTaskRequest;
export const patchTaskRequestSchema = schemas.PatchTaskRequest;
export const taskWorktreePathRequestSchema = schemas.TaskWorktreePathRequest;
export const taskPullRequestUrlRequestSchema =
  schemas.TaskPullRequestUrlRequest;
export const taskDependenciesRequestSchema = schemas.TaskDependenciesRequest;
export const taskResultRequestSchema = schemas.TaskResultRequest;
export const taskListResponseSchema = schemas.TaskListResponse;
export const managerReportSchema = schemas.ManagerReport;
export const createManagerReportRequestSchema =
  schemas.CreateManagerReportRequest;
export const managerReportListResponseSchema =
  schemas.ManagerReportListResponse;
export const taskWriteBulkSchema = schemas.TaskWriteBulk;
export const taskWriteBulkEntrySchema = schemas.TaskWriteBulkEntry;
export const createTaskWriteBulkRequestSchema =
  schemas.CreateTaskWriteBulkRequest;
export const taskWriteBulkListResponseSchema =
  schemas.TaskWriteBulkListResponse;
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
export type TaskWorktreePathRequest = Infer<
  typeof taskWorktreePathRequestSchema
>;
export type TaskPullRequestUrlRequest = Infer<
  typeof taskPullRequestUrlRequestSchema
>;
export type TaskDependenciesRequest = Infer<
  typeof taskDependenciesRequestSchema
>;
export type TaskResultRequest = Infer<typeof taskResultRequestSchema>;
export type TaskListResponse = Infer<typeof taskListResponseSchema>;
export type ManagerReport = Infer<typeof managerReportSchema>;
export type CreateManagerReportRequest = Input<
  typeof createManagerReportRequestSchema
>;
export type ManagerReportListResponse = Infer<
  typeof managerReportListResponseSchema
>;
export type TaskWriteBulk = Infer<typeof taskWriteBulkSchema>;
export type TaskWriteBulkEntry = Infer<typeof taskWriteBulkEntrySchema>;
export type CreateTaskWriteBulkRequest = Input<
  typeof createTaskWriteBulkRequestSchema
>;
export type TaskWriteBulkListResponse = Infer<
  typeof taskWriteBulkListResponseSchema
>;
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
export type TaskWorktreePathRequestSchema =
  typeof taskWorktreePathRequestSchema;
export type TaskPullRequestUrlRequestSchema =
  typeof taskPullRequestUrlRequestSchema;
export type TaskDependenciesRequestSchema =
  typeof taskDependenciesRequestSchema;
export type TaskResultRequestSchema = typeof taskResultRequestSchema;
export type TaskListResponseSchema = typeof taskListResponseSchema;
export type ManagerReportSchema = typeof managerReportSchema;
export type CreateManagerReportRequestSchema =
  typeof createManagerReportRequestSchema;
export type ManagerReportListResponseSchema =
  typeof managerReportListResponseSchema;
export type TaskWriteBulkSchema = typeof taskWriteBulkSchema;
export type TaskWriteBulkEntrySchema = typeof taskWriteBulkEntrySchema;
export type CreateTaskWriteBulkRequestSchema =
  typeof createTaskWriteBulkRequestSchema;
export type TaskWriteBulkListResponseSchema =
  typeof taskWriteBulkListResponseSchema;
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
export type ParsedTaskWorktreePathRequest = TaskWorktreePathRequest;
export type ParsedTaskPullRequestUrlRequest = TaskPullRequestUrlRequest;
export type ParsedTaskDependenciesRequest = TaskDependenciesRequest;
export type ParsedTaskResultRequest = TaskResultRequest;
export type ParsedTaskListResponse = TaskListResponse;
export type ParsedManagerReport = ManagerReport;
export type ParsedCreateManagerReportRequest = Output<
  typeof createManagerReportRequestSchema
>;
export type ParsedManagerReportListResponse = ManagerReportListResponse;
export type ParsedTaskWriteBulk = TaskWriteBulk;
export type ParsedTaskWriteBulkEntry = TaskWriteBulkEntry;
export type ParsedCreateTaskWriteBulkRequest = Output<
  typeof createTaskWriteBulkRequestSchema
>;
export type ParsedTaskWriteBulkListResponse = TaskWriteBulkListResponse;
export type ParsedOpenCodeModelCombination = OpenCodeModelCombination;
export type ParsedOpenCodeModelsResponse = OpenCodeModelsResponse;
export type ParsedTaskError = TaskError;

export type { ContractClient, ContractClientOptions } from "./client.js";
export { ContractClientError, createContractClient } from "./client.js";
