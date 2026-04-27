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

type ManagedTaskSession = Awaited<
  ReturnType<TaskSessionCoordinator["createSession"]>
>;

type StartOptions = {
  intervalMs: number;
};

export type SchedulerScanContext = {
  resolvedTaskId?: string;
};

const defaultLogger: ApiLogger = {
  error: console.error.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
};

const getDependencyRank = (task: Task, resolvedTaskId: string) => {
  if (task.dependencies.includes(resolvedTaskId)) {
    return 0;
  }

  if (task.dependencies.length === 0) {
    return 1;
  }

  return 2;
};

const prioritizeDependencyTasks = (
  tasks: Task[],
  context: SchedulerScanContext | undefined,
) => {
  if (!context?.resolvedTaskId) {
    return tasks;
  }

  const { resolvedTaskId } = context;

  return tasks
    .map((task, index) => ({ index, task }))
    .sort((left, right) => {
      const leftRank = getDependencyRank(left.task, resolvedTaskId);
      const rightRank = getDependencyRank(right.task, resolvedTaskId);

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      if (leftRank === 2) {
        const dependencyCountDifference =
          left.task.dependencies.length - right.task.dependencies.length;

        if (dependencyCountDifference !== 0) {
          return dependencyCountDifference;
        }
      }

      return left.index - right.index;
    })
    .map(({ task }) => task);
};

const prioritizeSessionTasks = (
  tasks: Task[],
  context: SchedulerScanContext | undefined,
) => [
  ...prioritizeDependencyTasks(
    tasks.filter((task) => task.session_id),
    context,
  ),
  ...prioritizeDependencyTasks(
    tasks.filter((task) => !task.session_id),
    context,
  ),
];

export const createTaskScheduler = (options: CreateTaskSchedulerOptions) => {
  const logger = options.logger ?? defaultLogger;
  let scanPromise: Promise<void> | null = null;
  let loopPromise: Promise<void> | null = null;
  let stopRequested = false;
  let sleepTimer: NodeJS.Timeout | undefined;
  let wakeSleepingLoop: (() => void) | undefined;
  const activeSessions = new Map<string, ManagedTaskSession>();

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
    let createdSession: ManagedTaskSession | null = null;

    try {
      let latestTask = task;
      let boundInRound = false;

      if (!latestTask.session_id) {
        createdSession = await options.coordinator.createSession(latestTask);
        const { sessionId } = createdSession;
        const assignedTask =
          await options.taskRepository.assignSessionIfUnassigned(
            latestTask.task_id,
            sessionId,
          );

        if (!assignedTask?.session_id) {
          await createdSession[Symbol.asyncDispose]();
          createdSession = null;
          return;
        }

        latestTask = assignedTask;
        boundInRound = assignedTask.session_id === sessionId;

        if (boundInRound) {
          activeSessions.set(sessionId, createdSession);
          createdSession = null;
        } else {
          await createdSession[Symbol.asyncDispose]();
          createdSession = null;
        }
      }

      const sessionId = latestTask.session_id;

      if (!sessionId || latestTask.done) {
        return;
      }

      const sessionState = await options.coordinator.getSessionState(
        sessionId,
        latestTask,
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
        latestTask,
      );

      logger.info(buildTaskLogFields("task_session_continued", latestTask));
    } catch (error) {
      if (createdSession) {
        try {
          await createdSession[Symbol.asyncDispose]();
        } catch (disposeError) {
          logger.error(
            { err: disposeError, taskId: task.task_id },
            `Task scheduler failed while releasing task session ${task.task_id}`,
          );
        }
      }

      logger.error(
        {
          err: error,
          taskId: task.task_id,
        },
        `Task scheduler failed while processing task ${task.task_id}`,
      );
    }
  };

  const beginScan = (context?: SchedulerScanContext) => {
    if (scanPromise) {
      return scanPromise;
    }

    scanPromise = (async () => {
      const tasks = await options.taskRepository.listUnfinishedTasks();

      if (tasks.length === 0) {
        return;
      }

      for (const task of prioritizeSessionTasks(tasks, context)) {
        await runTask(task);
      }
    })().finally(() => {
      scanPromise = null;
    });

    return scanPromise;
  };

  const shutdown = () => {
    stopRequested = true;
    wakeSleepingLoop?.();

    return Promise.all(
      [loopPromise, scanPromise].filter((promise): promise is Promise<void> =>
        Boolean(promise),
      ),
    ).then(() => undefined);
  };

  const disposeActiveSessions = async () => {
    const sessions = [...activeSessions.values()];

    activeSessions.clear();
    await Promise.all(
      sessions.map((session) => session[Symbol.asyncDispose]()),
    );
  };

  return {
    scanOnce(context?: SchedulerScanContext) {
      return beginScan(context);
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
    async [Symbol.asyncDispose]() {
      await Promise.all([shutdown(), disposeActiveSessions()]);
      await disposeActiveSessions();
    },
  };
};
