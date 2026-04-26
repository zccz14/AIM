import { pathToFileURL } from "node:url";

import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { createApiLogger } from "./logger.js";
import { createOptimizerRuntime } from "./optimizer-runtime.js";
import { buildTaskLogFields } from "./task-log-fields.js";
import { createTaskRepository } from "./task-repository.js";
import { createTaskScheduler } from "./task-scheduler.js";
import {
  createTaskSessionCoordinator,
  type TaskSessionCoordinatorConfig,
} from "./task-session-coordinator.js";

const defaultPort = 8192;
const defaultSchedulerIntervalMs = 5_000;
const defaultOpencodeBaseUrl = "http://localhost:4096";
const defaultDeveloperProviderId = "anthropic";
const defaultDeveloperModelId = "claude-sonnet-4-5";
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
    taskProducer: {
      async produceTasks() {
        const task = await taskRepository.createTask({
          developer_model_id:
            process.env.AIM_DEVELOPER_MODEL_ID?.trim() ||
            defaultDeveloperModelId,
          developer_provider_id:
            process.env.AIM_DEVELOPER_PROVIDER_ID?.trim() ||
            defaultDeveloperProviderId,
          project_path:
            process.env.AIM_TASK_PROJECT_PATH?.trim() || process.cwd(),
          task_spec:
            "# 继续推进 AIM 优化循环\n\n请基于最新 origin/main 和 README 目标，识别当前最小可推进缺口，按仓库 AGENTS.md 完成一个可合并的增量闭环。必须先验证现状，再用 TDD 或必要验证完成实现、提交、开 PR、跟进 checks/review、合并、清理 worktree，并向 AIM Server 回报最终 resolved 或 rejected。\n\n如果发现更适合由 Manager/Coordinator 先拆分的缺口，请在当前增量内补足能让优化器继续自动产出后续 AIM Task 的最小能力。",
          title: "Continue AIM optimizer loop",
        });

        logger.info(buildTaskLogFields("task_created", task));
      },
    },
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
      onTaskResolved: optimizerRuntime.handleEvent,
      optimizerRuntime,
    }).fetch,
    port,
  });
  const shutdown = () => {
    server.close();
  };

  try {
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    server.once("close", () => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
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
