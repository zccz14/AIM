import type { Task } from "@aim-ai/contract";
import { createOpencodeClient } from "@opencode-ai/sdk";

import { classifySessionMessageState } from "./session-message-state.js";
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

const buildTaskPrompt = (action: "continue" | "start", task: Task) =>
  `${action === "start" ? "Start" : "Continue"} the assigned task session.

task_id: ${task.task_id}
task_spec: ${task.task_spec}
status: ${task.status}
project_path: ${task.project_path}
worktree_path: ${task.worktree_path ?? "null"}
pull_request_url: ${task.pull_request_url ?? "null"}

${
  action === "start"
    ? "Start this task from scratch and follow the normal session workflow. Follow the packaged skill aim-task-lifecycle for lifecycle/status reporting and workflow expectations during initial execution. If you cannot continue, write the task's failure state. When the task is complete, write done=true."
    : "Continue this task from its current state through the normal session workflow. If you cannot continue, write the task's failure state. When the task is complete, write done=true."
}`;

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
          parts: [{ text: buildTaskPrompt("start", task), type: "text" }],
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
