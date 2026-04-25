import { openApiDocument } from "@aim-ai/contract";
import { Hono } from "hono";
import { cors } from "hono/cors";

import type { ApiLogger } from "./api-logger.js";
import type { OpenCodeSdkAdapter } from "./opencode-sdk-adapter.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerManagerReportRoutes } from "./routes/manager-reports.js";
import { registerOpenCodeModelRoutes } from "./routes/opencode-models.js";
import { registerTaskRoutes } from "./routes/tasks.js";

type CreateAppOptions = {
  logger?: ApiLogger;
  onTaskResolved?: () => Promise<void> | void;
  openCodeModelsAdapter?: Pick<OpenCodeSdkAdapter, "listSupportedModels">;
};

export const createApp = (_options: CreateAppOptions = {}) => {
  const app = new Hono();

  app.use("*", cors({ origin: "*" }));

  registerHealthRoute(app);
  registerOpenCodeModelRoutes(app, {
    adapter: _options.openCodeModelsAdapter,
  });
  registerManagerReportRoutes(app);
  registerTaskRoutes(app, {
    logger: _options.logger,
    onTaskResolved: _options.onTaskResolved,
    openCodeModelsAdapter: _options.openCodeModelsAdapter,
  });

  app.get("/openapi.json", (context) => context.json(openApiDocument, 200));

  return app;
};
