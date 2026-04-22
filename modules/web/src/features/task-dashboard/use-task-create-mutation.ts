import { useMutation } from "@tanstack/react-query";

import { createTaskFromDashboard } from "./api/task-dashboard-api.js";

type CreateTaskMutationInput = {
  taskSpec: string;
  projectPath: string;
};

export const useTaskCreateMutation = () =>
  useMutation({
    mutationFn: (input: CreateTaskMutationInput) =>
      createTaskFromDashboard(input),
  });
