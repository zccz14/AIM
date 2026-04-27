import type {
  Dimension,
  DimensionEvaluation,
  OpenCodeModelsResponse,
  OptimizerStatusResponse,
  Project,
  ProjectListResponse,
  TaskListResponse,
  TaskWriteBulkListResponse,
} from "@aim-ai/contract";

import { createWebApiClient } from "../../../lib/api-client.js";

export type ProjectFormInput = {
  name: string;
  projectPath: string;
  globalProviderId: string;
  globalModelId: string;
};

export type TaskDashboardResponse = {
  active: TaskListResponse;
  dimensionEvaluations: DimensionEvaluation[];
  dimensions: Dimension[];
  history: TaskListResponse;
  taskWriteBulks: TaskWriteBulkListResponse;
};

const getProjectPaths = (responses: TaskListResponse[]) => [
  ...new Set(
    responses.flatMap((response) =>
      response.items.map((task) => task.project_path).filter(Boolean),
    ),
  ),
];

export const getTaskDashboard = async (): Promise<TaskDashboardResponse> => {
  const client = createWebApiClient();

  const [active, history] = await Promise.all([
    client.listTasks({ done: false }),
    client.listTasks({ done: true }),
  ]);
  const projectPaths = getProjectPaths([active, history]);
  const [taskWriteBulkResponses] = await Promise.all([
    Promise.all(
      projectPaths.map((projectPath) =>
        client.listTaskWriteBulks({ project_path: projectPath }),
      ),
    ),
  ]);
  const taskWriteBulks = {
    items: taskWriteBulkResponses.flatMap((response) => response.items),
  } satisfies TaskWriteBulkListResponse;
  const dimensionResponses = await Promise.all(
    projectPaths.map((projectPath) =>
      client.listDimensions({ project_path: projectPath }),
    ),
  );
  const dimensions = dimensionResponses.flatMap((response) => response.items);
  const dimensionEvaluationResponses = await Promise.all(
    dimensions.map((dimension) =>
      client.listDimensionEvaluations(dimension.id),
    ),
  );
  const dimensionEvaluations = dimensionEvaluationResponses.flatMap(
    (response) => response.items,
  );

  return {
    active,
    dimensionEvaluations,
    dimensions,
    history,
    taskWriteBulks,
  };
};

export const listProjects = async (): Promise<ProjectListResponse> => {
  const client = createWebApiClient();

  return client.listProjects();
};

export const createProject = async (
  input: ProjectFormInput,
): Promise<Project> => {
  const client = createWebApiClient();

  return client.createProject({
    global_model_id: input.globalModelId,
    global_provider_id: input.globalProviderId,
    name: input.name,
    project_path: input.projectPath,
  });
};

export const updateProject = async (
  projectId: string,
  input: ProjectFormInput,
): Promise<Project> => {
  const client = createWebApiClient();

  return client.patchProjectById(projectId, {
    global_model_id: input.globalModelId,
    global_provider_id: input.globalProviderId,
    name: input.name,
    project_path: input.projectPath,
  });
};

export const deleteProject = async (projectId: string): Promise<void> => {
  const client = createWebApiClient();

  return client.deleteProjectById(projectId);
};

export const getOpenCodeModels = async (): Promise<OpenCodeModelsResponse> => {
  const client = createWebApiClient();

  return client.listOpenCodeModels();
};

export const getOptimizerStatus =
  async (): Promise<OptimizerStatusResponse> => {
    const client = createWebApiClient();

    return client.getOptimizerStatus();
  };

export const startOptimizer = async (): Promise<OptimizerStatusResponse> => {
  const client = createWebApiClient();

  return client.startOptimizer();
};

export const stopOptimizer = async (): Promise<OptimizerStatusResponse> => {
  const client = createWebApiClient();

  return client.stopOptimizer();
};
