import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Task } from "@aim-ai/contract";

import { buildTaskLogFields } from "./logger.js";
import {
  buildContinuePrompt,
  getTaskSpecFilename,
} from "./task-continue-prompt.js";
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
  concurrency?: number;
  logger?: SchedulerLogger;
  taskRepository: SchedulerTaskRepository;
};

type StartOptions = {
  intervalMs: number;
};

type SchedulerLogger = {
  error: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
};

const defaultLogger: SchedulerLogger = {
  error: console.error.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
};

const getEffectiveConcurrency = (concurrency?: number) => {
  if (
    !Number.isFinite(concurrency) ||
    concurrency === undefined ||
    concurrency < 1
  ) {
    return 1;
  }

  return Math.floor(concurrency);
};

const runWithConcurrency = async (
  items: Task[],
  concurrency: number,
  worker: (task: Task) => Promise<void>,
) => {
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        const task = items[currentIndex];
        nextIndex += 1;

        if (!task) {
          return;
        }

        await worker(task);
      }
    }),
  );
};

export const createTaskScheduler = (options: CreateTaskSchedulerOptions) => {
  const concurrency = getEffectiveConcurrency(options.concurrency);
  const logger = options.logger ?? defaultLogger;
  let intervalHandle: NodeJS.Timeout | undefined;
  let roundPromise: Promise<void> | null = null;

  const startRound = () => {
    void beginRound().catch((error) => {
      logger.error(
        {
          error,
        },
        "Task scheduler failed while scanning unfinished tasks",
      );
    });
  };

  const runTask = async (
    task: Task,
    duplicateSessionIds: ReadonlySet<string>,
    roundSessionIds: Set<string>,
  ) => {
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
        boundInRound = true;
      }

      const sessionId = latestTask.session_id;

      if (!sessionId || latestTask.done) {
        return;
      }

      if (duplicateSessionIds.has(sessionId)) {
        logger.warn(
          {
            sessionId,
            taskId: latestTask.task_id,
          },
          `Skipping duplicate unfinished session_id in round: ${sessionId}`,
        );
        return;
      }

      if (roundSessionIds.has(sessionId)) {
        logger.warn(
          {
            sessionId,
            taskId: latestTask.task_id,
          },
          `Skipping duplicate unfinished session_id in round: ${sessionId}`,
        );
        return;
      }

      roundSessionIds.add(sessionId);

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
          error,
          taskId: task.task_id,
        },
        `Task scheduler failed while processing task ${task.task_id}`,
      );
    }
  };

  const beginRound = () => {
    if (roundPromise) {
      return roundPromise;
    }

    roundPromise = (async () => {
      const tasks = await options.taskRepository.listUnfinishedTasks();
      const sessionCounts = new Map<string, number>();

      for (const task of tasks) {
        if (!task.session_id) {
          continue;
        }

        sessionCounts.set(
          task.session_id,
          (sessionCounts.get(task.session_id) ?? 0) + 1,
        );
      }

      const duplicateSessionIds = new Set(
        [...sessionCounts.entries()]
          .filter(([, count]) => count > 1)
          .map(([sessionId]) => sessionId),
      );
      const roundSessionIds = new Set<string>();

      await runWithConcurrency(tasks, concurrency, async (task) => {
        await runTask(task, duplicateSessionIds, roundSessionIds);
      });
    })().finally(() => {
      roundPromise = null;
    });

    return roundPromise;
  };

  return {
    runRound() {
      return beginRound();
    },
    start(startOptions: StartOptions) {
      if (intervalHandle) {
        return;
      }

      startRound();
      intervalHandle = setInterval(() => {
        startRound();
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
