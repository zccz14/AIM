import type { DashboardStatus } from "../model/task-dashboard-view-model.js";

const statusLabelMap: Record<DashboardStatus, string> = {
  created: "Created",
  waiting_assumptions: "Waiting Assumptions",
  running: "Running",
  outbound: "Outbound",
  pr_following: "PR Following",
  closing: "Closing",
  succeeded: "Succeeded",
  failed: "Failed",
};

const statusAccentColorMap: Record<DashboardStatus, string> = {
  created: "#74c0fc",
  waiting_assumptions: "#ff922b",
  running: "#bfa0ff",
  outbound: "#22d3ee",
  pr_following: "#a78bfa",
  closing: "#69db7c",
  succeeded: "#87e5a0",
  failed: "#ff9b9b",
};

export const TaskStatusBadge = ({ status }: { status: DashboardStatus }) => {
  const palette = {
    created: {
      background: "rgba(116, 192, 252, 0.18)",
      border: "#4dabf7",
      text: "#d0ebff",
    },
    waiting_assumptions: {
      background: "rgba(255, 146, 43, 0.18)",
      border: "#ff922b",
      text: "#ffe8cc",
    },
    running: {
      background: "rgba(151, 117, 250, 0.2)",
      border: "#9775fa",
      text: "#e5dbff",
    },
    outbound: {
      background: "rgba(34, 211, 238, 0.18)",
      border: "#22d3ee",
      text: "#cffafe",
    },
    pr_following: {
      background: "rgba(167, 139, 250, 0.18)",
      border: "#a78bfa",
      text: "#ede9fe",
    },
    closing: {
      background: "rgba(105, 219, 124, 0.18)",
      border: "#69db7c",
      text: "#d3f9d8",
    },
    succeeded: {
      background: "rgba(64, 192, 87, 0.18)",
      border: "#40c057",
      text: "#b2f2bb",
    },
    failed: {
      background: "rgba(250, 82, 82, 0.2)",
      border: "#fa5252",
      text: "#ffc9c9",
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
