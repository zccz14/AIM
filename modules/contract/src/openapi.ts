import { openApiDocument as generatedOpenApiDocument } from "../generated/openapi.js";

export type OpenApiDocument = typeof generatedOpenApiDocument;

export const dbSqlitePath = "/db/sqlite";
export const healthPath = "/health";
export const dimensionByIdPath = "/dimensions/{dimensionId}";
export const dimensionEvaluationsPath = "/dimensions/{dimensionId}/evaluations";
export const dimensionsPath = "/dimensions";
export const opencodeModelsPath = "/opencode/models";
export const projectsPath = "/projects";
export const projectByIdPath = "/projects/{projectId}";
export const projectOptimizerStatusPath =
  "/projects/{projectId}/optimizer/status";
export const tasksPath = "/tasks";
export const tasksBatchPath = "/tasks/batch";
export const taskByIdPath = "/tasks/{taskId}";
export const taskWorktreePathPath = "/tasks/{taskId}/worktree_path";
export const taskPullRequestUrlPath = "/tasks/{taskId}/pull_request_url";
export const taskDependenciesPath = "/tasks/{taskId}/dependencies";
export const taskResolvePath = "/tasks/{taskId}/resolve";
export const taskRejectPath = "/tasks/{taskId}/reject";
export const taskSpecPath = "/tasks/{taskId}/spec";
export const openApiDocument: OpenApiDocument = generatedOpenApiDocument;
