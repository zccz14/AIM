import type { Task } from "@aim-ai/contract";
import { createOpencodeClient } from "@opencode-ai/sdk";

import { classifySessionMessageState } from "./session-message-state.js";
import { buildTaskSessionPrompt } from "./task-continue-prompt.js";
import type {
  TaskSessionCoordinatorConfig,
  TaskSessionState,
} from "./task-session-coordinator.js";

export type OpenCodeSdkAdapter = {
  createSession(task: Task): Promise<{ id: string }>;
  getSessionState(
    sessionId: string,
    projectPath: string,
  ): Promise<TaskSessionState>;
  sendPrompt(sessionId: string, prompt: string): Promise<void>;
};

export const createOpenCodeSdkAdapter = (
  config: TaskSessionCoordinatorConfig,
): OpenCodeSdkAdapter => {
  const client = createOpencodeClient({
    baseUrl: config.baseUrl,
  });

  return {
    async createSession(task) {
      const session = await client.session.create({
        query: { directory: task.project_path },
        throwOnError: true,
      });

      await client.session.promptAsync({
        body: {
          model: {
            modelID: config.modelId,
            providerID: config.providerId,
          },
          parts: [{ text: buildTaskSessionPrompt(task), type: "text" }],
        },
        path: { id: session.data.id },
        throwOnError: true,
      });

      return { id: session.data.id };
    },
    async getSessionState(sessionId, projectPath) {
      const response = await client.session.messages({
        path: { id: sessionId },
        query: { directory: projectPath },
        throwOnError: true,
      });

      return classifySessionMessageState(response.data);
    },
    async sendPrompt(sessionId, prompt) {
      await client.session.promptAsync({
        body: {
          model: {
            modelID: config.modelId,
            providerID: config.providerId,
          },
          parts: [{ text: prompt, type: "text" }],
        },
        path: { id: sessionId },
        throwOnError: true,
      });
    },
  };
};
