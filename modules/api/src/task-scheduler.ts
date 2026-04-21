import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Task } from "@aim-ai/contract";

import type { ApiLogger } from "./api-logger.js";
import {
  buildContinuePrompt,
  getTaskSpecFilename,
} from "./task-continue-prompt.js";
import { buildTaskLogFields } from "./task-log-fields.js";
import type {
  TaskSessionCoordinator,
  TaskSessionState,
} from "./task-session-coordinator.js";

export type SessionState = TaskSessionState;

type SchedulerTaskRepository = {
  assignSessionIfUnassigned(
    taskId: string,
    sessionId: string,
  ): Promise<null | Task>;
  listUnfinishedTasks(): Promise<Task[]>;
};

type CreateTaskSchedulerOptions = {
  coordinator: TaskSessionCoordinator;
  logger?: ApiLogger;
  taskRepository: SchedulerTaskRepository;
};

type StartOptions = {
  intervalMs: number;
};

const defaultLogger: ApiLogger = {
  error: console.error.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
};

export const createTaskScheduler = (options: CreateTaskSchedulerOptions) => {
  const logger = options.logger ?? defaultLogger;
  let intervalHandle: NodeJS.Timeout | undefined;
  let scanPromise: Promise<void> | null = null;

  const startScan = () => {
    void beginScan().catch((error) => {
      logger.error(
        {
          err: error,
        },
        "Task scheduler failed while scanning unfinished tasks",
      );
    });
  };

  const runTask = async (task: Task) => {
    try {
      let latestTask = task;
      let boundInRound = false;

      if (!latestTask.session_id) {
        const { sessionId } =
          await options.coordinator.createSession(latestTask);
        const assignedTask =
          await options.taskRepository.assignSessionIfUnassigned(
            latestTask.task_id,
            sessionId,
          );

        if (!assignedTask?.session_id) {
          return;
        }

        latestTask = assignedTask;
        boundInRound = assignedTask.session_id === sessionId;
      }

      const sessionId = latestTask.session_id;

      if (!sessionId || latestTask.done) {
        return;
      }

      const sessionState = await options.coordinator.getSessionState(
        sessionId,
        latestTask.project_path,
      );

      if (boundInRound && sessionState === "idle") {
        logger.info(buildTaskLogFields("task_session_bound", latestTask));
      }

      if (sessionState !== "idle") {
        return;
      }

      const specFile = getTaskSpecFilename(latestTask);

      await mkdir(dirname(specFile), { recursive: true });
      await writeFile(specFile, latestTask.task_spec, "utf-8");

      await options.coordinator.sendContinuePrompt(
        sessionId,
        buildContinuePrompt(latestTask),
      );

      logger.info(buildTaskLogFields("task_session_continued", latestTask));
    } catch (error) {
      logger.error(
        {
          err: error,
          taskId: task.task_id,
        },
        `Task scheduler failed while processing task ${task.task_id}`,
      );
    }
  };

  const beginScan = () => {
    if (scanPromise) {
      return scanPromise;
    }

    scanPromise = (async () => {
      const tasks = await options.taskRepository.listUnfinishedTasks();

      for (const task of tasks) {
        await runTask(task);
      }
    })().finally(() => {
      scanPromise = null;
    });

    return scanPromise;
  };

  return {
    scanOnce() {
      return beginScan();
    },
    start(startOptions: StartOptions) {
      if (intervalHandle) {
        return;
      }

      startScan();
      intervalHandle = setInterval(() => {
        startScan();
      }, startOptions.intervalMs);
    },
    stop() {
      if (!intervalHandle) {
        return;
      }

      clearInterval(intervalHandle);
      intervalHandle = undefined;
    },
  };
};
