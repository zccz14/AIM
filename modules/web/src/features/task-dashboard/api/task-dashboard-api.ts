import type { Task, TaskListResponse } from "@aim-ai/contract";

import { createWebApiClient } from "../../../lib/api-client.js";

export const getTaskDashboard = async (): Promise<TaskListResponse> => {
  const client = createWebApiClient();

  return client.listTasks();
};

export const createTaskFromDashboard = async (
  taskSpec: string,
): Promise<Task> => {
  const client = createWebApiClient();

  return client.createTask({ task_spec: taskSpec });
};
