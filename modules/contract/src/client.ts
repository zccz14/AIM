import { createClient as createGeneratedClient } from "../generated/_client/client/index.js";
import {
  createCoordinatorProposalDryRun,
  createDirectorClarification,
  createProject,
  createTask,
  createTaskBatch,
  deleteProjectById,
  deleteTaskById,
  getDimensionById,
  getHealth,
  getProjectOptimizerStatus,
  getProjectTokenUsage,
  getTaskById,
  getTaskPullRequestStatusById,
  listDimensionEvaluations,
  listDimensions,
  listDirectorClarifications,
  listOpenCodeModels,
  listProjects,
  listTasks,
  patchDirectorClarificationById,
  patchProjectById,
  patchTaskById,
} from "../generated/client.js";
import type {
  CoordinatorProposalDryRunResponse,
  CreateCoordinatorProposalDryRunError,
  CreateCoordinatorProposalDryRunRequest,
  CreateCoordinatorProposalDryRunResponse,
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
  Dimension,
  DimensionEvaluationListResponse,
  DimensionListResponse,
  DirectorClarification,
  DirectorClarificationListResponse,
  ErrorResponse,
  GetDimensionByIdError,
  GetDimensionByIdResponse,
  GetHealthError,
  GetHealthResponse,
  GetProjectOptimizerStatusError,
  GetProjectOptimizerStatusResponse,
  GetProjectTokenUsageError,
  GetProjectTokenUsageResponse,
  GetTaskByIdError,
  GetTaskByIdResponse,
  GetTaskPullRequestStatusByIdError,
  GetTaskPullRequestStatusByIdResponse,
  HealthError,
  HealthResponse,
  ListDimensionEvaluationsError,
  ListDimensionEvaluationsResponse,
  ListDimensionsError,
  ListDimensionsResponse,
  ListDirectorClarificationsError,
  ListDirectorClarificationsResponse,
  ListTasksError,
  ListTasksResponse,
  OpenCodeModelsResponse,
  PatchDirectorClarificationByIdError,
  PatchDirectorClarificationByIdResponse,
  PatchDirectorClarificationRequest,
  PatchProjectByIdError,
  PatchProjectByIdResponse,
  PatchProjectRequest,
  PatchTaskByIdError,
  PatchTaskByIdResponse,
  PatchTaskRequest,
  Project,
  ProjectListResponse,
  ProjectOptimizerStatusResponse,
  ProjectTokenUsageResponse,
  Task,
  TaskBatchResponse,
  TaskListResponse,
  TaskPullRequestStatusResponse,
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
  listDimensions(query: { project_id: string }): Promise<DimensionListResponse>;
  getDimensionById(dimensionId: string): Promise<Dimension>;
  listDimensionEvaluations(
    dimensionId: string,
  ): Promise<DimensionEvaluationListResponse>;
  listTasks(query?: {
    status?: Task["status"];
    done?: boolean;
    project_id?: string;
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
  getProjectTokenUsage(projectId: string): Promise<ProjectTokenUsageResponse>;
  listDirectorClarifications(
    projectId: string,
    query?: { dimension_id?: string },
  ): Promise<DirectorClarificationListResponse>;
  createDirectorClarification(
    projectId: string,
    input: CreateDirectorClarificationRequest,
  ): Promise<DirectorClarification>;
  patchDirectorClarificationById(
    projectId: string,
    clarificationId: string,
    input: PatchDirectorClarificationRequest,
  ): Promise<DirectorClarification>;
  deleteProjectById(projectId: string): Promise<void>;
  createTaskBatch(input: CreateTaskBatchRequest): Promise<TaskBatchResponse>;
  createCoordinatorProposalDryRun(
    input: CreateCoordinatorProposalDryRunRequest,
  ): Promise<CoordinatorProposalDryRunResponse>;
  createTask(input: CreateTaskRequest): Promise<Task>;
  getTaskById(taskId: string): Promise<Task>;
  getTaskPullRequestStatusById(
    taskId: string,
  ): Promise<TaskPullRequestStatusResponse>;
  patchTaskById(taskId: string, input: PatchTaskRequest): Promise<Task>;
  deleteTaskById(taskId: string): Promise<void>;
};

const generatedBaseUrl = "http://contract.internal";
const generatedBaseOrigin = new URL(generatedBaseUrl).origin;
const healthResponseSchema = schemas.HealthResponse;
const healthErrorSchema = schemas.HealthError;
const dimensionSchema = schemas.Dimension;
const dimensionListResponseSchema = schemas.DimensionListResponse;
const dimensionEvaluationListResponseSchema =
  schemas.DimensionEvaluationListResponse;
const projectSchema = schemas.Project;
const projectListResponseSchema = schemas.ProjectListResponse;
const projectOptimizerStatusResponseSchema =
  schemas.ProjectOptimizerStatusResponse;
const projectTokenUsageResponseSchema = schemas.ProjectTokenUsageResponse;
const directorClarificationSchema = schemas.DirectorClarification;
const directorClarificationListResponseSchema =
  schemas.DirectorClarificationListResponse;
const taskSchema = schemas.Task;
const taskListResponseSchema = schemas.TaskListResponse;
const taskBatchResponseSchema = schemas.TaskBatchResponse;
const coordinatorProposalDryRunResponseSchema =
  schemas.CoordinatorProposalDryRunResponse;
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

    async listDimensions(query) {
      const result = await listDimensions({
        client,
        headers: {
          accept: "application/json",
        },
        query,
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          taskErrorSchema.parse(result.error satisfies ListDimensionsError),
        );
      }

      return dimensionListResponseSchema.parse(
        result.data satisfies ListDimensionsResponse,
      ) satisfies DimensionListResponse;
    },

    async getDimensionById(dimensionId) {
      const result = await getDimensionById({
        client,
        headers: {
          accept: "application/json",
        },
        path: {
          dimensionId,
        },
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          taskErrorSchema.parse(result.error satisfies GetDimensionByIdError),
        );
      }

      return dimensionSchema.parse(
        result.data satisfies GetDimensionByIdResponse,
      ) satisfies Dimension;
    },

    async listDimensionEvaluations(dimensionId) {
      const result = await listDimensionEvaluations({
        client,
        headers: {
          accept: "application/json",
        },
        path: {
          dimensionId,
        },
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          taskErrorSchema.parse(
            result.error satisfies ListDimensionEvaluationsError,
          ),
        );
      }

      return dimensionEvaluationListResponseSchema.parse(
        result.data satisfies ListDimensionEvaluationsResponse,
      ) satisfies DimensionEvaluationListResponse;
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

    async getProjectTokenUsage(projectId) {
      const result = await getProjectTokenUsage({
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
            result.error satisfies GetProjectTokenUsageError,
          ),
        );
      }

      return projectTokenUsageResponseSchema.parse(
        result.data satisfies GetProjectTokenUsageResponse,
      ) satisfies ProjectTokenUsageResponse;
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

    async listDirectorClarifications(projectId, query) {
      const result = await listDirectorClarifications({
        client,
        headers: {
          accept: "application/json",
        },
        path: {
          projectId,
        },
        query,
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

    async patchDirectorClarificationById(projectId, clarificationId, input) {
      const result = await patchDirectorClarificationById({
        body: input,
        client,
        headers: {
          accept: "application/json",
        },
        path: {
          clarificationId,
          projectId,
        },
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          taskErrorSchema.parse(
            result.error satisfies PatchDirectorClarificationByIdError,
          ),
        );
      }

      return directorClarificationSchema.parse(
        result.data satisfies PatchDirectorClarificationByIdResponse,
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

    async createCoordinatorProposalDryRun(input) {
      const result = await createCoordinatorProposalDryRun({
        body: input,
        client,
        headers: {
          accept: "application/json",
        },
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          taskErrorSchema.parse(
            result.error satisfies CreateCoordinatorProposalDryRunError,
          ),
        );
      }

      return coordinatorProposalDryRunResponseSchema.parse(
        result.data satisfies CreateCoordinatorProposalDryRunResponse,
      ) satisfies CoordinatorProposalDryRunResponse;
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
  };
};
