import type { infer as Infer } from "zod";

import { schemas } from "../generated/zod.js";

export type { OpenApiDocument } from "./openapi.js";
export { healthPath, openApiDocument } from "./openapi.js";
export const healthResponseSchema = schemas.HealthResponse;
export const healthStatusSchema = healthResponseSchema.shape.status;
export const healthErrorSchema = schemas.HealthError;
export const healthErrorCodeSchema = healthErrorSchema.shape.code;

export type HealthResponse = Infer<typeof healthResponseSchema>;
export type HealthStatus = Infer<typeof healthStatusSchema>;
export type HealthError = Infer<typeof healthErrorSchema>;
export type HealthErrorCode = Infer<typeof healthErrorCodeSchema>;
export type HealthResponseSchema = typeof healthResponseSchema;
export type HealthStatusSchema = typeof healthStatusSchema;
export type HealthErrorSchema = typeof healthErrorSchema;
export type HealthErrorCodeSchema = typeof healthErrorCodeSchema;
export type ParsedHealthResponse = HealthResponse;
export type ParsedHealthError = HealthError;

export type { ContractClient, ContractClientOptions } from "./client.js";
export { ContractClientError, createContractClient } from "./client.js";
