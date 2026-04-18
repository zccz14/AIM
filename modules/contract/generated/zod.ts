import { z } from "zod";

const HealthResponse = z.object({ status: z.literal("ok") }).passthrough();
const HealthError = z
  .object({ code: z.literal("UNAVAILABLE"), message: z.string().min(1) })
  .passthrough();

export const schemas = {
  HealthResponse,
  HealthError,
};
