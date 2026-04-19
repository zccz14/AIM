import type { Task } from "@aim-ai/contract";

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

const unavailableError = (action: string) =>
  new Error(`Task session coordinator is unavailable for ${action}`);

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

const createUnavailableAdapter = (): TaskSessionCoordinatorAdapter => ({
  async createSession() {
    throw unavailableError("createSession");
  },
  async getSession() {
    throw unavailableError("getSessionState");
  },
  async sendPrompt() {
    throw unavailableError("sendContinuePrompt");
  },
});

export const createTaskSessionCoordinator = (
  config: TaskSessionCoordinatorConfig,
  adapter: TaskSessionCoordinatorAdapter = createUnavailableAdapter(),
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
    async getSessionState() {
      throw unavailableError("getSessionState");
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
