import { openApiDocument as generatedOpenApiDocument } from "../generated/openapi.js";

export type OpenApiDocument = typeof generatedOpenApiDocument;

export const healthPath = "/health";
export const managerReportByIdPath = "/manager_reports/{reportId}";
export const managerReportsPath = "/manager_reports";
export const opencodeModelsPath = "/opencode/models";
export const taskWriteBulkByIdPath = "/task_write_bulks/{bulkId}";
export const taskWriteBulksPath = "/task_write_bulks";
export const tasksPath = "/tasks";
export const taskByIdPath = "/tasks/{taskId}";
export const taskWorktreePathPath = "/tasks/{taskId}/worktree_path";
export const taskPullRequestUrlPath = "/tasks/{taskId}/pull_request_url";
export const taskDependenciesPath = "/tasks/{taskId}/dependencies";
export const taskResolvePath = "/tasks/{taskId}/resolve";
export const taskRejectPath = "/tasks/{taskId}/reject";
export const taskSpecPath = "/tasks/{taskId}/spec";
export const openApiDocument: OpenApiDocument = generatedOpenApiDocument;
