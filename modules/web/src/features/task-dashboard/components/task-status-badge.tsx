import { Badge } from "../../../components/ui/badge.js";
import { useI18n } from "../../../lib/i18n.js";
import { cn } from "../../../lib/utils.js";
import type { DashboardStatus } from "../model/task-dashboard-view-model.js";

export const TaskStatusBadge = ({ status }: { status: DashboardStatus }) => {
  const { t } = useI18n();
  const statusLabelMap = {
    processing: t("creatingTask"),
    rejected: t("rejectedFeedback"),
    resolved: t("completedStatus"),
  } satisfies Record<DashboardStatus, string>;

  return (
    <Badge
      className={cn(
        status === "rejected" && "text-destructive",
        status === "processing" && "text-muted-foreground",
        status === "resolved" && "text-primary",
      )}
      data-status={status}
      variant="outline"
    >
      {statusLabelMap[status]}
    </Badge>
  );
};
