import { openApiDocument as generatedOpenApiDocument } from "../generated/openapi.js";

export type OpenApiDocument = typeof generatedOpenApiDocument;

export const healthPath = "/health";
export const tasksPath = "/tasks";
export const taskByIdPath = "/tasks/{taskId}";
export const openApiDocument: OpenApiDocument = generatedOpenApiDocument;
