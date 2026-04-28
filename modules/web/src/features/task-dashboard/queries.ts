import { ContractClientError } from "@aim-ai/contract";
import { queryOptions } from "@tanstack/react-query";

import {
  getTaskDashboard,
  getTaskPullRequestStatus,
  listDirectorClarifications,
  listOpenCodeSessions,
} from "./api/task-dashboard-api.js";
import { adaptTaskDashboard } from "./model/task-dashboard-adapter.js";

export const taskDashboardQueryKey = ["task-dashboard"] as const;
export const openCodeSessionsQueryKey = ["opencode-sessions"] as const;
export const directorClarificationsQueryKey = (projectId: string) =>
  ["director-clarifications", projectId] as const;
export const taskPullRequestStatusQueryKey = (taskId: string | null) =>
  ["task-pull-request-status", taskId] as const;

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

export const getDirectorClarificationErrorMessage = (error: unknown) =>
  error instanceof ContractClientError
    ? `Director clarification request failed: ${error.error.message}`
    : error instanceof Error
      ? `Director clarification request failed: ${error.message}`
      : "Director clarification request failed: unexpected error";

export const getTaskPullRequestStatusErrorMessage = (error: unknown) =>
  error instanceof ContractClientError
    ? `Pull request status unavailable: ${error.error.message}`
    : error instanceof Error
      ? `Pull request status unavailable: ${error.message}`
      : "Pull request status unavailable: unexpected error";

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

export const directorClarificationsQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: directorClarificationsQueryKey(projectId),
    queryFn: () => listDirectorClarifications(projectId),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

export const taskPullRequestStatusQueryOptions = (taskId: string | null) =>
  queryOptions({
    enabled: taskId !== null,
    queryKey: taskPullRequestStatusQueryKey(taskId),
    queryFn: () => getTaskPullRequestStatus(taskId ?? ""),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
