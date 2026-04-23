import type { Task } from "@aim-ai/contract";

import { createOpenCodeSdkAdapter } from "./opencode-sdk-adapter.js";

export type TaskSessionState = "idle" | "running";

export type TaskSessionCoordinatorConfig = {
  baseUrl: string;
  modelId: string;
  providerId: string;
  sessionIdleFallbackTimeoutMs?: number;
};

type TaskSessionRecord = {
  id: string;
};

type TaskSessionCoordinatorAdapter = {
  createSession(task: Task): Promise<TaskSessionRecord>;
  getSessionState(
    sessionId: string,
    projectPath: string,
  ): Promise<TaskSessionState>;
  sendPrompt(sessionId: string, prompt: string): Promise<unknown>;
};

export type TaskSessionCoordinator = {
  createSession(task: Task): Promise<{ sessionId: string }>;
  getSessionState(
    sessionId: string,
    projectPath: string,
  ): Promise<TaskSessionState>;
  sendContinuePrompt(sessionId: string, prompt: string): Promise<void>;
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
  requireNonEmpty(config.modelId, "modelId");
  requireNonEmpty(config.providerId, "providerId");

  const coordinatorAdapter = adapter ?? createOpenCodeSdkAdapter(config);

  return {
    async createSession(task) {
      try {
        const session = await coordinatorAdapter.createSession(task);

        return { sessionId: session.id };
      } catch (error) {
        throw actionError("createSession", error);
      }
    },
    async getSessionState(sessionId, projectPath) {
      try {
        return await coordinatorAdapter.getSessionState(sessionId, projectPath);
      } catch (error) {
        throw actionError("getSessionState", error);
      }
    },
    async sendContinuePrompt(sessionId, prompt) {
      try {
        await coordinatorAdapter.sendPrompt(sessionId, prompt);
      } catch (error) {
        throw actionError("sendContinuePrompt", error);
      }
    },
  };
};
