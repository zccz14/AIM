import type {
  Dimension,
  DimensionEvaluation,
  TaskWriteBulk,
} from "@aim-ai/contract";

export type DashboardStatus = "processing" | "resolved" | "rejected";

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

export type DashboardManagerReport = {
  id: string;
  projectPath: string;
  contentMarkdown: string;
  baselineRef: string | null;
  createdAt: string;
};

export type DashboardSummaryCard = {
  key: "pool" | "processing" | "historyResolved" | "historyRejected";
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

export type DashboardDimensionReportItem = {
  dimension: Dimension;
  evaluations: DimensionEvaluation[];
  latestEvaluation: DimensionEvaluation | null;
};

export type TaskDashboardViewModel = {
  dimensionReports: DashboardDimensionReportItem[];
  tasks: DashboardTask[];
  historyTasks: DashboardTask[];
  managerReports: DashboardManagerReport[];
  taskWriteBulks: TaskWriteBulk[];
  rejectedFeedbackSignals: DashboardRejectedFeedbackSignal[];
  summaryCards: DashboardSummaryCard[];
  decisionSignals: DashboardDecisionSignal[];
  statusBoardItems: DashboardMetricItem[];
  activitySeries: DashboardActivityPoint[];
  recentTasks: DashboardTask[];
};
