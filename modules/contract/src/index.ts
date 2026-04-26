import type { infer as Infer, input as Input, output as Output } from "zod";

import { schemas } from "../generated/zod.js";

export type { OpenApiDocument } from "./openapi.js";
export {
  dimensionByIdPath,
  dimensionEvaluationsPath,
  dimensionsPath,
  healthPath,
  openApiDocument,
  opencodeModelsPath,
  optimizerStartPath,
  optimizerStatusPath,
  optimizerStopPath,
  projectByIdPath,
  projectsPath,
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
export const dimensionSchema = schemas.Dimension;
export const createDimensionRequestSchema = schemas.CreateDimensionRequest;
export const patchDimensionRequestSchema = schemas.PatchDimensionRequest;
export const dimensionListResponseSchema = schemas.DimensionListResponse;
export const dimensionEvaluationSchema = schemas.DimensionEvaluation;
export const createDimensionEvaluationRequestSchema =
  schemas.CreateDimensionEvaluationRequest;
export const dimensionEvaluationListResponseSchema =
  schemas.DimensionEvaluationListResponse;
export const healthResponseSchema = schemas.HealthResponse;
export const healthStatusSchema = healthResponseSchema.shape.status;
export const healthErrorSchema = schemas.HealthError;
export const healthErrorCodeSchema = healthErrorSchema.shape.code;
export const projectSchema = schemas.Project;
export const createProjectRequestSchema = schemas.CreateProjectRequest;
export const patchProjectRequestSchema = schemas.PatchProjectRequest;
export const projectListResponseSchema = schemas.ProjectListResponse;
export const taskSchema = schemas.Task;
export const createTaskRequestSchema = schemas.CreateTaskRequest;
export const patchTaskRequestSchema = schemas.PatchTaskRequest;
export const taskWorktreePathRequestSchema = schemas.TaskWorktreePathRequest;
export const taskPullRequestUrlRequestSchema =
  schemas.TaskPullRequestUrlRequest;
export const taskDependenciesRequestSchema = schemas.TaskDependenciesRequest;
export const taskResultRequestSchema = schemas.TaskResultRequest;
export const taskListResponseSchema = schemas.TaskListResponse;
export const taskWriteBulkSchema = schemas.TaskWriteBulk;
export const taskWriteBulkEntrySchema = schemas.TaskWriteBulkEntry;
export const createTaskWriteBulkRequestSchema =
  schemas.CreateTaskWriteBulkRequest;
export const taskWriteBulkListResponseSchema =
  schemas.TaskWriteBulkListResponse;
export const opencodeModelCombinationSchema = schemas.OpenCodeModelCombination;
export const opencodeModelsResponseSchema = schemas.OpenCodeModelsResponse;
export const optimizerStatusResponseSchema = schemas.OptimizerStatusResponse;
export const taskErrorSchema = schemas.ErrorResponse;
export const taskStatusSchema = taskSchema.shape.status;
export const taskErrorCodeSchema = taskErrorSchema.shape.code;

export type HealthResponse = Infer<typeof healthResponseSchema>;
export type Dimension = Infer<typeof dimensionSchema>;
export type CreateDimensionRequest = Input<typeof createDimensionRequestSchema>;
export type PatchDimensionRequest = Infer<typeof patchDimensionRequestSchema>;
export type DimensionListResponse = Infer<typeof dimensionListResponseSchema>;
export type DimensionEvaluation = Infer<typeof dimensionEvaluationSchema>;
export type CreateDimensionEvaluationRequest = Input<
  typeof createDimensionEvaluationRequestSchema
>;
export type DimensionEvaluationListResponse = Infer<
  typeof dimensionEvaluationListResponseSchema
>;
export type HealthStatus = Infer<typeof healthStatusSchema>;
export type HealthError = Infer<typeof healthErrorSchema>;
export type HealthErrorCode = Infer<typeof healthErrorCodeSchema>;
export type Project = Infer<typeof projectSchema>;
export type CreateProjectRequest = Input<typeof createProjectRequestSchema>;
export type PatchProjectRequest = Infer<typeof patchProjectRequestSchema>;
export type ProjectListResponse = Infer<typeof projectListResponseSchema>;
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
export type OptimizerStatusResponse = Infer<
  typeof optimizerStatusResponseSchema
>;
export type TaskError = Infer<typeof taskErrorSchema>;
export type TaskStatus = Infer<typeof taskStatusSchema>;
export type TaskErrorCode = Infer<typeof taskErrorCodeSchema>;
export type HealthResponseSchema = typeof healthResponseSchema;
export type DimensionSchema = typeof dimensionSchema;
export type CreateDimensionRequestSchema = typeof createDimensionRequestSchema;
export type PatchDimensionRequestSchema = typeof patchDimensionRequestSchema;
export type DimensionListResponseSchema = typeof dimensionListResponseSchema;
export type DimensionEvaluationSchema = typeof dimensionEvaluationSchema;
export type CreateDimensionEvaluationRequestSchema =
  typeof createDimensionEvaluationRequestSchema;
export type DimensionEvaluationListResponseSchema =
  typeof dimensionEvaluationListResponseSchema;
export type HealthStatusSchema = typeof healthStatusSchema;
export type HealthErrorSchema = typeof healthErrorSchema;
export type HealthErrorCodeSchema = typeof healthErrorCodeSchema;
export type ProjectSchema = typeof projectSchema;
export type CreateProjectRequestSchema = typeof createProjectRequestSchema;
export type PatchProjectRequestSchema = typeof patchProjectRequestSchema;
export type ProjectListResponseSchema = typeof projectListResponseSchema;
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
export type TaskWriteBulkSchema = typeof taskWriteBulkSchema;
export type TaskWriteBulkEntrySchema = typeof taskWriteBulkEntrySchema;
export type CreateTaskWriteBulkRequestSchema =
  typeof createTaskWriteBulkRequestSchema;
export type TaskWriteBulkListResponseSchema =
  typeof taskWriteBulkListResponseSchema;
export type OpenCodeModelCombinationSchema =
  typeof opencodeModelCombinationSchema;
export type OpenCodeModelsResponseSchema = typeof opencodeModelsResponseSchema;
export type OptimizerStatusResponseSchema =
  typeof optimizerStatusResponseSchema;
export type TaskErrorSchema = typeof taskErrorSchema;
export type TaskStatusSchema = typeof taskStatusSchema;
export type TaskErrorCodeSchema = typeof taskErrorCodeSchema;
export type ParsedHealthResponse = HealthResponse;
export type ParsedDimension = Dimension;
export type ParsedCreateDimensionRequest = Output<
  typeof createDimensionRequestSchema
>;
export type ParsedPatchDimensionRequest = PatchDimensionRequest;
export type ParsedDimensionListResponse = DimensionListResponse;
export type ParsedDimensionEvaluation = DimensionEvaluation;
export type ParsedCreateDimensionEvaluationRequest = Output<
  typeof createDimensionEvaluationRequestSchema
>;
export type ParsedDimensionEvaluationListResponse =
  DimensionEvaluationListResponse;
export type ParsedHealthError = HealthError;
export type ParsedProject = Project;
export type ParsedCreateProjectRequest = Output<
  typeof createProjectRequestSchema
>;
export type ParsedPatchProjectRequest = PatchProjectRequest;
export type ParsedProjectListResponse = ProjectListResponse;
export type ParsedTask = Task;
export type ParsedCreateTaskRequest = Output<typeof createTaskRequestSchema>;
export type ParsedPatchTaskRequest = PatchTaskRequest;
export type ParsedTaskWorktreePathRequest = TaskWorktreePathRequest;
export type ParsedTaskPullRequestUrlRequest = TaskPullRequestUrlRequest;
export type ParsedTaskDependenciesRequest = TaskDependenciesRequest;
export type ParsedTaskResultRequest = TaskResultRequest;
export type ParsedTaskListResponse = TaskListResponse;
export type ParsedTaskWriteBulk = TaskWriteBulk;
export type ParsedTaskWriteBulkEntry = TaskWriteBulkEntry;
export type ParsedCreateTaskWriteBulkRequest = Output<
  typeof createTaskWriteBulkRequestSchema
>;
export type ParsedTaskWriteBulkListResponse = TaskWriteBulkListResponse;
export type ParsedOpenCodeModelCombination = OpenCodeModelCombination;
export type ParsedOpenCodeModelsResponse = OpenCodeModelsResponse;
export type ParsedOptimizerStatusResponse = OptimizerStatusResponse;
export type ParsedTaskError = TaskError;

export type { ContractClient, ContractClientOptions } from "./client.js";
export { ContractClientError, createContractClient } from "./client.js";
