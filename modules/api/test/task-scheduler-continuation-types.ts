import type { createTaskScheduler } from "../src/task-scheduler.js";

type SchedulerOptions = Parameters<typeof createTaskScheduler>[0];
type ContinuationSessionRepository = NonNullable<
  SchedulerOptions["continuationSessionRepository"]
>;
type CreateSessionReturn = ReturnType<
  ContinuationSessionRepository["createSession"]
>;

const createSessionReturnsAwaitable: Promise<unknown> =
  null as never as CreateSessionReturn;

void createSessionReturnsAwaitable;
