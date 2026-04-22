import type { Task } from "@aim-ai/contract";

import type { ApiLogger } from "./api-logger.js";
import { buildTaskSessionPrompt } from "./task-continue-prompt.js";
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
  let scanPromise: Promise<void> | null = null;
  let loopPromise: Promise<void> | null = null;
  let stopRequested = false;
  let sleepTimer: NodeJS.Timeout | undefined;
  let wakeSleepingLoop: (() => void) | undefined;

  const logScanFailure = (error: unknown) => {
    logger.error(
      {
        err: error,
      },
      "Task scheduler failed while scanning unfinished tasks",
    );
  };

  const sleep = (intervalMs: number) =>
    new Promise<void>((resolve) => {
      sleepTimer = setTimeout(() => {
        sleepTimer = undefined;
        wakeSleepingLoop = undefined;
        resolve();
      }, intervalMs);
      wakeSleepingLoop = () => {
        if (sleepTimer) {
          clearTimeout(sleepTimer);
          sleepTimer = undefined;
        }
        wakeSleepingLoop = undefined;
        resolve();
      };
    });

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

      await options.coordinator.sendContinuePrompt(
        sessionId,
        buildTaskSessionPrompt(latestTask),
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
      if (loopPromise) {
        return;
      }

      stopRequested = false;
      loopPromise = (async () => {
        while (!stopRequested) {
          await beginScan().catch(logScanFailure);

          if (stopRequested) {
            break;
          }

          await sleep(startOptions.intervalMs);
        }
      })().finally(() => {
        if (sleepTimer) {
          clearTimeout(sleepTimer);
          sleepTimer = undefined;
        }
        wakeSleepingLoop = undefined;
        stopRequested = false;
        loopPromise = null;
      });
    },
    stop() {
      stopRequested = true;
      wakeSleepingLoop?.();

      return loopPromise ?? Promise.resolve();
    },
  };
};
