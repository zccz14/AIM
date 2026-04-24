export type DashboardStatus =
  | "ready"
  | "running"
  | "blocked"
  | "done"
  | "failed";

export type DashboardTask = {
  id: string;
  title: string;
  taskSpec: string;
  result: string;
  projectPath: string;
  contractStatus: string;
  dashboardStatus: DashboardStatus;
  sessionId: string | null;
  worktreePath: string | null;
  pullRequestUrl: string | null;
  closureChecklist: DashboardClosureCue[];
  dependencies: string[];
  createdAt: string;
  updatedAt: string;
  isDone: boolean;
};

export type DashboardClosureCue = {
  key: "pullRequest" | "worktree" | "result" | "completion";
  label: string;
  statusLabel: string;
  detail: string;
  isComplete: boolean;
};

export type DashboardSummaryCard = {
  key: "pool" | "running" | "blocked" | "historySucceeded" | "historyFailed";
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
  historyTasks: DashboardTask[];
  summaryCards: DashboardSummaryCard[];
  statusBoardItems: DashboardMetricItem[];
  activitySeries: DashboardActivityPoint[];
  recentTasks: DashboardTask[];
};
