import { ContractClientError } from "@aim-ai/contract";
import { queryOptions } from "@tanstack/react-query";

import {
  getTaskDashboard,
  listOpenCodeSessions,
} from "./api/task-dashboard-api.js";
import { adaptTaskDashboard } from "./model/task-dashboard-adapter.js";

export const taskDashboardQueryKey = ["task-dashboard"] as const;
export const openCodeSessionsQueryKey = ["opencode-sessions"] as const;

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

export const getOpenCodeSessionsErrorMessage = (error: unknown) =>
  error instanceof ContractClientError
    ? `OpenCode sessions unavailable: ${error.error.message}`
    : error instanceof Error
      ? `OpenCode sessions unavailable: ${error.message}`
      : "OpenCode sessions unavailable: unexpected error";

export const taskDashboardQueryOptions = queryOptions({
  queryKey: taskDashboardQueryKey,
  queryFn: async () => adaptTaskDashboard(await getTaskDashboard()),
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});

export const openCodeSessionsQueryOptions = queryOptions({
  queryKey: openCodeSessionsQueryKey,
  queryFn: listOpenCodeSessions,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
