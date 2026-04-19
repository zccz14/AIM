import { pathToFileURL } from "node:url";

import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { createTaskRepository } from "./task-repository.js";
import { createTaskScheduler } from "./task-scheduler.js";
import { createTaskSessionCoordinator } from "./task-session-coordinator.js";

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

// 生产部署可复用 createApp() 接入不同 runtime；此入口仅处理本地 Node 启动与 PORT 边界。
export const startServer = () => {
  const isTaskSchedulerEnabled = process.env.TASK_SCHEDULER_ENABLED === "true";

  const server = serve({ fetch: createApp().fetch, port });

  if (isTaskSchedulerEnabled) {
    const taskRepository = createTaskRepository({
      projectRoot: process.env.AIM_PROJECT_ROOT,
    });
    const scheduler = createTaskScheduler({
      coordinator: createTaskSessionCoordinator(),
      taskRepository,
    });

    scheduler.start({ intervalMs: schedulerIntervalMs });

    const stopScheduler = () => scheduler.stop();

    process.once("SIGINT", stopScheduler);
    process.once("SIGTERM", stopScheduler);
    server.once("close", () => {
      process.off("SIGINT", stopScheduler);
      process.off("SIGTERM", stopScheduler);
      stopScheduler();
    });
  }

  return server;
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startServer();
}
