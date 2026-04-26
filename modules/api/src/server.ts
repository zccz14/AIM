import { pathToFileURL } from "node:url";

import { serve } from "@hono/node-server";

import { createAgentSessionCoordinator } from "./agent-session-coordinator.js";
import { createAgentSessionLane } from "./agent-session-lane.js";
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
const defaultDeveloperProviderId = "anthropic";
const defaultDeveloperModelId = "claude-sonnet-4-5";
const managerPrompt = `FOLLOW the aim-manager-guide SKILL.

Maintain AIM evaluation dimensions, evaluations, and Manager reports by reading the latest origin/main baseline, README goals, current dimensions, evaluations, Manager reports, Task Pool, and rejected Tasks through AIM API Server.

Write results back through AIM API Server only: create or update dimensions/evaluations/manager reports using the available AIM API contracts. Do not create Developer Tasks from this Manager lane.`;
const coordinatorPrompt = `FOLLOW the aim-coordinator-guide SKILL.

Maintain the AIM Task Pool from Manager output, latest baseline facts, current unfinished Tasks, and rejected Task feedback. First read those inputs, then form a concrete Task Write Bulk intent with specific Create/Delete decisions before any Task Pool write.

Reject or record feedback for generic optimizer-loop Tasks that ask Developers to continue the loop, find an unspecified gap, or self-select the next baseline increment. Do not create a "Continue AIM optimizer loop" Task or any fixed static Developer Task as an optimizer-loop placeholder.

Write Task Write Bulks/Tasks through AIM API Server using the available AIM API contracts, and record rejection feedback when a Task is not actionable. Do not bypass Task Write Bulk approval or independent Task Spec validation by turning Manager Report gaps directly into Tasks.`;
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
  const agentCoordinator = createAgentSessionCoordinator(coordinatorConfig);
  const projectPath =
    process.env.AIM_TASK_PROJECT_PATH?.trim() || process.cwd();
  const providerId =
    process.env.AIM_DEVELOPER_PROVIDER_ID?.trim() || defaultDeveloperProviderId;
  const modelId =
    process.env.AIM_DEVELOPER_MODEL_ID?.trim() || defaultDeveloperModelId;
  const managerLane = createAgentSessionLane({
    coordinator: agentCoordinator,
    laneName: "manager_evaluation",
    logger,
    modelId,
    projectPath,
    prompt: managerPrompt,
    providerId,
    title: "AIM Manager evaluation lane",
  });
  const coordinatorLane = createAgentSessionLane({
    coordinator: agentCoordinator,
    laneName: "coordinator_task_pool",
    logger,
    modelId,
    projectPath,
    prompt: coordinatorPrompt,
    providerId,
    title: "AIM Coordinator task-pool lane",
  });
  const optimizerRuntime = createOptimizerRuntime({
    intervalMs: schedulerIntervalMs,
    lanes: [
      { lane: managerLane, name: "manager_evaluation" },
      { lane: coordinatorLane, name: "coordinator_task_pool" },
      { lane: scheduler, name: "developer_follow_up" },
    ],
    logger,
  });
  const stopOptimizer = () => {
    void optimizerRuntime.stop();
  };

  optimizerRuntime.start();

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
