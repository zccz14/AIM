import { Badge } from "@mantine/core";

import type { DashboardStatus } from "../model/task-dashboard-view-model.js";

const statusColorMap: Record<DashboardStatus, string> = {
  ready: "blue",
  running: "yellow",
  blocked: "orange",
  done: "green",
  failed: "red",
};

const statusLabelMap: Record<DashboardStatus, string> = {
  ready: "Ready",
  running: "Running",
  blocked: "Blocked",
  done: "Done",
  failed: "Failed",
};

export const TaskStatusBadge = ({ status }: { status: DashboardStatus }) => (
  <Badge color={statusColorMap[status]} variant="light">
    {statusLabelMap[status]}
  </Badge>
);
