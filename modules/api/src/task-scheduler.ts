import type { Task } from "@aim-ai/contract";

import { buildContinuePrompt } from "./task-continue-prompt.js";

export type SessionState = "idle" | "running";

type SchedulerTaskRepository = {
  assignSessionIfUnassigned(
    taskId: string,
    sessionId: string,
  ): Promise<null | Task>;
  listUnfinishedTasks(): Promise<Task[]>;
};

type CreateTaskSchedulerOptions = {
  concurrency?: number;
  createSession(task: Task): Promise<string>;
  getSessionState(sessionId: string): Promise<SessionState>;
  sendContinuePrompt(sessionId: string, prompt: string): Promise<void>;
  taskRepository: SchedulerTaskRepository;
};

type StartOptions = {
  intervalMs: number;
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
  let intervalHandle: NodeJS.Timeout | undefined;
  let roundPromise: Promise<void> | null = null;

  const runTask = async (
    task: Task,
    duplicateSessionIds: ReadonlySet<string>,
  ) => {
    try {
      let latestTask = task;

      if (!latestTask.session_id) {
        const sessionId = await options.createSession(latestTask);
        const assignedTask =
          await options.taskRepository.assignSessionIfUnassigned(
            latestTask.task_id,
            sessionId,
          );

        if (!assignedTask?.session_id) {
          return;
        }

        latestTask = assignedTask;
      }

      const sessionId = latestTask.session_id;

      if (!sessionId) {
        return;
      }

      if (duplicateSessionIds.has(sessionId)) {
        return;
      }

      const sessionState = await options.getSessionState(sessionId);

      if (sessionState !== "idle") {
        return;
      }

      await options.sendContinuePrompt(
        sessionId,
        buildContinuePrompt(latestTask),
      );
    } catch {
      // Isolate per-task failures so the current scan can continue.
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

      await runWithConcurrency(tasks, concurrency, async (task) => {
        await runTask(task, duplicateSessionIds);
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

      void beginRound();
      intervalHandle = setInterval(() => {
        void beginRound();
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
