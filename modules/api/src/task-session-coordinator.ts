import type { Task } from "@aim-ai/contract";

import { createOpenCodeSdkAdapter } from "./opencode-sdk-adapter.js";

export type TaskSessionCoordinatorConfig = {
  baseUrl: string;
  sessionIdleFallbackTimeoutMs?: number;
};

type TaskSessionRecord = AsyncDisposable & {
  id: string;
};

type TaskSessionCoordinatorAdapter = {
  createSession(task: Task): Promise<TaskSessionRecord>;
};

export type TaskSessionCoordinator = {
  createSession(task: Task): Promise<AsyncDisposable & { sessionId: string }>;
};

const actionError = (action: string, cause: unknown) =>
  new Error(`Task session coordinator failed during ${action}`, { cause });

const requireNonEmpty = (
  value: string,
  field: keyof TaskSessionCoordinatorConfig,
) => {
  if (!value.trim()) {
    throw new Error(`Task session coordinator requires a non-empty ${field}`);
  }
};

export const createTaskSessionCoordinator = (
  config: TaskSessionCoordinatorConfig,
  adapter?: TaskSessionCoordinatorAdapter,
): TaskSessionCoordinator => {
  requireNonEmpty(config.baseUrl, "baseUrl");

  const coordinatorAdapter = adapter ?? createOpenCodeSdkAdapter(config);

  return {
    async createSession(task) {
      try {
        const session = await coordinatorAdapter.createSession(task);

        return {
          async [Symbol.asyncDispose]() {
            await session[Symbol.asyncDispose]();
          },
          sessionId: session.id,
        };
      } catch (error) {
        throw actionError("createSession", error);
      }
    },
  };
};
