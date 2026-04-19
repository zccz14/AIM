import { useQuery } from "@tanstack/react-query";

import { taskDashboardQueryOptions } from "./queries.js";

export const useTaskDashboardQuery = () => useQuery(taskDashboardQueryOptions);
