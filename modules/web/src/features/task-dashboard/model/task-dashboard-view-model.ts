import type {
  Dimension,
  DimensionEvaluation,
  Project,
  ProjectOptimizerStatusResponse,
} from "@aim-ai/contract";

export type DashboardStatus = "processing" | "resolved" | "rejected";

export type DashboardTask = {
  id: string;
  title: string;
  taskSpec: string;
  result: string;
  projectId: string;
  projectCoordinate: string;
  contractStatus: string;
  dashboardStatus: DashboardStatus;
  sessionId: string | null;
  worktreePath: string | null;
  pullRequestUrl: string | null;
  sourceBaselineFreshness: DashboardSourceBaselineFreshness;
  closureChecklist: DashboardClosureCue[];
  dependencies: string[];
  createdAt: string;
  updatedAt: string;
  isDone: boolean;
};

export type DashboardSourceBaselineFreshness = {
  status: "current" | "stale" | "unknown";
  sourceCommit: string | null;
  currentCommit: string | null;
  summary: string;
};

export type DashboardClosureCue = {
  key: "pullRequest" | "worktree" | "result" | "completion";
  label: string;
  statusLabel: string;
  detail: string;
  isComplete: boolean;
};

export type DashboardSummaryCard = {
  key: "projects" | "dimensions" | "active" | "completed" | "openCodeSessions";
  label: string;
  value: string;
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
    "id" | "title" | "projectCoordinate" | "updatedAt"
  >[];
};

export type DashboardDecisionSignal = {
  key: "coverage" | "flow" | "successRate" | "gap";
  label: string;
  value: string;
  detail: string;
};

export type DashboardDimensionFreshnessStatus =
  | "current"
  | "stale"
  | "missing"
  | "unknown";

export type DashboardDimensionFreshness = {
  status: DashboardDimensionFreshnessStatus;
  currentBaselineCommitSha: string | null;
  evaluationCommitSha: string | null;
};

export type DashboardDimensionReportItem = {
  dimension: Dimension;
  evaluations: DimensionEvaluation[];
  freshness: DashboardDimensionFreshness;
  latestEvaluation: DimensionEvaluation | null;
};

export type TaskDashboardViewModel = {
  projects: Project[];
  projectOptimizerStatuses: Record<string, ProjectOptimizerStatusResponse>;
  dimensionReports: DashboardDimensionReportItem[];
  tasks: DashboardTask[];
  historyTasks: DashboardTask[];
  rejectedFeedbackSignals: DashboardRejectedFeedbackSignal[];
  summaryCards: DashboardSummaryCard[];
  decisionSignals: DashboardDecisionSignal[];
  statusBoardItems: DashboardMetricItem[];
  activitySeries: DashboardActivityPoint[];
  recentTasks: DashboardTask[];
};
