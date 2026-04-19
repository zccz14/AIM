export type DashboardStatus =
  | "ready"
  | "running"
  | "blocked"
  | "done"
  | "failed";

export type DashboardTask = {
  id: string;
  title: string;
  contractStatus: string;
  dashboardStatus: DashboardStatus;
  sessionId: string | null;
  worktreePath: string | null;
  pullRequestUrl: string | null;
  dependencies: string[];
  createdAt: string;
  updatedAt: string;
  isDone: boolean;
};

export type DashboardSummaryCard = {
  key: "total" | "running" | "blocked" | "done";
  label: string;
  value: number;
};

export type DashboardMetricItem = {
  key: DashboardStatus;
  label: string;
  value: number;
};

export type DashboardActivityPoint = {
  label: string;
  value: number;
};

export type TaskDashboardViewModel = {
  tasks: DashboardTask[];
  summaryCards: DashboardSummaryCard[];
  statusBoardItems: DashboardMetricItem[];
  activitySeries: DashboardActivityPoint[];
  recentTasks: DashboardTask[];
};
