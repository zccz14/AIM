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

type RequestWithDuplex = Request & {
  duplex?: "half";
};

type RequestInitWithDuplex = RequestInit & {
  duplex?: "half";
};

const toForwardedRequestBody = async (request: Request) => {
  if (request.body === null) {
    return undefined;
  }

  const contentType = request.headers.get("content-type");

  if (contentType?.startsWith("application/json")) {
    return request.text();
  }

  return request.body;
};

const toAbsoluteRequestInit = async (
  baseUrl: URL,
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => {
  const resolvedUrl = resolveContractUrl(baseUrl, input);
  const request =
    input instanceof Request
      ? new Request(input, init)
      : new Request(resolvedUrl, init);
  const requestInit: RequestInitWithDuplex = {
    body: await toForwardedRequestBody(request),
    cache: request.cache,
    credentials: request.credentials,
    headers: request.headers,
    integrity: request.integrity,
    keepalive: request.keepalive,
    method: request.method,
    mode: request.mode,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    signal: request.signal,
  };
  const requestWithDuplex = request as RequestWithDuplex;

  if (request.body !== null && requestWithDuplex.duplex !== undefined) {
    requestInit.duplex = requestWithDuplex.duplex;
  }

  return [resolvedUrl, requestInit] as const;
};

type WebApiClient = ReturnType<typeof createContractClient> & {
  listTasks(): Promise<TaskListResponse>;
};

export const createWebApiClient = (
  baseUrl = readServerBaseUrl(),
): WebApiClient => {
  const resolvedBaseUrl = new URL(baseUrl, window.location.origin);
  const contractClient = createContractClient({
    fetch: async (input, init) => {
      const [requestInput, requestInit] = await toAbsoluteRequestInit(
        resolvedBaseUrl,
        input,
        init,
      );

      return fetch(requestInput, requestInit);
    },
  });

  return {
    ...contractClient,
    async listTasks() {
      const [requestInput, requestInit] = await toAbsoluteRequestInit(
        resolvedBaseUrl,
        tasksPath,
        {
          headers: {
            accept: "application/json",
          },
        },
      );
      const response = await fetch(requestInput, requestInit);

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
