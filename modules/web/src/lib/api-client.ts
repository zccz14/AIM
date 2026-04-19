import {
  ContractClientError,
  createContractClient,
  type TaskError,
  type TaskListResponse,
  taskErrorSchema,
  taskListResponseSchema,
  tasksPath,
} from "@aim-ai/contract";

import { readServerBaseUrl } from "./server-base-url.js";

const normalizeBaseUrl = (baseUrl: URL) => {
  const normalizedBaseUrl = new URL(baseUrl);

  if (!normalizedBaseUrl.pathname.endsWith("/")) {
    normalizedBaseUrl.pathname = `${normalizedBaseUrl.pathname}/`;
  }

  return normalizedBaseUrl;
};

const resolveContractUrl = (
  baseUrl: URL,
  input: Parameters<typeof fetch>[0],
) => {
  const url =
    input instanceof Request
      ? new URL(input.url)
      : new URL(input instanceof URL ? input.href : String(input), baseUrl);
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  if (url.pathname.startsWith(normalizedBaseUrl.pathname)) {
    return url;
  }

  return new URL(
    `${url.pathname.slice(1)}${url.search}${url.hash}`,
    normalizedBaseUrl,
  );
};

const toAbsoluteRequest = (
  baseUrl: URL,
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => {
  const resolvedUrl = resolveContractUrl(baseUrl, input);

  if (input instanceof Request) {
    return new Request(resolvedUrl, new Request(input, init));
  }

  return new Request(resolvedUrl, init);
};

type WebApiClient = ReturnType<typeof createContractClient> & {
  listTasks(): Promise<TaskListResponse>;
};

export const createWebApiClient = (
  baseUrl = readServerBaseUrl(),
): WebApiClient => {
  const resolvedBaseUrl = new URL(baseUrl, window.location.origin);
  const contractClient = createContractClient({
    fetch: (input, init) =>
      fetch(toAbsoluteRequest(resolvedBaseUrl, input, init)),
  });

  return {
    ...contractClient,
    async listTasks() {
      const response = await fetch(
        toAbsoluteRequest(resolvedBaseUrl, tasksPath),
        {
          headers: {
            accept: "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new ContractClientError(
          response.status,
          taskErrorSchema.parse((await response.json()) as TaskError) as never,
        );
      }

      return taskListResponseSchema.parse(
        (await response.json()) as TaskListResponse,
      );
    },
  };
};
