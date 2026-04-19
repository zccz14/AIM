import { useMutation } from "@tanstack/react-query";

import { createTaskFromDashboard } from "./api/task-dashboard-api.js";

export const useTaskCreateMutation = () =>
  useMutation({
    mutationFn: createTaskFromDashboard,
  });
