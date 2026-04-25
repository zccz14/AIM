import { Badge } from "../../../components/ui/badge.js";
import type { DashboardStatus } from "../model/task-dashboard-view-model.js";

const statusLabelMap: Record<DashboardStatus, string> = {
  processing: "Processing",
  rejected: "Rejected",
  resolved: "Resolved",
};

export const TaskStatusBadge = ({ status }: { status: DashboardStatus }) => {
  return <Badge>{statusLabelMap[status]}</Badge>;
};
