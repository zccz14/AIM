import { pathToFileURL } from "node:url";

import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { createApiLogger } from "./logger.js";
import { createOptimizerRuntime } from "./optimizer-runtime.js";
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
  const coordinatorConfig: TaskSessionCoordinatorConfig = {
    baseUrl: process.env.OPENCODE_BASE_URL?.trim() || defaultOpencodeBaseUrl,
    sessionIdleFallbackTimeoutMs,
  };
  const taskRepository = createTaskRepository({
    projectRoot: process.env.AIM_PROJECT_ROOT,
  });
  const scheduler = createTaskScheduler({
    coordinator: createTaskSessionCoordinator(coordinatorConfig),
    logger,
    taskRepository,
  });
  const optimizerRuntime = createOptimizerRuntime({
    intervalMs: schedulerIntervalMs,
    scheduler,
  });
  const stopOptimizer = () => {
    void optimizerRuntime.stop();
  };

  if (isTaskSchedulerEnabled) {
    optimizerRuntime.start();
  }

  const server = serve({
    fetch: createApp({
      logger,
      onTaskResolved: scheduler.scanOnce,
      optimizerRuntime,
    }).fetch,
    port,
  });

  try {
    process.once("SIGINT", stopOptimizer);
    process.once("SIGTERM", stopOptimizer);
    server.once("close", () => {
      process.off("SIGINT", stopOptimizer);
      process.off("SIGTERM", stopOptimizer);
      stopOptimizer();
    });
  } catch (error) {
    stopOptimizer();
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
