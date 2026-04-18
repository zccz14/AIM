import {
  type HealthResponse,
  healthPath,
  healthResponseSchema,
} from "@aim-ai/contract";
import type { Hono } from "hono";

export const registerHealthRoute = (app: Hono) => {
  app.get(healthPath, (context) => {
    const payload: HealthResponse = healthResponseSchema.parse({
      status: "ok",
    });

    return context.json(payload, 200);
  });
};
