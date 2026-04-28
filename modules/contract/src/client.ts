import { createClient as createGeneratedClient } from "../generated/_client/client/index.js";
import {
  createDirectorClarification,
  createProject,
  createTask,
  createTaskBatch,
  deleteProjectById,
  deleteTaskById,
  getHealth,
  getProjectOptimizerStatus,
  getTaskById,
  getTaskPullRequestStatusById,
  listDirectorClarifications,
  listOpenCodeModels,
  listProjects,
  listTasks,
  patchProjectById,
  patchTaskById,
  rejectTaskById,
  resolveTaskById,
} from "../generated/client.js";
import type {
  CreateDirectorClarificationError,
  CreateDirectorClarificationRequest,
  CreateDirectorClarificationResponse,
  CreateProjectError,
  CreateProjectRequest,
  CreateProjectResponse,
  CreateTaskBatchError,
  CreateTaskBatchRequest,
  CreateTaskBatchResponse,
  CreateTaskError,
  CreateTaskRequest,
  CreateTaskResponse,
  DeleteProjectByIdError,
  DeleteTaskByIdError,
  DirectorClarification,
  DirectorClarificationListResponse,
  ErrorResponse,
  GetHealthError,
  GetHealthResponse,
  GetProjectOptimizerStatusError,
  GetProjectOptimizerStatusResponse,
  GetTaskByIdError,
  GetTaskByIdResponse,
  GetTaskPullRequestStatusByIdError,
  GetTaskPullRequestStatusByIdResponse,
  HealthError,
  HealthResponse,
  ListDirectorClarificationsError,
  ListDirectorClarificationsResponse,
  ListTasksError,
  ListTasksResponse,
  OpenCodeModelsResponse,
  PatchProjectByIdError,
  PatchProjectByIdResponse,
  PatchProjectRequest,
  PatchTaskByIdError,
  PatchTaskByIdResponse,
  PatchTaskRequest,
  Project,
  ProjectListResponse,
  ProjectOptimizerStatusResponse,
  RejectTaskByIdError,
  ResolveTaskByIdError,
  Task,
  TaskBatchResponse,
  TaskListResponse,
  TaskPullRequestStatusResponse,
  TaskResultRequest,
} from "../generated/types.js";
import { schemas } from "../generated/zod.js";

export type ContractClientOptions = {
  fetch: typeof fetch;
};

type RequestWithDuplex = Request & {
  duplex?: "half";
};

type RequestInitWithDuplex = RequestInit & {
  duplex?: "half";
};

export class ContractClientError extends Error {
  readonly status: number;
  readonly error: HealthError | ErrorResponse;

  constructor(status: number, error: HealthError | ErrorResponse) {
    super(error.message);
    this.name = "ContractClientError";
    this.status = status;
    this.error = error;
  }
}

export type ContractClient = {
  getHealth(): Promise<HealthResponse>;
  listOpenCodeModels(): Promise<OpenCodeModelsResponse>;
  listTasks(query?: {
    status?: Task["status"];
    done?: boolean;
    session_id?: string;
  }): Promise<TaskListResponse>;
  listProjects(): Promise<ProjectListResponse>;
  createProject(input: CreateProjectRequest): Promise<Project>;
  patchProjectById(
    projectId: string,
    input: PatchProjectRequest,
  ): Promise<Project>;
  getProjectOptimizerStatus(
    projectId: string,
  ): Promise<ProjectOptimizerStatusResponse>;
  listDirectorClarifications(
    projectId: string,
  ): Promise<DirectorClarificationListResponse>;
  createDirectorClarification(
    projectId: string,
    input: CreateDirectorClarificationRequest,
  ): Promise<DirectorClarification>;
  deleteProjectById(projectId: string): Promise<void>;
  createTaskBatch(input: CreateTaskBatchRequest): Promise<TaskBatchResponse>;
  createTask(input: CreateTaskRequest): Promise<Task>;
  getTaskById(taskId: string): Promise<Task>;
  getTaskPullRequestStatusById(
    taskId: string,
  ): Promise<TaskPullRequestStatusResponse>;
  patchTaskById(taskId: string, input: PatchTaskRequest): Promise<Task>;
  deleteTaskById(taskId: string): Promise<void>;
  resolveTaskById(taskId: string, input: TaskResultRequest): Promise<void>;
  rejectTaskById(taskId: string, input: TaskResultRequest): Promise<void>;
};

const generatedBaseUrl = "http://contract.internal";
const generatedBaseOrigin = new URL(generatedBaseUrl).origin;
const healthResponseSchema = schemas.HealthResponse;
const healthErrorSchema = schemas.HealthError;
const projectSchema = schemas.Project;
const projectListResponseSchema = schemas.ProjectListResponse;
const projectOptimizerStatusResponseSchema =
  schemas.ProjectOptimizerStatusResponse;
const directorClarificationSchema = schemas.DirectorClarification;
const directorClarificationListResponseSchema =
  schemas.DirectorClarificationListResponse;
const taskSchema = schemas.Task;
const taskListResponseSchema = schemas.TaskListResponse;
const taskBatchResponseSchema = schemas.TaskBatchResponse;
const taskPullRequestStatusResponseSchema =
  schemas.TaskPullRequestStatusResponse;
const opencodeModelsResponseSchema = schemas.OpenCodeModelsResponse;
const taskErrorSchema = schemas.ErrorResponse;

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

const toPublicFetchInit = async (request: Request): Promise<RequestInit> => {
  const init: RequestInitWithDuplex = {
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
    init.duplex = requestWithDuplex.duplex;
  }

  return init;
};

export const adaptGeneratedRequestForPublicFetch = async (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<[Parameters<typeof fetch>[0], Parameters<typeof fetch>[1]?]> => {
  const request =
    input instanceof Request ? input.clone() : new Request(input, init);
  const url = new URL(request.url);

  if (url.origin !== generatedBaseOrigin) {
    return [input, init];
  }

  return [
    `${url.pathname}${url.search}${url.hash}`,
    await toPublicFetchInit(request),
  ];
};

export const createContractClient = ({
  fetch: fetchImpl,
}: ContractClientOptions): ContractClient => {
  const client = createGeneratedClient({
    baseUrl: generatedBaseUrl,
    fetch: async (input, init) => {
      return fetchImpl(
        ...(await adaptGeneratedRequestForPublicFetch(input, init)),
      );
    },
  });

  return {
    async getHealth() {
      const result = await getHealth({
        client,
        headers: {
          accept: "application/json",
        },
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          healthErrorSchema.parse(result.error satisfies GetHealthError),
        );
      }

      return healthResponseSchema.parse(
        result.data satisfies GetHealthResponse,
      ) satisfies HealthResponse;
    },

    async listTasks(query) {
      const result = await listTasks({
        client,
        headers: {
          accept: "application/json",
        },
        query,
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          taskErrorSchema.parse(result.error satisfies ListTasksError),
        );
      }

      return taskListResponseSchema.parse(
        result.data satisfies ListTasksResponse,
      ) satisfies TaskListResponse;
    },

    async listProjects() {
      const result = await listProjects({
        client,
        headers: {
          accept: "application/json",
        },
      });

      return projectListResponseSchema.parse(
        result.data,
      ) satisfies ProjectListResponse;
    },

    async createProject(input) {
      const result = await createProject({
        body: input,
        client,
        headers: {
          accept: "application/json",
        },
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          taskErrorSchema.parse(result.error satisfies CreateProjectError),
        );
      }

      return projectSchema.parse(
        result.data satisfies CreateProjectResponse,
      ) satisfies Project;
    },

    async patchProjectById(projectId, input) {
      const result = await patchProjectById({
        body: input,
        client,
        headers: {
          accept: "application/json",
        },
        path: {
          projectId,
        },
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          taskErrorSchema.parse(result.error satisfies PatchProjectByIdError),
        );
      }

      return projectSchema.parse(
        result.data satisfies PatchProjectByIdResponse,
      ) satisfies Project;
    },

    async getProjectOptimizerStatus(projectId) {
      const result = await getProjectOptimizerStatus({
        client,
        headers: {
          accept: "application/json",
        },
        path: {
          projectId,
        },
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          taskErrorSchema.parse(
            result.error satisfies GetProjectOptimizerStatusError,
          ),
        );
      }

      return projectOptimizerStatusResponseSchema.parse(
        result.data satisfies GetProjectOptimizerStatusResponse,
      ) satisfies ProjectOptimizerStatusResponse;
    },

    async deleteProjectById(projectId) {
      const result = await deleteProjectById({
        client,
        headers: {
          accept: "application/json",
        },
        path: {
          projectId,
        },
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          taskErrorSchema.parse(result.error satisfies DeleteProjectByIdError),
        );
      }
    },

    async listDirectorClarifications(projectId) {
      const result = await listDirectorClarifications({
        client,
        headers: {
          accept: "application/json",
        },
        path: {
          projectId,
        },
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          taskErrorSchema.parse(
            result.error satisfies ListDirectorClarificationsError,
          ),
        );
      }

      return directorClarificationListResponseSchema.parse(
        result.data satisfies ListDirectorClarificationsResponse,
      ) satisfies DirectorClarificationListResponse;
    },

    async createDirectorClarification(projectId, input) {
      const result = await createDirectorClarification({
        body: input,
        client,
        headers: {
          accept: "application/json",
        },
        path: {
          projectId,
        },
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          taskErrorSchema.parse(
            result.error satisfies CreateDirectorClarificationError,
          ),
        );
      }

      return directorClarificationSchema.parse(
        result.data satisfies CreateDirectorClarificationResponse,
      ) satisfies DirectorClarification;
    },

    async listOpenCodeModels() {
      const result = await listOpenCodeModels({
        client,
        headers: {
          accept: "application/json",
        },
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          taskErrorSchema.parse(result.error),
        );
      }

      return opencodeModelsResponseSchema.parse(
        result.data,
      ) satisfies OpenCodeModelsResponse;
    },

    async createTaskBatch(input) {
      const result = await createTaskBatch({
        body: input,
        client,
        headers: {
          accept: "application/json",
        },
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          taskErrorSchema.parse(result.error satisfies CreateTaskBatchError),
        );
      }

      return taskBatchResponseSchema.parse(
        result.data satisfies CreateTaskBatchResponse,
      ) satisfies TaskBatchResponse;
    },

    async createTask(input) {
      const result = await createTask({
        body: input,
        client,
        headers: {
          accept: "application/json",
        },
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          taskErrorSchema.parse(result.error satisfies CreateTaskError),
        );
      }

      return taskSchema.parse(
        result.data satisfies CreateTaskResponse,
      ) satisfies Task;
    },

    async getTaskById(taskId) {
      const result = await getTaskById({
        client,
        headers: {
          accept: "application/json",
        },
        path: {
          taskId,
        },
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          taskErrorSchema.parse(result.error satisfies GetTaskByIdError),
        );
      }

      return taskSchema.parse(
        result.data satisfies GetTaskByIdResponse,
      ) satisfies Task;
    },

    async getTaskPullRequestStatusById(taskId) {
      const result = await getTaskPullRequestStatusById({
        client,
        headers: {
          accept: "application/json",
        },
        path: {
          taskId,
        },
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          taskErrorSchema.parse(
            result.error satisfies GetTaskPullRequestStatusByIdError,
          ),
        );
      }

      return taskPullRequestStatusResponseSchema.parse(
        result.data satisfies GetTaskPullRequestStatusByIdResponse,
      ) satisfies TaskPullRequestStatusResponse;
    },

    async patchTaskById(taskId, input) {
      const result = await patchTaskById({
        body: input,
        client,
        headers: {
          accept: "application/json",
        },
        path: {
          taskId,
        },
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          taskErrorSchema.parse(result.error satisfies PatchTaskByIdError),
        );
      }

      return taskSchema.parse(
        result.data satisfies PatchTaskByIdResponse,
      ) satisfies Task;
    },

    async deleteTaskById(taskId) {
      const result = await deleteTaskById({
        client,
        headers: {
          accept: "application/json",
        },
        path: {
          taskId,
        },
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          taskErrorSchema.parse(result.error satisfies DeleteTaskByIdError),
        );
      }
    },

    async resolveTaskById(taskId, input) {
      const result = await resolveTaskById({
        body: input,
        client,
        headers: {
          accept: "application/json",
        },
        path: {
          taskId,
        },
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          taskErrorSchema.parse(result.error satisfies ResolveTaskByIdError),
        );
      }
    },

    async rejectTaskById(taskId, input) {
      const result = await rejectTaskById({
        body: input,
        client,
        headers: {
          accept: "application/json",
        },
        path: {
          taskId,
        },
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          taskErrorSchema.parse(result.error satisfies RejectTaskByIdError),
        );
      }
    },
  };
};
