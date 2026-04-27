import { createOpencodeClient } from "@opencode-ai/sdk";
import { classifySessionMessageState } from "./session-message-state.js";
import type {
  TaskSessionCoordinatorConfig,
  TaskSessionState,
} from "./task-session-coordinator.js";

export type AgentSessionInput = {
  modelId: string;
  projectPath: string;
  prompt: string;
  providerId: string;
  title: string;
};

export type AgentSessionCoordinator = {
  createSession(
    input: AgentSessionInput,
  ): Promise<AsyncDisposable & { sessionId: string }>;
  getSessionState(
    sessionId: string,
    projectPath: string,
  ): Promise<TaskSessionState>;
  sendPrompt(sessionId: string, input: AgentSessionInput): Promise<void>;
};

export const createAgentSessionCoordinator = (
  config: TaskSessionCoordinatorConfig,
): AgentSessionCoordinator => {
  const client = createOpencodeClient({ baseUrl: config.baseUrl });

  return {
    async createSession(input) {
      const session = await client.session.create({
        body: { title: input.title },
        query: { directory: input.projectPath },
        throwOnError: true,
      });

      await this.sendPrompt(session.data.id, input);

      return {
        async [Symbol.asyncDispose]() {
          await client.session.abort({
            path: { id: session.data.id },
            query: { directory: input.projectPath },
            throwOnError: true,
          });
        },
        sessionId: session.data.id,
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
    async sendPrompt(sessionId, input) {
      await client.session.promptAsync({
        body: {
          model: {
            modelID: input.modelId,
            providerID: input.providerId,
          },
          parts: [{ text: input.prompt, type: "text" }],
        },
        path: { id: sessionId },
        throwOnError: true,
      });
    },
  };
};
