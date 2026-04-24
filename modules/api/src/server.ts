import { pathToFileURL } from "node:url";

import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { createApiLogger } from "./logger.js";
import { createTaskRepository } from "./task-repository.js";
import { createTaskScheduler } from "./task-scheduler.js";
import {
  createTaskSessionCoordinator,
  type TaskSessionCoordinatorConfig,
} from "./task-session-coordinator.js";

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
export const startServer = () => {
  const logger = createApiLogger();
  const isTaskSchedulerEnabled = process.env.TASK_SCHEDULER_ENABLED !== "false";
  let scheduler: ReturnType<typeof createTaskScheduler> | undefined;
  let stopScheduler: (() => void) | undefined;

  if (isTaskSchedulerEnabled) {
    const coordinatorConfig: TaskSessionCoordinatorConfig = {
      baseUrl: process.env.OPENCODE_BASE_URL?.trim() || defaultOpencodeBaseUrl,
      sessionIdleFallbackTimeoutMs,
    };
    const taskRepository = createTaskRepository({
      projectRoot: process.env.AIM_PROJECT_ROOT,
    });
    const taskScheduler = createTaskScheduler({
      coordinator: createTaskSessionCoordinator(coordinatorConfig),
      logger,
      taskRepository,
    });

    scheduler = taskScheduler;
    stopScheduler = () => taskScheduler.stop();
  }

  const server = serve({ fetch: createApp({ logger }).fetch, port });

  try {
    if (scheduler && stopScheduler) {
      scheduler.start({ intervalMs: schedulerIntervalMs });

      process.once("SIGINT", stopScheduler);
      process.once("SIGTERM", stopScheduler);
      server.once("close", () => {
        process.off("SIGINT", stopScheduler);
        process.off("SIGTERM", stopScheduler);
        stopScheduler();
      });
    }
  } catch (error) {
    stopScheduler?.();
    server.close();
    throw error;
  }

  return server;
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startServer();
}
