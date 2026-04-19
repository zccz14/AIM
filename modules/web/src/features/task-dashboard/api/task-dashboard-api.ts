import type { TaskListResponse } from "@aim-ai/contract";

import { createWebApiClient } from "../../../lib/api-client.js";

export const getTaskDashboard = async (): Promise<TaskListResponse> => {
  const client = createWebApiClient();

  return client.listTasks();
};
