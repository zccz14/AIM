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
import { registerProjectRoutes } from "./routes/projects.js";
import { registerTaskRoutes } from "./routes/tasks.js";

type CreateAppOptions = {
  logger?: ApiLogger;
  onTaskResolved?: (event: OptimizerEvent) => Promise<void> | void;
  openCodeModelsAdapter?: Pick<OpenCodeSdkAdapter, "listSupportedModels">;
  optimizerRuntime?: OptimizerRuntime;
};

type AppResource = Hono & AsyncDisposable;
type ScopedResource = Partial<AsyncDisposable & Disposable>;

const createAsyncResourceScope = () => {
  const resources: ScopedResource[] = [];
  let disposePromise: Promise<void> | null = null;

  return {
    async [Symbol.asyncDispose]() {
      if (disposePromise) {
        await disposePromise;
        return;
      }

      disposePromise = (async () => {
        for (const resource of resources.splice(0).reverse()) {
          const asyncDispose = resource[Symbol.asyncDispose];

          if (asyncDispose) {
            await asyncDispose.call(resource);
            continue;
          }

          resource[Symbol.dispose]?.();
        }
      })();

      await disposePromise;
    },

    use<T extends ScopedResource>(resource: T) {
      resources.push(resource);
      return resource;
    },
  };
};

export const createApp = (_options: CreateAppOptions = {}): AppResource => {
  const app = new Hono() as AppResource;
  const resourceScope = createAsyncResourceScope();

  app[Symbol.asyncDispose] = async () => {
    await resourceScope[Symbol.asyncDispose]();
  };

  app.use("*", cors({ origin: "*" }));

  registerHealthRoute(app);
  registerDbRoutes(app);
  registerOpenCodeModelRoutes(app, {
    adapter: _options.openCodeModelsAdapter,
  });
  registerProjectRoutes(app, { resourceScope });
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
