import type { Task } from "@aim-ai/contract";

import type { ApiLogger } from "./api-logger.js";
import type { OpenCodeSessionManager } from "./opencode-session-manager.js";
import { ensureProjectWorkspace } from "./project-workspace.js";
import { buildTaskSessionPrompt } from "./task-continue-prompt.js";

type DeveloperSessionCreator = Pick<OpenCodeSessionManager, "createSession">;

type DeveloperTaskRepository = {
  assignSessionIfUnassigned(
    taskId: string,
    sessionId: string,
  ): Promise<null | Task>;
  listUnfinishedTasks(): Promise<Task[]>;
};

type CreateDeveloperOptions = {
  logger?: ApiLogger;
  sessionManager: DeveloperSessionCreator;
  taskRepository: DeveloperTaskRepository;
};

type ManagedDeveloperSession = Awaited<
  ReturnType<DeveloperSessionCreator["createSession"]>
>;

const heartbeatMs = 1000;

const summarizeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const sleep = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();

      return;
    }

    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });

export const createDeveloper = ({
  logger,
  sessionManager,
  taskRepository,
}: CreateDeveloperOptions): AsyncDisposable => {
  const stack = new AsyncDisposableStack();
  const abortController = new AbortController();
  const activeSessions = new Map<string, ManagedDeveloperSession>();

  const bindTask = async (task: Task) => {
    let createdSession: ManagedDeveloperSession | null = null;

    try {
      const directory = await ensureProjectWorkspace(task);
      createdSession = await sessionManager.createSession({
        directory,
        model: {
          modelID: task.developer_model_id,
          providerID: task.developer_provider_id,
        },
        prompt: buildTaskSessionPrompt(task),
        title: `AIM Developer: ${task.title}`,
      });

      const assignedTask = await taskRepository.assignSessionIfUnassigned(
        task.task_id,
        createdSession.sessionId,
      );

      if (
        assignedTask?.session_id === createdSession.sessionId &&
        !assignedTask.done
      ) {
        activeSessions.set(createdSession.sessionId, createdSession);
        createdSession = null;
        return;
      }

      await createdSession[Symbol.asyncDispose]();
      createdSession = null;
    } catch (error) {
      if (createdSession) {
        await createdSession[Symbol.asyncDispose]();
      }

      throw error;
    }
  };

  const heartbeat = async () => {
    const tasks = await taskRepository.listUnfinishedTasks();
    const unassignedTasks = tasks.filter(
      (task) => !task.done && task.session_id === null,
    );

    for (const task of unassignedTasks) {
      if (abortController.signal.aborted) {
        return;
      }

      try {
        await bindTask(task);
      } catch (error) {
        logger?.error(
          {
            err: error,
            event: "developer_task_failed",
            project_id: task.project_id,
            task_id: task.task_id,
          },
          `Developer failed while assigning task ${task.task_id}`,
        );
      }
    }
  };

  const loop = (async () => {
    while (!abortController.signal.aborted) {
      try {
        await heartbeat();
      } catch (error) {
        logger?.warn(
          { error: summarizeError(error), event: "developer_heartbeat_failed" },
          "Developer heartbeat failed",
        );
      }

      await sleep(heartbeatMs, abortController.signal);
    }
  })();

  stack.defer(async () => {
    abortController.abort();
    await loop;
    const sessions = [...activeSessions.values()];
    activeSessions.clear();
    await Promise.all(
      sessions.map((session) => session[Symbol.asyncDispose]()),
    );
  });

  return {
    async [Symbol.asyncDispose]() {
      await stack.disposeAsync();
    },
  };
};
