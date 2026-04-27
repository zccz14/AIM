import type { OpenCodeModelsResponse, Task } from "@aim-ai/contract";
import { createOpencodeClient } from "@opencode-ai/sdk";

import { classifySessionMessageState } from "./session-message-state.js";
import { buildTaskSessionPrompt } from "./task-continue-prompt.js";
import type {
  TaskSessionCoordinatorConfig,
  TaskSessionState,
} from "./task-session-coordinator.js";

export type OpenCodeSdkAdapter = {
  createSession(task: Task): Promise<AsyncDisposable & { id: string }>;
  getSessionState(
    sessionId: string,
    projectPath: string,
  ): Promise<TaskSessionState>;
  listSupportedModels(): Promise<OpenCodeModelsResponse>;
  sendPrompt(sessionId: string, prompt: string, task: Task): Promise<void>;
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
        body: {
          title: `AIM Developer: ${task.title}`,
        },
        throwOnError: true,
      });

      await client.session.promptAsync({
        body: {
          model: {
            modelID: task.developer_model_id,
            providerID: task.developer_provider_id,
          },
          parts: [{ text: buildTaskSessionPrompt(task), type: "text" }],
        },
        path: { id: session.data.id },
        throwOnError: true,
      });

      return {
        async [Symbol.asyncDispose]() {
          await client.session.abort({
            path: { id: session.data.id },
            query: { directory: task.project_path },
            throwOnError: true,
          });
        },
        id: session.data.id,
      };
    },
    async getSessionState(sessionId, projectPath) {
      const response = await client.session.messages({
        path: { id: sessionId },
        query: { directory: projectPath },
        throwOnError: true,
      });

      return classifySessionMessageState(response.data, {
        idleFallbackTimeoutMs: config.sessionIdleFallbackTimeoutMs,
        nowMs: Date.now(),
      });
    },
    async listSupportedModels() {
      const response = await client.provider.list({ throwOnError: true });

      return {
        items: response.data.all.flatMap((provider) =>
          Object.values(provider.models).map((model) => ({
            model_id: model.id,
            model_name: model.name,
            provider_id: provider.id,
            provider_name: provider.name,
          })),
        ),
      };
    },
    async sendPrompt(sessionId, prompt, task) {
      await client.session.promptAsync({
        body: {
          model: {
            modelID: task.developer_model_id,
            providerID: task.developer_provider_id,
          },
          parts: [{ text: prompt, type: "text" }],
        },
        path: { id: sessionId },
        throwOnError: true,
      });
    },
  };
};
