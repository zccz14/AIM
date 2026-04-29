import { openApiDocument as generatedOpenApiDocument } from "../generated/openapi.js";

export type OpenApiDocument = typeof generatedOpenApiDocument;

export const dbSqlitePath = "/db/sqlite";
export const healthPath = "/health";
export const dimensionByIdPath = "/dimensions/{dimensionId}";
export const dimensionEvaluationsPath = "/dimensions/{dimensionId}/evaluations";
export const dimensionsPath = "/dimensions";
export const opencodeModelsPath = "/opencode/models";
export const openCodeSessionsPath = "/opencode/sessions";
export const openCodeSessionByIdPath = "/opencode/sessions/{sessionId}";
export const openCodeSessionContinuePendingPath =
  "/opencode/sessions/continue_pending";
export const openCodeSessionContinuePath =
  "/opencode/sessions/{sessionId}/continue";
export const openCodeSessionResolvePath =
  "/opencode/sessions/{sessionId}/resolve";
export const openCodeSessionRejectPath =
  "/opencode/sessions/{sessionId}/reject";
export const projectsPath = "/projects";
export const projectByIdPath = "/projects/{projectId}";
export const projectDirectorClarificationsPath =
  "/projects/{projectId}/director/clarifications";
export const projectDirectorClarificationByIdPath =
  "/projects/{projectId}/director/clarifications/{clarificationId}";
export const projectOptimizerStatusPath =
  "/projects/{projectId}/optimizer/status";
export const tasksPath = "/tasks";
export const tasksBatchPath = "/tasks/batch";
export const taskByIdPath = "/tasks/{taskId}";
export const taskWorktreePathPath = "/tasks/{taskId}/worktree_path";
export const taskPullRequestUrlPath = "/tasks/{taskId}/pull_request_url";
export const taskPullRequestStatusPath = "/tasks/{taskId}/pull_request_status";
export const taskDependenciesPath = "/tasks/{taskId}/dependencies";
export const taskSpecPath = "/tasks/{taskId}/spec";
export const openApiDocument: OpenApiDocument = generatedOpenApiDocument;
