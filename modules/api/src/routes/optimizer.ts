import {
  optimizerStartPath,
  optimizerStatusPath,
  optimizerStatusResponseSchema,
  optimizerStopPath,
} from "@aim-ai/contract";
import type { Hono } from "hono";

import type { OptimizerRuntime } from "../optimizer-runtime.js";

export const registerOptimizerRoutes = (
  app: Hono,
  runtime: OptimizerRuntime,
) => {
  const statusPayload = () =>
    optimizerStatusResponseSchema.parse(runtime.getStatus());

  app.get(optimizerStatusPath, (context) => context.json(statusPayload(), 200));

  app.post(optimizerStartPath, (context) => {
    runtime.start();

    return context.json(statusPayload(), 200);
  });

  app.post(optimizerStopPath, async (context) => {
    await runtime.disable();

    return context.json(statusPayload(), 200);
  });
};
