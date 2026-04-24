import type {
  OpenCodeModelsResponse,
  Task,
  TaskListResponse,
} from "@aim-ai/contract";

import { createWebApiClient } from "../../../lib/api-client.js";

export type CreateDashboardTaskInput = {
  title: string;
  taskSpec: string;
  projectPath: string;
  developerProviderId: string;
  developerModelId: string;
};

export const getTaskDashboard = async (): Promise<TaskListResponse> => {
  const client = createWebApiClient();

  return client.listTasks();
};

export const createTaskFromDashboard = async (
  input: CreateDashboardTaskInput,
): Promise<Task> => {
  const client = createWebApiClient();

  return client.createTask({
    title: input.title,
    task_spec: input.taskSpec,
    project_path: input.projectPath,
    developer_provider_id: input.developerProviderId,
    developer_model_id: input.developerModelId,
  });
};

export const getOpenCodeModels = async (): Promise<OpenCodeModelsResponse> => {
  const client = createWebApiClient();

  return client.listOpenCodeModels();
};
