import { openApiDocument } from "@aim-ai/contract";
import { Hono } from "hono";
import { cors } from "hono/cors";

import type { ApiLogger } from "./logger.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerTaskRoutes } from "./routes/tasks.js";

type CreateAppOptions = {
  logger?: ApiLogger;
};

export const createApp = (_options: CreateAppOptions = {}) => {
  const app = new Hono();

  app.use("*", cors({ origin: "*" }));

  registerHealthRoute(app);
  registerTaskRoutes(app, { logger: _options.logger });

  app.get("/openapi.json", (context) => context.json(openApiDocument, 200));

  return app;
};
