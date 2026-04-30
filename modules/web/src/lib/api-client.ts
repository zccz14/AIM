import {
  ContractClientError,
  type CoordinatorProposalDryRunResponse,
  type CreateCoordinatorProposalDryRunRequest,
  type CreateDirectorClarificationRequest,
  coordinatorProposalDryRunPath,
  coordinatorProposalDryRunResponseSchema,
  createContractClient,
  createCoordinatorProposalDryRunRequestSchema,
  createDirectorClarificationRequestSchema,
  type DimensionEvaluationListResponse,
  type DimensionListResponse,
  type DirectorClarification,
  type DirectorClarificationListResponse,
  dimensionEvaluationListResponseSchema,
  dimensionEvaluationsPath,
  dimensionListResponseSchema,
  dimensionsPath,
  directorClarificationListResponseSchema,
  directorClarificationSchema,
  type OpenCodeSession,
  type OpenCodeSessionContinueBulkResponse,
  type OpenCodeSessionContinueResult,
  type OpenCodeSessionListResponse,
  openCodeSessionContinueBulkResponseSchema,
  openCodeSessionContinuePath,
  openCodeSessionContinuePendingPath,
  openCodeSessionContinueResultSchema,
  openCodeSessionListResponseSchema,
  openCodeSessionSchema,
  openCodeSessionsPath,
  openCodeSessionTokenUsageRefreshPath,
  type PatchDirectorClarificationRequest,
  patchDirectorClarificationRequestSchema,
  projectDirectorClarificationByIdPath,
  projectDirectorClarificationsPath,
  type Task,
  type TaskError,
  type TaskListResponse,
  type TaskPullRequestStatusResponse,
  taskErrorSchema,
  taskListResponseSchema,
  taskPullRequestStatusPath,
  taskPullRequestStatusResponseSchema,
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
  const contentType = request.headers.get("content-type");

  if (contentType?.startsWith("application/json")) {
    const bodyText = await request.text();

    return bodyText === "" ? undefined : bodyText;
  }

  if (request.body === null) {
    return undefined;
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
  listTasks(query?: {
    status?: Task["status"];
    done?: boolean;
    session_id?: string;
  }): Promise<TaskListResponse>;
  listOpenCodeSessions(): Promise<OpenCodeSessionListResponse>;
  refreshOpenCodeSessionTokenUsageById(
    sessionId: string,
  ): Promise<OpenCodeSession>;
  continuePendingOpenCodeSessions(): Promise<OpenCodeSessionContinueBulkResponse>;
  continueOpenCodeSession(
    sessionId: string,
  ): Promise<OpenCodeSessionContinueResult>;
  listDimensions(query: { project_id: string }): Promise<DimensionListResponse>;
  listDimensionEvaluations(
    dimensionId: string,
  ): Promise<DimensionEvaluationListResponse>;
  listDirectorClarifications(
    projectId: string,
    query?: { dimension_id?: string },
  ): Promise<DirectorClarificationListResponse>;
  getTaskPullRequestStatus(
    taskId: string,
  ): Promise<TaskPullRequestStatusResponse>;
  createDirectorClarification(
    projectId: string,
    input: CreateDirectorClarificationRequest,
  ): Promise<DirectorClarification>;
  patchDirectorClarificationStatus(
    projectId: string,
    clarificationId: string,
    input: PatchDirectorClarificationRequest,
  ): Promise<DirectorClarification>;
  createCoordinatorProposalDryRun(
    input: CreateCoordinatorProposalDryRunRequest,
  ): Promise<CoordinatorProposalDryRunResponse>;
};

const buildTaskListPath = (query?: {
  status?: Task["status"];
  done?: boolean;
  session_id?: string;
}) => {
  const searchParams = new URLSearchParams();

  if (query?.status !== undefined) {
    searchParams.set("status", query.status);
  }

  if (query?.done !== undefined) {
    searchParams.set("done", String(query.done));
  }

  if (query?.session_id !== undefined) {
    searchParams.set("session_id", query.session_id);
  }

  const queryString = searchParams.toString();

  return queryString.length === 0 ? tasksPath : `${tasksPath}?${queryString}`;
};

const buildDimensionListPath = (query: { project_id: string }) => {
  const searchParams = new URLSearchParams({
    project_id: query.project_id,
  });

  return `${dimensionsPath}?${searchParams.toString()}`;
};

const buildDimensionEvaluationListPath = (dimensionId: string) =>
  dimensionEvaluationsPath.replace(
    "{dimensionId}",
    encodeURIComponent(dimensionId),
  );

const buildProjectDirectorClarificationsPath = (
  projectId: string,
  query?: { dimension_id?: string },
) => {
  const path = projectDirectorClarificationsPath.replace(
    "{projectId}",
    encodeURIComponent(projectId),
  );

  if (!query?.dimension_id) {
    return path;
  }

  const searchParams = new URLSearchParams({
    dimension_id: query.dimension_id,
  });

  return `${path}?${searchParams.toString()}`;
};

const buildProjectDirectorClarificationByIdPath = (
  projectId: string,
  clarificationId: string,
) =>
  projectDirectorClarificationByIdPath
    .replace("{projectId}", encodeURIComponent(projectId))
    .replace("{clarificationId}", encodeURIComponent(clarificationId));

const buildTaskPullRequestStatusPath = (taskId: string) =>
  taskPullRequestStatusPath.replace("{taskId}", encodeURIComponent(taskId));

const buildOpenCodeSessionContinuePath = (sessionId: string) =>
  openCodeSessionContinuePath.replace(
    "{sessionId}",
    encodeURIComponent(sessionId),
  );

const buildOpenCodeSessionTokenUsageRefreshPath = (sessionId: string) =>
  openCodeSessionTokenUsageRefreshPath.replace(
    "{sessionId}",
    encodeURIComponent(sessionId),
  );

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
    async listTasks(query) {
      const [requestInput, requestInit] = await toAbsoluteRequestInit(
        resolvedBaseUrl,
        buildTaskListPath(query),
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

    async listOpenCodeSessions() {
      const [requestInput, requestInit] = await toAbsoluteRequestInit(
        resolvedBaseUrl,
        openCodeSessionsPath,
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

      return openCodeSessionListResponseSchema.parse(
        (await response.json()) as OpenCodeSessionListResponse,
      );
    },

    async refreshOpenCodeSessionTokenUsageById(sessionId) {
      const [requestInput, requestInit] = await toAbsoluteRequestInit(
        resolvedBaseUrl,
        buildOpenCodeSessionTokenUsageRefreshPath(sessionId),
        {
          method: "POST",
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

      return openCodeSessionSchema.parse(
        (await response.json()) as OpenCodeSession,
      );
    },

    async continuePendingOpenCodeSessions() {
      const [requestInput, requestInit] = await toAbsoluteRequestInit(
        resolvedBaseUrl,
        openCodeSessionContinuePendingPath,
        {
          method: "POST",
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

      return openCodeSessionContinueBulkResponseSchema.parse(
        (await response.json()) as OpenCodeSessionContinueBulkResponse,
      );
    },

    async continueOpenCodeSession(sessionId) {
      const [requestInput, requestInit] = await toAbsoluteRequestInit(
        resolvedBaseUrl,
        buildOpenCodeSessionContinuePath(sessionId),
        {
          method: "POST",
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

      return openCodeSessionContinueResultSchema.parse(
        (await response.json()) as OpenCodeSessionContinueResult,
      );
    },

    async listDimensions(query) {
      const [requestInput, requestInit] = await toAbsoluteRequestInit(
        resolvedBaseUrl,
        buildDimensionListPath(query),
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

      return dimensionListResponseSchema.parse(
        (await response.json()) as DimensionListResponse,
      );
    },

    async listDimensionEvaluations(dimensionId) {
      const [requestInput, requestInit] = await toAbsoluteRequestInit(
        resolvedBaseUrl,
        buildDimensionEvaluationListPath(dimensionId),
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

      return dimensionEvaluationListResponseSchema.parse(
        (await response.json()) as DimensionEvaluationListResponse,
      );
    },

    async listDirectorClarifications(projectId, query) {
      const [requestInput, requestInit] = await toAbsoluteRequestInit(
        resolvedBaseUrl,
        buildProjectDirectorClarificationsPath(projectId, query),
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

      return directorClarificationListResponseSchema.parse(
        (await response.json()) as DirectorClarificationListResponse,
      );
    },

    async getTaskPullRequestStatus(taskId) {
      const [requestInput, requestInit] = await toAbsoluteRequestInit(
        resolvedBaseUrl,
        buildTaskPullRequestStatusPath(taskId),
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

      return taskPullRequestStatusResponseSchema.parse(
        (await response.json()) as TaskPullRequestStatusResponse,
      );
    },

    async createDirectorClarification(projectId, input) {
      const [requestInput, requestInit] = await toAbsoluteRequestInit(
        resolvedBaseUrl,
        buildProjectDirectorClarificationsPath(projectId),
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify(
            createDirectorClarificationRequestSchema.parse(input),
          ),
        },
      );
      const response = await fetch(requestInput, requestInit);

      if (!response.ok) {
        throw new ContractClientError(
          response.status,
          taskErrorSchema.parse((await response.json()) as TaskError) as never,
        );
      }

      return directorClarificationSchema.parse(
        (await response.json()) as DirectorClarification,
      );
    },

    async patchDirectorClarificationStatus(projectId, clarificationId, input) {
      const [requestInput, requestInit] = await toAbsoluteRequestInit(
        resolvedBaseUrl,
        buildProjectDirectorClarificationByIdPath(projectId, clarificationId),
        {
          method: "PATCH",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify(
            patchDirectorClarificationRequestSchema.parse(input),
          ),
        },
      );
      const response = await fetch(requestInput, requestInit);

      if (!response.ok) {
        throw new ContractClientError(
          response.status,
          taskErrorSchema.parse((await response.json()) as TaskError) as never,
        );
      }

      return directorClarificationSchema.parse(
        (await response.json()) as DirectorClarification,
      );
    },

    async createCoordinatorProposalDryRun(input) {
      const [requestInput, requestInit] = await toAbsoluteRequestInit(
        resolvedBaseUrl,
        coordinatorProposalDryRunPath,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify(
            createCoordinatorProposalDryRunRequestSchema.parse(input),
          ),
        },
      );
      const response = await fetch(requestInput, requestInit);

      if (!response.ok) {
        throw new ContractClientError(
          response.status,
          taskErrorSchema.parse((await response.json()) as TaskError) as never,
        );
      }

      return coordinatorProposalDryRunResponseSchema.parse(
        (await response.json()) as CoordinatorProposalDryRunResponse,
      );
    },
  };
};
