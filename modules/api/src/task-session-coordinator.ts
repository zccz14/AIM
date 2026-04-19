import type { Task } from "@aim-ai/contract";

import { createOpenCodeSdkAdapter } from "./opencode-sdk-adapter.js";

export type TaskSessionState = "idle" | "running";

export type TaskSessionCoordinatorConfig = {
  baseUrl: string;
  modelId: string;
  providerId: string;
};

type TaskSessionRecord = {
  id: string;
};

type TaskSessionCoordinatorAdapter = {
  createSession(task: Task): Promise<TaskSessionRecord>;
  getSession(sessionId: string): Promise<unknown>;
  sendPrompt(sessionId: string, prompt: string): Promise<unknown>;
};

export type TaskSessionCoordinator = {
  createSession(task: Task): Promise<{ sessionId: string }>;
  getSessionState(sessionId: string): Promise<TaskSessionState>;
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
  adapter: TaskSessionCoordinatorAdapter = createOpenCodeSdkAdapter(config),
): TaskSessionCoordinator => {
  requireNonEmpty(config.baseUrl, "baseUrl");
  requireNonEmpty(config.modelId, "modelId");
  requireNonEmpty(config.providerId, "providerId");

  return {
    async createSession(task) {
      try {
        const session = await adapter.createSession(task);

        return { sessionId: session.id };
      } catch (error) {
        throw actionError("createSession", error);
      }
    },
    async getSessionState(sessionId) {
      let session: unknown;

      try {
        session = await adapter.getSession(sessionId);
      } catch (error) {
        throw actionError("getSessionState", error);
      }

      const status =
        typeof session === "object" && session !== null && "status" in session
          ? session.status
          : typeof session === "object" && session !== null && "type" in session
            ? session.type
            : undefined;

      switch (status) {
        case "idle":
          return "idle";
        case "busy":
        case "retry":
        case "running":
          return "running";
        default:
          throw new Error(`Unknown OpenCode session status: ${String(status)}`);
      }
    },
    async sendContinuePrompt(sessionId, prompt) {
      try {
        await adapter.sendPrompt(sessionId, prompt);
      } catch (error) {
        throw actionError("sendContinuePrompt", error);
      }
    },
  };
};
