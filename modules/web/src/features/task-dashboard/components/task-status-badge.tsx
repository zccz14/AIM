import { Badge } from "../../../components/ui/badge.js";
import { useI18n } from "../../../lib/i18n.js";
import type { DashboardStatus } from "../model/task-dashboard-view-model.js";

const statusLabelMap: Record<DashboardStatus, string> = {
  processing: "Processing",
  rejected: "Rejected",
  resolved: "Resolved",
};

export const TaskStatusBadge = ({ status }: { status: DashboardStatus }) => {
  const { locale } = useI18n();

  return (
    <Badge className="aim-status-badge" data-status={status} variant="outline">
      {locale === "zh"
        ? { processing: "处理中", rejected: "已拒绝", resolved: "已解决" }[
            status
          ]
        : statusLabelMap[status]}
    </Badge>
  );
};
