import type { Task } from "@aim-ai/contract";

import { createOpenCodeSdkAdapter } from "./opencode-sdk-adapter.js";

export type TaskSessionState = "idle" | "running";

export type TaskSessionCoordinatorConfig = {
  baseUrl: string;
  sessionIdleFallbackTimeoutMs?: number;
};

type TaskSessionRecord = AsyncDisposable & {
  id: string;
};

type TaskSessionCoordinatorAdapter = {
  createSession(task: Task): Promise<TaskSessionRecord>;
  getSessionState(sessionId: string, task: Task): Promise<TaskSessionState>;
  sendPrompt(sessionId: string, prompt: string, task: Task): Promise<unknown>;
};

export type TaskSessionCoordinator = {
  createSession(task: Task): Promise<AsyncDisposable & { sessionId: string }>;
  getSessionState(sessionId: string, task: Task): Promise<TaskSessionState>;
  sendContinuePrompt(
    sessionId: string,
    prompt: string,
    task: Task,
  ): Promise<void>;
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
    async getSessionState(sessionId, task) {
      try {
        return await coordinatorAdapter.getSessionState(sessionId, task);
      } catch (error) {
        throw actionError("getSessionState", error);
      }
    },
    async sendContinuePrompt(sessionId, prompt, task) {
      try {
        await coordinatorAdapter.sendPrompt(sessionId, prompt, task);
      } catch (error) {
        throw actionError("sendContinuePrompt", error);
      }
    },
  };
};
