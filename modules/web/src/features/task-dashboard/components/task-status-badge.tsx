import type { DashboardStatus } from "../model/task-dashboard-view-model.js";

const statusLabelMap: Record<DashboardStatus, string> = {
  processing: "Processing",
  rejected: "Rejected",
  resolved: "Resolved",
};

const statusAccentColorMap: Record<DashboardStatus, string> = {
  processing: "#bfa0ff",
  rejected: "#ff9b9b",
  resolved: "#87e5a0",
};

export const TaskStatusBadge = ({ status }: { status: DashboardStatus }) => {
  const palette = {
    processing: {
      background: "rgba(151, 117, 250, 0.2)",
      border: "#9775fa",
      text: "#e5dbff",
    },
    rejected: {
      background: "rgba(250, 82, 82, 0.2)",
      border: "#fa5252",
      text: "#ffc9c9",
    },
    resolved: {
      background: "rgba(64, 192, 87, 0.18)",
      border: "#40c057",
      text: "#b2f2bb",
    },
  }[status];

  return (
    <span
      className="aim-status-badge"
      data-status={status}
      style={{
        backgroundColor: palette.background,
        borderColor: palette.border,
        boxShadow: `inset 0 0 0 1px ${statusAccentColorMap[status]}33`,
        color: palette.text,
      }}
    >
      {statusLabelMap[status]}
    </span>
  );
};
