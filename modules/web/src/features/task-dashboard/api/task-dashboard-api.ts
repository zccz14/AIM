import type {
  Dimension,
  DimensionEvaluation,
  OpenCodeModelsResponse,
  OpenCodeSessionListResponse,
  Project,
  ProjectListResponse,
  ProjectOptimizerStatusResponse,
  TaskListResponse,
} from "@aim-ai/contract";

import { createWebApiClient } from "../../../lib/api-client.js";

export type ProjectFormInput = {
  name: string;
  gitOriginUrl: string;
  globalProviderId: string;
  globalModelId: string;
  optimizerEnabled: boolean;
};

export type TaskDashboardResponse = {
  active: TaskListResponse;
  dimensionEvaluations: DimensionEvaluation[];
  dimensions: Dimension[];
  history: TaskListResponse;
  projectOptimizerStatuses: Record<string, ProjectOptimizerStatusResponse>;
  projects: ProjectListResponse;
};

const getProjectIds = (responses: TaskListResponse[]) => [
  ...new Set(
    responses.flatMap((response) =>
      response.items.map((task) => task.project_id).filter(Boolean),
    ),
  ),
];

export const getTaskDashboard = async (): Promise<TaskDashboardResponse> => {
  const client = createWebApiClient();

  const [active, history, projects] = await Promise.all([
    client.listTasks({ done: false }),
    client.listTasks({ done: true }),
    client.listProjects(),
  ]);
  const projectIds = getProjectIds([active, history]);
  const dimensionResponses = await Promise.all(
    projectIds.map((projectId) =>
      client.listDimensions({ project_id: projectId }),
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
  const projectOptimizerStatusResults = await Promise.allSettled(
    projects.items.map((project) =>
      client.getProjectOptimizerStatus(project.id),
    ),
  );
  const projectOptimizerStatuses = Object.fromEntries(
    projectOptimizerStatusResults.flatMap((result) =>
      result.status === "fulfilled"
        ? [[result.value.project_id, result.value]]
        : [],
    ),
  );

  return {
    active,
    dimensionEvaluations,
    dimensions,
    history,
    projectOptimizerStatuses,
    projects,
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
    optimizer_enabled: input.optimizerEnabled,
    name: input.name,
    git_origin_url: input.gitOriginUrl,
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
    optimizer_enabled: input.optimizerEnabled,
    name: input.name,
    git_origin_url: input.gitOriginUrl,
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

export const listOpenCodeSessions =
  async (): Promise<OpenCodeSessionListResponse> => {
    const client = createWebApiClient();

    return client.listOpenCodeSessions();
  };
