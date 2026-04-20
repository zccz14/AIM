import type { Task, TaskListResponse } from "@aim-ai/contract";

import { createWebApiClient } from "../../../lib/api-client.js";

export type CreateDashboardTaskInput = {
  taskSpec: string;
  projectPath: string;
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
    task_spec: input.taskSpec,
    project_path: input.projectPath,
  });
};
