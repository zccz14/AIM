import type { Task } from "@aim-ai/contract";

export type TaskSessionState = "idle" | "running";

export type TaskSessionCoordinator = {
  createSession(task: Task): Promise<{ sessionId: string }>;
  getSessionState(sessionId: string): Promise<TaskSessionState>;
  sendContinuePrompt(sessionId: string, prompt: string): Promise<void>;
};

const unavailableError = (action: string) =>
  new Error(`Task session coordinator is unavailable for ${action}`);

export const createTaskSessionCoordinator = (): TaskSessionCoordinator => ({
  async createSession() {
    throw unavailableError("createSession");
  },
  async getSessionState() {
    throw unavailableError("getSessionState");
  },
  async sendContinuePrompt() {
    throw unavailableError("sendContinuePrompt");
  },
});
