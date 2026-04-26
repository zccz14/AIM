import { openApiDocument } from "@aim-ai/contract";
import { Hono } from "hono";
import { cors } from "hono/cors";

import type { ApiLogger } from "./api-logger.js";
import type { OpenCodeSdkAdapter } from "./opencode-sdk-adapter.js";
import type { OptimizerEvent, OptimizerRuntime } from "./optimizer-runtime.js";
import { registerDimensionRoutes } from "./routes/dimensions.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerOpenCodeModelRoutes } from "./routes/opencode-models.js";
import { registerOptimizerRoutes } from "./routes/optimizer.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerTaskWriteBulkRoutes } from "./routes/task-write-bulks.js";
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

const createInactiveOptimizerRuntime = (): OptimizerRuntime => {
  let running = false;

  return {
    [Symbol.asyncDispose]: () => {
      running = false;

      return Promise.resolve();
    },
    getStatus: () => ({
      enabled_triggers: ["task_resolved"],
      last_event: null,
      last_scan_at: null,
      lanes: {
        coordinator_task_pool: {
          last_error: null,
          last_scan_at: null,
          running,
        },
        developer_follow_up: {
          last_error: null,
          last_scan_at: null,
          running,
        },
        manager_evaluation: {
          last_error: null,
          last_scan_at: null,
          running,
        },
      },
      running,
    }),
    handleEvent: () => Promise.resolve(),
    start: () => {
      running = true;
    },
    stop: () => {
      running = false;

      return Promise.resolve();
    },
  };
};

export const createApp = (_options: CreateAppOptions = {}): AppResource => {
  const app = new Hono() as AppResource;
  const resourceScope = createAsyncResourceScope();
  const optimizerRuntime =
    _options.optimizerRuntime ??
    resourceScope.use(createInactiveOptimizerRuntime());

  app[Symbol.asyncDispose] = async () => {
    await resourceScope[Symbol.asyncDispose]();
  };

  app.use("*", cors({ origin: "*" }));

  registerHealthRoute(app);
  registerOpenCodeModelRoutes(app, {
    adapter: _options.openCodeModelsAdapter,
  });
  registerOptimizerRoutes(app, optimizerRuntime);
  registerProjectRoutes(app, { resourceScope });
  registerDimensionRoutes(app, { resourceScope });
  registerTaskWriteBulkRoutes(app, { resourceScope });
  registerTaskRoutes(app, {
    logger: _options.logger,
    onTaskResolved: _options.onTaskResolved,
    openCodeModelsAdapter: _options.openCodeModelsAdapter,
    resourceScope,
  });

  app.get("/openapi.json", (context) => context.json(openApiDocument, 200));

  return app;
};
