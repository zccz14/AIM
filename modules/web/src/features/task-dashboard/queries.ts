import { ContractClientError } from "@aim-ai/contract";
import { queryOptions } from "@tanstack/react-query";

import { getTaskDashboard } from "./api/task-dashboard-api.js";
import { adaptTaskDashboard } from "./model/task-dashboard-adapter.js";

export const taskDashboardQueryKey = ["task-dashboard"] as const;

export const getTaskDashboardErrorMessage = (error: unknown) =>
  error instanceof ContractClientError
    ? `Task dashboard unavailable: ${error.error.message}`
    : error instanceof Error
      ? `Task dashboard unavailable: ${error.message}`
      : "Task dashboard unavailable: unexpected error";

export const getTaskCreateErrorMessage = (error: unknown) =>
  error instanceof ContractClientError
    ? `Task creation failed: ${error.error.message}`
    : "Task creation failed: unexpected error";

export const taskDashboardQueryOptions = queryOptions({
  queryKey: taskDashboardQueryKey,
  queryFn: async () => adaptTaskDashboard(await getTaskDashboard()),
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
