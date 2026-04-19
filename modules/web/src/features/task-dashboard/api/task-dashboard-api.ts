import { createContractClient, type Task, type TaskListResponse } from "@aim-ai/contract";

import { createWebApiClient } from "../../../lib/api-client.js";
import { readServerBaseUrl } from "../../../lib/server-base-url.js";

const normalizeBaseUrl = (baseUrl: URL) => {
  const normalizedBaseUrl = new URL(baseUrl);

  if (!normalizedBaseUrl.pathname.endsWith("/")) {
    normalizedBaseUrl.pathname = `${normalizedBaseUrl.pathname}/`;
  }

  return normalizedBaseUrl;
};

const resolveContractUrl = (baseUrl: URL, request: Request) => {
  const url = new URL(request.url);
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  if (url.pathname.startsWith(normalizedBaseUrl.pathname)) {
    return url;
  }

  return new URL(
    `${url.pathname.slice(1)}${url.search}${url.hash}`,
    normalizedBaseUrl,
  );
};

const createTaskWriteClient = () => {
  const resolvedBaseUrl = new URL(readServerBaseUrl(), window.location.origin);

  return createContractClient({
    fetch: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const body = request.body === null ? undefined : await request.text();

      return fetch(resolveContractUrl(resolvedBaseUrl, request), {
        body,
        headers: request.headers,
        method: request.method,
      });
    },
  });
};

export const getTaskDashboard = async (): Promise<TaskListResponse> => {
  const client = createWebApiClient();

  return client.listTasks();
};

export const createTaskFromDashboard = async (
  taskSpec: string,
): Promise<Task> => {
  const client = createTaskWriteClient();

  return client.createTask({ task_spec: taskSpec });
};
