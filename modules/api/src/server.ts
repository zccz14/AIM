import { pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { createDimensionRepository } from "./dimension-repository.js";
import { createApiLogger } from "./logger.js";
import { createManagerStateRepository } from "./manager-state-repository.js";
import { createOpenCodeSessionRepository } from "./opencode-session-repository.js";
import { createOptimizerLaneStateRepository } from "./optimizer-lane-state-repository.js";
import { createOptimizerSystem } from "./optimizer-system.js";
import { createTaskRepository } from "./task-repository.js";
import type { TaskSessionCoordinatorConfig } from "./task-session-coordinator.js";

const defaultPort = 8192;
const defaultSchedulerIntervalMs = 5_000;
const defaultOpencodeBaseUrl = "http://localhost:4096";
const parsedSessionIdleFallbackTimeoutMs = Number.parseInt(
  process.env.OPENCODE_SESSION_IDLE_FALLBACK_TIMEOUT_MS ?? "",
  10,
);
const sessionIdleFallbackTimeoutMs = Number.isNaN(
  parsedSessionIdleFallbackTimeoutMs,
)
  ? undefined
  : parsedSessionIdleFallbackTimeoutMs;
const parsedPort = Number.parseInt(process.env.PORT ?? `${defaultPort}`, 10);
const port = Number.isNaN(parsedPort) ? defaultPort : parsedPort;
const parsedSchedulerIntervalMs = Number.parseInt(
  process.env.TASK_SCHEDULER_INTERVAL_MS ?? `${defaultSchedulerIntervalMs}`,
  10,
);
const schedulerIntervalMs = Number.isNaN(parsedSchedulerIntervalMs)
  ? defaultSchedulerIntervalMs
  : parsedSchedulerIntervalMs;

// 生产部署可复用 createApp() 接入不同 runtime；此入口仅处理本地 Node 启动与 PORT 边界。
export const startServer = (): AsyncDisposable => {
  const scope = new AsyncDisposableStack();
  const logger = createApiLogger();
  const coordinatorConfig: TaskSessionCoordinatorConfig = {
    baseUrl: process.env.OPENCODE_BASE_URL?.trim() || defaultOpencodeBaseUrl,
    sessionIdleFallbackTimeoutMs,
  };
  const taskRepository = createTaskRepository({
    projectRoot: process.env.AIM_PROJECT_ROOT,
  });
  scope.use(taskRepository);
  const openCodeSessionRepository = createOpenCodeSessionRepository({
    projectRoot: process.env.AIM_PROJECT_ROOT,
  });
  scope.use(openCodeSessionRepository);
  const optimizerLaneStateRepository = createOptimizerLaneStateRepository({
    projectRoot: process.env.AIM_PROJECT_ROOT,
  });
  scope.use(optimizerLaneStateRepository);
  const managerStateRepository = createManagerStateRepository({
    projectRoot: process.env.AIM_PROJECT_ROOT,
  });
  scope.use(managerStateRepository);
  const dimensionRepository = createDimensionRepository({
    projectRoot: process.env.AIM_PROJECT_ROOT,
  });
  scope.use(dimensionRepository);
  const optimizerSystem = scope.use(
    createOptimizerSystem({
      continuationSessionRepository: openCodeSessionRepository,
      coordinatorConfig,
      dimensionRepository,
      intervalMs: schedulerIntervalMs,
      laneStateRepository: optimizerLaneStateRepository,
      logger,
      managerStateRepository,
      taskRepository,
    }),
  );
  const { optimizerRuntime } = optimizerSystem;

  const app = scope.use(
    createApp({
      logger,
      onTaskResolved: optimizerRuntime.handleEvent,
      optimizerRuntime,
    }),
  );

  const server = serve({
    fetch: app.fetch,
    port,
  });
  let serverClosed = false;
  let disposingServer = false;
  const shutdown = () => {
    server.close();
  };
  const closeServer = async () => {
    if (serverClosed) {
      return;
    }

    disposingServer = true;

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((error?: Error) => {
          if (error) {
            reject(error);
            return;
          }

          serverClosed = true;
          resolve();
        });
      });
    } finally {
      disposingServer = false;
    }
  };

  scope.use({ [Symbol.asyncDispose]: closeServer });

  try {
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    scope.use({
      [Symbol.dispose]: () => {
        process.off("SIGINT", shutdown);
        process.off("SIGTERM", shutdown);
      },
    });
    server.once("close", () => {
      serverClosed = true;
      if (!disposingServer) {
        void scope.disposeAsync();
      }
    });
  } catch (error) {
    void scope.disposeAsync();
    throw error;
  }

  return scope;
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startServer();
}
