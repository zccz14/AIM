export type DashboardStatus =
  | "created"
  | "waiting_assumptions"
  | "running"
  | "outbound"
  | "pr_following"
  | "closing"
  | "succeeded"
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
  key: "pool" | "running" | "waiting" | "historySucceeded" | "historyFailed";
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

export type DashboardRejectedFeedbackSignal = {
  key: string;
  reasonCategory: "stale_spec" | "scheduler_session" | "general";
  reasonCategoryLabel: string;
  reasonSummary: string;
  count: number;
  latestAt: string;
  coordinates: string[];
  sampleTasks: Pick<
    DashboardTask,
    "id" | "title" | "projectPath" | "updatedAt"
  >[];
};

export type DashboardDecisionSignal = {
  key: "coverage" | "flow" | "successRate" | "gap";
  label: string;
  value: string;
  detail: string;
};

export type TaskDashboardViewModel = {
  tasks: DashboardTask[];
  historyTasks: DashboardTask[];
  rejectedFeedbackSignals: DashboardRejectedFeedbackSignal[];
  summaryCards: DashboardSummaryCard[];
  decisionSignals: DashboardDecisionSignal[];
  statusBoardItems: DashboardMetricItem[];
  activitySeries: DashboardActivityPoint[];
  recentTasks: DashboardTask[];
};
