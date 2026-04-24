import { useMutation } from "@tanstack/react-query";

import { createTaskFromDashboard } from "./api/task-dashboard-api.js";

type CreateTaskMutationInput = {
  title: string;
  taskSpec: string;
  projectPath: string;
  developerProviderId: string;
  developerModelId: string;
};

export const useTaskCreateMutation = () =>
  useMutation({
    mutationFn: (input: CreateTaskMutationInput) =>
      createTaskFromDashboard(input),
  });
