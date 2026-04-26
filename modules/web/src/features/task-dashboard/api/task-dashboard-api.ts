import type {
  Dimension,
  DimensionEvaluation,
  ManagerReport,
  OpenCodeModelsResponse,
  OptimizerStatusResponse,
  Task,
  TaskListResponse,
  TaskWriteBulkListResponse,
} from "@aim-ai/contract";

import { createWebApiClient } from "../../../lib/api-client.js";

export type CreateDashboardTaskInput = {
  title: string;
  taskSpec: string;
  projectPath: string;
  developerProviderId: string;
  developerModelId: string;
};

export type TaskDashboardResponse = {
  active: TaskListResponse;
  dimensionEvaluations: DimensionEvaluation[];
  dimensions: Dimension[];
  history: TaskListResponse;
  managerReports: ManagerReport[];
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
  const [managerReportResponses, taskWriteBulkResponses] = await Promise.all([
    Promise.all(
      projectPaths.map((projectPath) =>
        client.listManagerReports({ project_path: projectPath }),
      ),
    ),
    Promise.all(
      projectPaths.map((projectPath) =>
        client.listTaskWriteBulks({ project_path: projectPath }),
      ),
    ),
  ]);
  const managerReports = managerReportResponses
    .flatMap((response) => response.items)
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
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
    managerReports,
    taskWriteBulks,
  };
};

export const createTaskFromDashboard = async (
  input: CreateDashboardTaskInput,
): Promise<Task> => {
  const client = createWebApiClient();

  return client.createTask({
    title: input.title,
    task_spec: input.taskSpec,
    project_id: input.projectPath,
  });
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
