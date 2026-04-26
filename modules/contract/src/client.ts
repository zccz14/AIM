import { createClient as createGeneratedClient } from "../generated/_client/client/index.js";
import {
  createManagerReport,
  createProject,
  createTask,
  createTaskWriteBulk,
  deleteProjectById,
  deleteTaskById,
  getHealth,
  getManagerReportById,
  getOptimizerStatus,
  getTaskById,
  getTaskWriteBulkById,
  listManagerReports,
  listOpenCodeModels,
  listProjects,
  listTasks,
  listTaskWriteBulks,
  patchProjectById,
  patchTaskById,
  rejectTaskById,
  resolveTaskById,
  startOptimizer,
  stopOptimizer,
} from "../generated/client.js";
import type {
  CreateManagerReportError,
  CreateManagerReportRequest,
  CreateManagerReportResponse,
  CreateProjectError,
  CreateProjectRequest,
  CreateProjectResponse,
  CreateTaskError,
  CreateTaskRequest,
  CreateTaskResponse,
  CreateTaskWriteBulkError,
  CreateTaskWriteBulkRequest,
  CreateTaskWriteBulkResponse,
  DeleteProjectByIdError,
  DeleteTaskByIdError,
  ErrorResponse,
  GetHealthError,
  GetHealthResponse,
  GetManagerReportByIdError,
  GetManagerReportByIdResponse,
  GetOptimizerStatusResponse,
  GetTaskByIdError,
  GetTaskByIdResponse,
  GetTaskWriteBulkByIdError,
  GetTaskWriteBulkByIdResponse,
  HealthError,
  HealthResponse,
  ListManagerReportsError,
  ListManagerReportsResponse,
  ListTasksError,
  ListTasksResponse,
  ListTaskWriteBulksError,
  ListTaskWriteBulksResponse,
  ManagerReport,
  ManagerReportListResponse,
  OpenCodeModelsResponse,
  OptimizerStatusResponse,
  PatchProjectByIdError,
  PatchProjectByIdResponse,
  PatchProjectRequest,
  PatchTaskByIdError,
  PatchTaskByIdResponse,
  PatchTaskRequest,
  Project,
  ProjectListResponse,
  RejectTaskByIdError,
  ResolveTaskByIdError,
  StartOptimizerResponse,
  StopOptimizerResponse,
  Task,
  TaskListResponse,
  TaskResultRequest,
  TaskWriteBulk,
  TaskWriteBulkListResponse,
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
  getOptimizerStatus(): Promise<OptimizerStatusResponse>;
  startOptimizer(): Promise<OptimizerStatusResponse>;
  stopOptimizer(): Promise<OptimizerStatusResponse>;
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
  deleteProjectById(projectId: string): Promise<void>;
  listManagerReports(query: {
    project_path: string;
  }): Promise<ManagerReportListResponse>;
  createManagerReport(
    input: CreateManagerReportRequest,
  ): Promise<ManagerReport>;
  getManagerReportById(
    reportId: string,
    query: { project_path: string },
  ): Promise<ManagerReport>;
  listTaskWriteBulks(query: {
    project_path: string;
  }): Promise<TaskWriteBulkListResponse>;
  createTaskWriteBulk(
    input: CreateTaskWriteBulkRequest,
  ): Promise<TaskWriteBulk>;
  getTaskWriteBulkById(
    bulkId: string,
    query: { project_path: string },
  ): Promise<TaskWriteBulk>;
  createTask(input: CreateTaskRequest): Promise<Task>;
  getTaskById(taskId: string): Promise<Task>;
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
const taskSchema = schemas.Task;
const taskListResponseSchema = schemas.TaskListResponse;
const managerReportSchema = schemas.ManagerReport;
const managerReportListResponseSchema = schemas.ManagerReportListResponse;
const taskWriteBulkSchema = schemas.TaskWriteBulk;
const taskWriteBulkListResponseSchema = schemas.TaskWriteBulkListResponse;
const opencodeModelsResponseSchema = schemas.OpenCodeModelsResponse;
const optimizerStatusResponseSchema = schemas.OptimizerStatusResponse;
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

    async getOptimizerStatus() {
      const result = await getOptimizerStatus({
        client,
        headers: {
          accept: "application/json",
        },
      });

      return optimizerStatusResponseSchema.parse(
        result.data,
      ) satisfies GetOptimizerStatusResponse;
    },

    async startOptimizer() {
      const result = await startOptimizer({
        client,
        headers: {
          accept: "application/json",
        },
      });

      return optimizerStatusResponseSchema.parse(
        result.data,
      ) satisfies StartOptimizerResponse;
    },

    async stopOptimizer() {
      const result = await stopOptimizer({
        client,
        headers: {
          accept: "application/json",
        },
      });

      return optimizerStatusResponseSchema.parse(
        result.data,
      ) satisfies StopOptimizerResponse;
    },

    async listManagerReports(query) {
      const result = await listManagerReports({
        client,
        headers: {
          accept: "application/json",
        },
        query,
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          taskErrorSchema.parse(result.error satisfies ListManagerReportsError),
        );
      }

      return managerReportListResponseSchema.parse(
        result.data satisfies ListManagerReportsResponse,
      ) satisfies ManagerReportListResponse;
    },

    async createManagerReport(input) {
      const result = await createManagerReport({
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
            result.error satisfies CreateManagerReportError,
          ),
        );
      }

      return managerReportSchema.parse(
        result.data satisfies CreateManagerReportResponse,
      ) satisfies ManagerReport;
    },

    async getManagerReportById(reportId, query) {
      const result = await getManagerReportById({
        client,
        headers: {
          accept: "application/json",
        },
        path: {
          reportId,
        },
        query,
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          taskErrorSchema.parse(
            result.error satisfies GetManagerReportByIdError,
          ),
        );
      }

      return managerReportSchema.parse(
        result.data satisfies GetManagerReportByIdResponse,
      ) satisfies ManagerReport;
    },

    async listTaskWriteBulks(query) {
      const result = await listTaskWriteBulks({
        client,
        headers: {
          accept: "application/json",
        },
        query,
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          taskErrorSchema.parse(result.error satisfies ListTaskWriteBulksError),
        );
      }

      return taskWriteBulkListResponseSchema.parse(
        result.data satisfies ListTaskWriteBulksResponse,
      ) satisfies TaskWriteBulkListResponse;
    },

    async createTaskWriteBulk(input) {
      const result = await createTaskWriteBulk({
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
            result.error satisfies CreateTaskWriteBulkError,
          ),
        );
      }

      return taskWriteBulkSchema.parse(
        result.data satisfies CreateTaskWriteBulkResponse,
      ) satisfies TaskWriteBulk;
    },

    async getTaskWriteBulkById(bulkId, query) {
      const result = await getTaskWriteBulkById({
        client,
        headers: {
          accept: "application/json",
        },
        path: {
          bulkId,
        },
        query,
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          taskErrorSchema.parse(
            result.error satisfies GetTaskWriteBulkByIdError,
          ),
        );
      }

      return taskWriteBulkSchema.parse(
        result.data satisfies GetTaskWriteBulkByIdResponse,
      ) satisfies TaskWriteBulk;
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
