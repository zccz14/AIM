import type { Task } from "@aim-ai/contract";

import type { ApiLogger } from "./api-logger.js";
import type { OpenCodeSessionManager } from "./opencode-session-manager.js";
import { ensureProjectWorkspace } from "./project-workspace.js";
import { buildTaskSessionPrompt } from "./task-continue-prompt.js";
import { buildTaskLogFields } from "./task-log-fields.js";

type TaskSessionCreator = Pick<OpenCodeSessionManager, "createSession">;

type SchedulerTaskRepository = {
  assignSessionIfUnassigned(
    taskId: string,
    sessionId: string,
  ): Promise<null | Task>;
  listUnfinishedTasks(): Promise<Task[]>;
};

type CreateTaskSchedulerOptions = {
  logger?: ApiLogger;
  sessionManager: TaskSessionCreator;
  taskRepository: SchedulerTaskRepository;
};

type ManagedTaskSession = Awaited<
  ReturnType<TaskSessionCreator["createSession"]>
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
        event: "task_scheduler_scan_failed",
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
        const directory = await ensureProjectWorkspace(latestTask);
        createdSession = await options.sessionManager.createSession({
          directory,
          model: {
            modelID: latestTask.developer_model_id,
            providerID: latestTask.developer_provider_id,
          },
          prompt: buildTaskSessionPrompt(latestTask),
          title: `AIM Developer: ${latestTask.title}`,
        });
        const { sessionId } = createdSession;
        const assignedTask =
          await options.taskRepository.assignSessionIfUnassigned(
            latestTask.task_id,
            sessionId,
          );

        if (!assignedTask?.session_id) {
          await createdSession[Symbol.asyncDispose]();
          createdSession = null;
          logger.info(
            {
              dependency_count: latestTask.dependencies.length,
              event: "task_scheduler_task_skipped",
              project_id: latestTask.project_id,
              reason: "session_assignment_missing",
              status: latestTask.status,
              task_id: latestTask.task_id,
            },
            "Task scheduler skipped task",
          );
          return false;
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
        logger.info(
          {
            dependency_count: latestTask.dependencies.length,
            done: latestTask.done,
            event: "task_scheduler_task_skipped",
            project_id: latestTask.project_id,
            reason: latestTask.done ? "task_done" : "session_missing",
            session_id: sessionId ?? null,
            status: latestTask.status,
            task_id: latestTask.task_id,
          },
          "Task scheduler skipped task",
        );
        return false;
      }

      if (boundInRound) {
        logger.info(buildTaskLogFields("task_session_bound", latestTask));
      }

      return boundInRound;
    } catch (error) {
      if (createdSession) {
        try {
          await createdSession[Symbol.asyncDispose]();
        } catch (disposeError) {
          logger.error(
            {
              err: disposeError,
              event: "task_scheduler_task_session_release_failed",
              taskId: task.task_id,
            },
            `Task scheduler failed while releasing task session ${task.task_id}`,
          );
        }
      }

      logger.error(
        {
          err: error,
          event: "task_scheduler_task_failed",
          project_id: task.project_id,
          status: task.status,
          taskId: task.task_id,
        },
        `Task scheduler failed while processing task ${task.task_id}`,
      );
      return false;
    }
  };

  const beginScan = (context?: SchedulerScanContext) => {
    if (scanPromise) {
      return scanPromise;
    }

    scanPromise = (async () => {
      logger.info(
        {
          event: "task_scheduler_scan_started",
          resolved_task_id: context?.resolvedTaskId ?? null,
        },
        "Task scheduler scan started",
      );
      const tasks = await options.taskRepository.listUnfinishedTasks();
      let processedTaskCount = 0;

      if (tasks.length === 0) {
        logger.info(
          {
            event: "task_scheduler_scan_succeeded",
            next_scan_after_ms: null,
            processed_task_count: processedTaskCount,
            resolved_task_id: context?.resolvedTaskId ?? null,
            task_count: tasks.length,
          },
          "Task scheduler scan succeeded",
        );
        return;
      }

      for (const task of prioritizeSessionTasks(tasks, context)) {
        if (await runTask(task)) {
          processedTaskCount += 1;
        }
      }

      logger.info(
        {
          event: "task_scheduler_scan_succeeded",
          next_scan_after_ms: null,
          processed_task_count: processedTaskCount,
          resolved_task_id: context?.resolvedTaskId ?? null,
          task_count: tasks.length,
        },
        "Task scheduler scan succeeded",
      );
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

          logger.info(
            {
              event: "task_scheduler_sleeping_until_next_tick",
              interval_ms: startOptions.intervalMs,
              next_scan_after_ms: startOptions.intervalMs,
            },
            "Task scheduler waiting for next tick",
          );
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
