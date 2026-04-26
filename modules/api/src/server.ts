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
const managerPrompt = `FOLLOW the aim-manager-guide SKILL.

Maintain AIM evaluation dimensions, evaluations, and Manager reports by reading the latest origin/main baseline, README goals, current dimensions, evaluations, Manager reports, Task Pool, and rejected Tasks through AIM API Server.

Write results back through AIM API Server only: create or update dimensions/evaluations/manager reports using the available AIM API contracts. Do not create Developer Tasks from this Manager lane.`;
const coordinatorPrompt = `FOLLOW the aim-coordinator-guide SKILL.

Maintain the AIM Task Pool from Manager output, latest baseline facts, current unfinished Tasks, and rejected Task feedback. First read those inputs, then form a concrete Task Write Bulk intent with specific Create/Delete decisions before any Task Pool write.

Reject or record feedback for generic optimizer-loop Tasks that ask Developers to continue the loop, find an unspecified gap, or self-select the next baseline increment. Do not create a "Continue AIM optimizer loop" Task or any fixed static Developer Task as an optimizer-loop placeholder.

Write Task Write Bulks/Tasks through AIM API Server using the available AIM API contracts, and record rejection feedback when a Task is not actionable. Do not bypass Task Write Bulk approval or independent Task Spec validation by turning Manager Report gaps directly into Tasks.`;
const createMissingProjectLane = () => ({
  scanOnce() {
    throw new Error(
      "AIM optimizer lane requires at least one configured project",
    );
  },
  start() {
    throw new Error(
      "AIM optimizer lane requires at least one configured project",
    );
  },
  stop() {
    return Promise.resolve();
  },
});
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

type AsyncDisposableServer = ReturnType<typeof serve> & AsyncDisposable;
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

// 生产部署可复用 createApp() 接入不同 runtime；此入口仅处理本地 Node 启动与 PORT 边界。
export const startServer = () => {
  const scope = createAsyncResourceScope();
  const logger = createApiLogger();
  const coordinatorConfig: TaskSessionCoordinatorConfig = {
    baseUrl: process.env.OPENCODE_BASE_URL?.trim() || defaultOpencodeBaseUrl,
    sessionIdleFallbackTimeoutMs,
  };
  const taskRepository = createTaskRepository({
    projectRoot: process.env.AIM_PROJECT_ROOT,
  });
  scope.use(taskRepository);
  const project = taskRepository.getFirstProject();
  const scheduler = createTaskScheduler({
    coordinator: createTaskSessionCoordinator(coordinatorConfig),
    logger,
    taskRepository,
  });
  const agentCoordinator = createAgentSessionCoordinator(coordinatorConfig);
  const configuredProject =
    project?.global_provider_id.trim() && project.global_model_id.trim()
      ? project
      : null;
  const managerLane = configuredProject
    ? createAgentSessionLane({
        coordinator: agentCoordinator,
        laneName: "manager_evaluation",
        logger,
        modelId: configuredProject.global_model_id,
        projectPath: configuredProject.project_path,
        prompt: managerPrompt,
        providerId: configuredProject.global_provider_id,
        title: "AIM Manager evaluation lane",
      })
    : createMissingProjectLane();
  const coordinatorLane = configuredProject
    ? createAgentSessionLane({
        coordinator: agentCoordinator,
        laneName: "coordinator_task_pool",
        logger,
        modelId: configuredProject.global_model_id,
        projectPath: configuredProject.project_path,
        prompt: coordinatorPrompt,
        providerId: configuredProject.global_provider_id,
        title: "AIM Coordinator task-pool lane",
      })
    : createMissingProjectLane();
  const optimizerRuntime = createOptimizerRuntime({
    intervalMs: schedulerIntervalMs,
    lanes: [
      { lane: managerLane, name: "manager_evaluation" },
      { lane: coordinatorLane, name: "coordinator_task_pool" },
      { lane: scheduler, name: "developer_follow_up" },
    ],
    logger,
  });
  scope.use(optimizerRuntime);

  optimizerRuntime.start();

  const server = serve({
    fetch: createApp({
      logger,
      onTaskResolved: optimizerRuntime.handleEvent,
      optimizerRuntime,
    }).fetch,
    port,
  }) as AsyncDisposableServer;
  let serverClosed = false;
  const shutdown = () => {
    server.close();
  };
  const closeServer = async () => {
    if (serverClosed) {
      return;
    }

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
  };

  scope.use({ [Symbol.asyncDispose]: closeServer });

  server[Symbol.asyncDispose] = async () => {
    await scope[Symbol.asyncDispose]();
  };

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
      void scope[Symbol.asyncDispose]();
    });
  } catch (error) {
    void scope[Symbol.asyncDispose]();
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
