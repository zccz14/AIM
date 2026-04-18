import { openApiDocument as generatedOpenApiDocument } from "../generated/openapi.js";

export type OpenApiDocument = typeof generatedOpenApiDocument;

export const healthPath = "/health";
export const openApiDocument: OpenApiDocument = generatedOpenApiDocument;
