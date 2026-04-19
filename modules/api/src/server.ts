import { pathToFileURL } from "node:url";

import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { createTaskRepository } from "./task-repository.js";
import { createTaskScheduler } from "./task-scheduler.js";
import {
  createTaskSessionCoordinator,
  type TaskSessionCoordinatorConfig,
} from "./task-session-coordinator.js";

const defaultPort = 8192;
const defaultSchedulerIntervalMs = 5_000;
const parsedPort = Number.parseInt(process.env.PORT ?? `${defaultPort}`, 10);
const port = Number.isNaN(parsedPort) ? defaultPort : parsedPort;
const parsedSchedulerIntervalMs = Number.parseInt(
  process.env.TASK_SCHEDULER_INTERVAL_MS ?? `${defaultSchedulerIntervalMs}`,
  10,
);
const schedulerIntervalMs = Number.isNaN(parsedSchedulerIntervalMs)
  ? defaultSchedulerIntervalMs
  : parsedSchedulerIntervalMs;

const readRequiredEnv = (
  name: "OPENCODE_BASE_URL" | "OPENCODE_MODEL_ID" | "OPENCODE_PROVIDER_ID",
) => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required when TASK_SCHEDULER_ENABLED=true`);
  }

  return value;
};

// 生产部署可复用 createApp() 接入不同 runtime；此入口仅处理本地 Node 启动与 PORT 边界。
export const startServer = () => {
  const isTaskSchedulerEnabled = process.env.TASK_SCHEDULER_ENABLED === "true";
  let scheduler: ReturnType<typeof createTaskScheduler> | undefined;
  let stopScheduler: (() => void) | undefined;

  if (isTaskSchedulerEnabled) {
    const coordinatorConfig: TaskSessionCoordinatorConfig = {
      baseUrl: readRequiredEnv("OPENCODE_BASE_URL"),
      modelId: readRequiredEnv("OPENCODE_MODEL_ID"),
      providerId: readRequiredEnv("OPENCODE_PROVIDER_ID"),
    };
    const taskRepository = createTaskRepository({
      projectRoot: process.env.AIM_PROJECT_ROOT,
    });
    const taskScheduler = createTaskScheduler({
      coordinator: createTaskSessionCoordinator(coordinatorConfig),
      taskRepository,
    });

    scheduler = taskScheduler;
    stopScheduler = () => taskScheduler.stop();
  }

  const server = serve({ fetch: createApp().fetch, port });

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
