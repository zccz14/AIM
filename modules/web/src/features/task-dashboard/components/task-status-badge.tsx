import type { DashboardStatus } from "../model/task-dashboard-view-model.js";

const statusLabelMap: Record<DashboardStatus, string> = {
  ready: "Ready",
  running: "Running",
  blocked: "Blocked",
  done: "Done",
  failed: "Failed",
};

const statusAccentColorMap: Record<DashboardStatus, string> = {
  ready: "#7ab4ff",
  running: "#bfa0ff",
  blocked: "#ffb86c",
  done: "#87e5a0",
  failed: "#ff9b9b",
};

export const TaskStatusBadge = ({ status }: { status: DashboardStatus }) => {
  const palette = {
    blocked: {
      background: "rgba(245, 159, 0, 0.18)",
      border: "#f59f00",
      text: "#ffd8a8",
    },
    done: {
      background: "rgba(64, 192, 87, 0.18)",
      border: "#40c057",
      text: "#b2f2bb",
    },
    failed: {
      background: "rgba(250, 82, 82, 0.2)",
      border: "#fa5252",
      text: "#ffc9c9",
    },
    ready: {
      background: "rgba(77, 171, 247, 0.18)",
      border: "#4dabf7",
      text: "#d0ebff",
    },
    running: {
      background: "rgba(151, 117, 250, 0.2)",
      border: "#9775fa",
      text: "#e5dbff",
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
