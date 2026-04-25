import type {
  OpenCodeModelsResponse,
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
  history: TaskListResponse;
  taskWriteBulks: TaskWriteBulkListResponse;
};

export const getTaskDashboard = async (): Promise<TaskDashboardResponse> => {
  const client = createWebApiClient();

  const [active, history] = await Promise.all([
    client.listTasks({ done: false }),
    client.listTasks({ done: true }),
  ]);
  const projectPaths = [
    ...new Set(
      [...active.items, ...history.items].map((task) => task.project_path),
    ),
  ];
  const taskWriteBulks = {
    items: (
      await Promise.all(
        projectPaths.map((projectPath) =>
          client.listTaskWriteBulks({ project_path: projectPath }),
        ),
      )
    ).flatMap((response) => response.items),
  } satisfies TaskWriteBulkListResponse;

  return { active, history, taskWriteBulks };
};

export const createTaskFromDashboard = async (
  input: CreateDashboardTaskInput,
): Promise<Task> => {
  const client = createWebApiClient();

  return client.createTask({
    title: input.title,
    task_spec: input.taskSpec,
    project_path: input.projectPath,
    developer_provider_id: input.developerProviderId,
    developer_model_id: input.developerModelId,
  });
};

export const getOpenCodeModels = async (): Promise<OpenCodeModelsResponse> => {
  const client = createWebApiClient();

  return client.listOpenCodeModels();
};
