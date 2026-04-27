import { openApiDocument } from "@aim-ai/contract";
import { Hono } from "hono";
import { cors } from "hono/cors";

import type { ApiLogger } from "./api-logger.js";
import type { OpenCodeSdkAdapter } from "./opencode-sdk-adapter.js";
import type { OptimizerEvent, OptimizerRuntime } from "./optimizer-runtime.js";
import { registerDbRoutes } from "./routes/db.js";
import { registerDimensionRoutes } from "./routes/dimensions.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerOpenCodeModelRoutes } from "./routes/opencode-models.js";
import { registerOpenCodeSessionRoutes } from "./routes/opencode-sessions.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerTaskRoutes } from "./routes/tasks.js";

type CreateAppOptions = {
  logger?: ApiLogger;
  onTaskResolved?: (event: OptimizerEvent) => Promise<void> | void;
  openCodeModelsAdapter?: Pick<OpenCodeSdkAdapter, "listSupportedModels">;
  optimizerRuntime?: OptimizerRuntime;
};

type AppResource = Hono & AsyncDisposable;

export const createApp = (_options: CreateAppOptions = {}): AppResource => {
  const app = new Hono() as AppResource;
  const resourceScope = new AsyncDisposableStack();

  app[Symbol.asyncDispose] = async () => {
    await resourceScope.disposeAsync();
  };

  app.use("*", cors({ origin: "*" }));

  registerHealthRoute(app);
  registerDbRoutes(app);
  registerOpenCodeModelRoutes(app, {
    adapter: _options.openCodeModelsAdapter,
  });
  registerOpenCodeSessionRoutes(app, { resourceScope });
  registerProjectRoutes(app, {
    optimizerRuntime: _options.optimizerRuntime,
    resourceScope,
  });
  registerDimensionRoutes(app, { resourceScope });
  registerTaskRoutes(app, {
    logger: _options.logger,
    onTaskResolved: _options.onTaskResolved,
    openCodeModelsAdapter: _options.openCodeModelsAdapter,
    resourceScope,
  });

  app.get("/openapi.json", (context) => context.json(openApiDocument, 200));

  return app;
};
