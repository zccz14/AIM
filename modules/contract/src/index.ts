import type { infer as Infer, input as Input, output as Output } from "zod";

import { schemas } from "../generated/zod.js";

export type { OpenApiDocument } from "./openapi.js";
export {
  dbSqlitePath,
  dimensionByIdPath,
  dimensionEvaluationsPath,
  dimensionsPath,
  healthPath,
  openApiDocument,
  openCodeSessionByIdPath,
  openCodeSessionContinuePath,
  openCodeSessionContinuePendingPath,
  openCodeSessionRejectPath,
  openCodeSessionResolvePath,
  openCodeSessionsPath,
  opencodeModelsPath,
  projectByIdPath,
  projectOptimizerStatusPath,
  projectsPath,
  taskByIdPath,
  taskDependenciesPath,
  taskPullRequestStatusPath,
  taskPullRequestUrlPath,
  taskRejectPath,
  taskResolvePath,
  taskSpecPath,
  tasksBatchPath,
  tasksPath,
  taskWorktreePathPath,
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
export const projectOptimizerStatusResponseSchema =
  schemas.ProjectOptimizerStatusResponse;
export const openCodeSessionSchema = schemas.OpenCodeSession;
export const openCodeSessionListResponseSchema =
  schemas.OpenCodeSessionListResponse;
export const openCodeSessionContinueResultSchema =
  schemas.OpenCodeSessionContinueResult;
export const openCodeSessionContinueBulkResponseSchema =
  schemas.OpenCodeSessionContinueBulkResponse;
export const openCodeSessionStateSchema = schemas.OpenCodeSessionState;
export const createOpenCodeSessionRequestSchema =
  schemas.CreateOpenCodeSessionRequest;
export const patchOpenCodeSessionRequestSchema =
  schemas.PatchOpenCodeSessionRequest;
export const openCodeSessionSettleRequestSchema =
  schemas.OpenCodeSessionSettleRequest;
export const taskSchema = schemas.Task;
export const createTaskRequestSchema = schemas.CreateTaskRequest;
export const patchTaskRequestSchema = schemas.PatchTaskRequest;
export const taskWorktreePathRequestSchema = schemas.TaskWorktreePathRequest;
export const taskPullRequestUrlRequestSchema =
  schemas.TaskPullRequestUrlRequest;
export const taskPullRequestStatusResponseSchema =
  schemas.TaskPullRequestStatusResponse;
export const taskDependenciesRequestSchema = schemas.TaskDependenciesRequest;
export const taskResultRequestSchema = schemas.TaskResultRequest;
export const taskListResponseSchema = schemas.TaskListResponse;
export const taskBatchOperationSchema = schemas.TaskBatchOperation;
export const createTaskBatchRequestSchema = schemas.CreateTaskBatchRequest;
export const taskBatchOperationResultSchema = schemas.TaskBatchOperationResult;
export const taskBatchResponseSchema = schemas.TaskBatchResponse;
export const opencodeModelCombinationSchema = schemas.OpenCodeModelCombination;
export const opencodeModelsResponseSchema = schemas.OpenCodeModelsResponse;
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
export type ProjectOptimizerStatusResponse = Infer<
  typeof projectOptimizerStatusResponseSchema
>;
export type OpenCodeSession = Infer<typeof openCodeSessionSchema>;
export type OpenCodeSessionListResponse = Infer<
  typeof openCodeSessionListResponseSchema
>;
export type OpenCodeSessionContinueResult = Infer<
  typeof openCodeSessionContinueResultSchema
>;
export type OpenCodeSessionContinueBulkResponse = Infer<
  typeof openCodeSessionContinueBulkResponseSchema
>;
export type OpenCodeSessionState = Infer<typeof openCodeSessionStateSchema>;
export type CreateOpenCodeSessionRequest = Input<
  typeof createOpenCodeSessionRequestSchema
>;
export type PatchOpenCodeSessionRequest = Infer<
  typeof patchOpenCodeSessionRequestSchema
>;
export type OpenCodeSessionSettleRequest = Infer<
  typeof openCodeSessionSettleRequestSchema
>;
export type Task = Infer<typeof taskSchema>;
export type CreateTaskRequest = Input<typeof createTaskRequestSchema>;
export type PatchTaskRequest = Infer<typeof patchTaskRequestSchema>;
export type TaskWorktreePathRequest = Infer<
  typeof taskWorktreePathRequestSchema
>;
export type TaskPullRequestUrlRequest = Infer<
  typeof taskPullRequestUrlRequestSchema
>;
export type TaskPullRequestStatusResponse = Infer<
  typeof taskPullRequestStatusResponseSchema
>;
export type TaskDependenciesRequest = Infer<
  typeof taskDependenciesRequestSchema
>;
export type TaskResultRequest = Infer<typeof taskResultRequestSchema>;
export type TaskListResponse = Infer<typeof taskListResponseSchema>;
export type TaskBatchOperation = Infer<typeof taskBatchOperationSchema>;
export type CreateTaskBatchRequest = Input<typeof createTaskBatchRequestSchema>;
export type TaskBatchOperationResult = Infer<
  typeof taskBatchOperationResultSchema
>;
export type TaskBatchResponse = Infer<typeof taskBatchResponseSchema>;
export type OpenCodeModelCombination = Infer<
  typeof opencodeModelCombinationSchema
>;
export type OpenCodeModelsResponse = Infer<typeof opencodeModelsResponseSchema>;
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
export type ProjectOptimizerStatusResponseSchema =
  typeof projectOptimizerStatusResponseSchema;
export type OpenCodeSessionSchema = typeof openCodeSessionSchema;
export type OpenCodeSessionListResponseSchema =
  typeof openCodeSessionListResponseSchema;
export type OpenCodeSessionStateSchema = typeof openCodeSessionStateSchema;
export type CreateOpenCodeSessionRequestSchema =
  typeof createOpenCodeSessionRequestSchema;
export type PatchOpenCodeSessionRequestSchema =
  typeof patchOpenCodeSessionRequestSchema;
export type OpenCodeSessionSettleRequestSchema =
  typeof openCodeSessionSettleRequestSchema;
export type TaskSchema = typeof taskSchema;
export type CreateTaskRequestSchema = typeof createTaskRequestSchema;
export type PatchTaskRequestSchema = typeof patchTaskRequestSchema;
export type TaskWorktreePathRequestSchema =
  typeof taskWorktreePathRequestSchema;
export type TaskPullRequestUrlRequestSchema =
  typeof taskPullRequestUrlRequestSchema;
export type TaskPullRequestStatusResponseSchema =
  typeof taskPullRequestStatusResponseSchema;
export type TaskDependenciesRequestSchema =
  typeof taskDependenciesRequestSchema;
export type TaskResultRequestSchema = typeof taskResultRequestSchema;
export type TaskListResponseSchema = typeof taskListResponseSchema;
export type TaskBatchOperationSchema = typeof taskBatchOperationSchema;
export type CreateTaskBatchRequestSchema = typeof createTaskBatchRequestSchema;
export type TaskBatchOperationResultSchema =
  typeof taskBatchOperationResultSchema;
export type TaskBatchResponseSchema = typeof taskBatchResponseSchema;
export type OpenCodeModelCombinationSchema =
  typeof opencodeModelCombinationSchema;
export type OpenCodeModelsResponseSchema = typeof opencodeModelsResponseSchema;
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
export type ParsedProjectOptimizerStatusResponse =
  ProjectOptimizerStatusResponse;
export type ParsedOpenCodeSession = OpenCodeSession;
export type ParsedOpenCodeSessionListResponse = OpenCodeSessionListResponse;
export type ParsedCreateOpenCodeSessionRequest = Output<
  typeof createOpenCodeSessionRequestSchema
>;
export type ParsedPatchOpenCodeSessionRequest = PatchOpenCodeSessionRequest;
export type ParsedOpenCodeSessionSettleRequest = OpenCodeSessionSettleRequest;
export type ParsedTask = Task;
export type ParsedCreateTaskRequest = Output<typeof createTaskRequestSchema>;
export type ParsedPatchTaskRequest = PatchTaskRequest;
export type ParsedTaskWorktreePathRequest = TaskWorktreePathRequest;
export type ParsedTaskPullRequestUrlRequest = TaskPullRequestUrlRequest;
export type ParsedTaskPullRequestStatusResponse = TaskPullRequestStatusResponse;
export type ParsedTaskDependenciesRequest = TaskDependenciesRequest;
export type ParsedTaskResultRequest = TaskResultRequest;
export type ParsedTaskListResponse = TaskListResponse;
export type ParsedTaskBatchOperation = TaskBatchOperation;
export type ParsedCreateTaskBatchRequest = Output<
  typeof createTaskBatchRequestSchema
>;
export type ParsedTaskBatchOperationResult = TaskBatchOperationResult;
export type ParsedTaskBatchResponse = TaskBatchResponse;
export type ParsedOpenCodeModelCombination = OpenCodeModelCombination;
export type ParsedOpenCodeModelsResponse = OpenCodeModelsResponse;
export type ParsedTaskError = TaskError;

export type { ContractClient, ContractClientOptions } from "./client.js";
export { ContractClientError, createContractClient } from "./client.js";
