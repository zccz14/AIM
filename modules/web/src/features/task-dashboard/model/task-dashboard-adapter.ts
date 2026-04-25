import type { Task } from "@aim-ai/contract";

import type { TaskDashboardResponse } from "../api/task-dashboard-api.js";
import type {
  DashboardClosureCue,
  DashboardRejectedFeedbackSignal,
  DashboardStatus,
  DashboardTask,
  TaskDashboardViewModel,
} from "./task-dashboard-view-model.js";

export type DashboardGraphNode = {
  id: string;
  data: {
    color: string;
    label: string;
    status: DashboardStatus;
    testId: string;
  };
  position: {
    x: number;
    y: number;
  };
};

export type DashboardGraphEdge = {
  id: string;
  source: string;
  target: string;
};

const statusColorMap: Record<DashboardStatus, string> = {
  created: "#74c0fc",
  waiting_assumptions: "#ff922b",
  running: "#fab005",
  outbound: "#22d3ee",
  pr_following: "#a78bfa",
  closing: "#69db7c",
  succeeded: "#2f9e44",
  failed: "#e03131",
};

export const toDashboardStatus = (status: string): DashboardStatus =>
  status as DashboardStatus;

const countTasksByStatus = (tasks: DashboardTask[], status: DashboardStatus) =>
  tasks.filter((task) => task.dashboardStatus === status).length;

const isActiveTask = (task: DashboardTask) =>
  !task.isDone &&
  task.dashboardStatus !== "succeeded" &&
  task.dashboardStatus !== "failed";

export const summarizeTaskSpec = (taskSpec: string) => {
  const [firstLine = ""] = taskSpec
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const summary = firstLine || taskSpec.trim();

  return summary.length <= 72 ? summary : `${summary.slice(0, 69)}...`;
};

const summarizeTaskResult = (result: string) => {
  const trimmedResult = result.trim();

  if (trimmedResult.length === 0) {
    return "No result feedback recorded";
  }

  return trimmedResult.length <= 96
    ? trimmedResult
    : `${trimmedResult.slice(0, 93)}...`;
};

const normalizeSignalText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[`*_#>\-[\]()]/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getRejectedReasonCategory = (
  task: DashboardTask,
): DashboardRejectedFeedbackSignal["reasonCategory"] => {
  const searchableText = normalizeSignalText(
    `${task.title} ${task.taskSpec} ${task.result}`,
  );

  if (searchableText.includes("scheduler session")) {
    return "scheduler_session";
  }

  if (
    searchableText.includes("stale spec") ||
    (searchableText.includes("spec") && searchableText.includes("stale")) ||
    (searchableText.includes("spec") && searchableText.includes("前提")) ||
    searchableText.includes("assumption") ||
    searchableText.includes("前提失效")
  ) {
    return "stale_spec";
  }

  return "general";
};

const rejectedReasonCategoryLabels: Record<
  DashboardRejectedFeedbackSignal["reasonCategory"],
  string
> = {
  general: "General Rejection",
  scheduler_session: "Scheduler Session",
  stale_spec: "Stale Spec Premise",
};

const buildRejectedFeedbackSignals = (
  historyTasks: DashboardTask[],
): DashboardRejectedFeedbackSignal[] => {
  const signalsByKey = new Map<string, DashboardRejectedFeedbackSignal>();

  for (const task of historyTasks) {
    if (task.dashboardStatus !== "failed") {
      continue;
    }

    const reasonCategory = getRejectedReasonCategory(task);
    const reasonSummary = summarizeTaskResult(task.result);
    const normalizedReason = normalizeSignalText(task.result);
    const key = `${reasonCategory}:${normalizedReason || "missing-feedback"}`;
    const coordinate = task.projectPath;
    const currentSignal = signalsByKey.get(key);
    const sampleTask = {
      id: task.id,
      title: task.title,
      projectPath: task.projectPath,
      updatedAt: task.updatedAt,
    };

    if (currentSignal === undefined) {
      signalsByKey.set(key, {
        key,
        reasonCategory,
        reasonCategoryLabel: rejectedReasonCategoryLabels[reasonCategory],
        reasonSummary,
        count: 1,
        latestAt: task.updatedAt,
        coordinates: [coordinate],
        sampleTasks: [sampleTask],
      });
      continue;
    }

    currentSignal.count += 1;

    if (!currentSignal.coordinates.includes(coordinate)) {
      currentSignal.coordinates.push(coordinate);
    }

    if (task.updatedAt > currentSignal.latestAt) {
      currentSignal.latestAt = task.updatedAt;
    }

    if (currentSignal.sampleTasks.length < 3) {
      currentSignal.sampleTasks.push(sampleTask);
    }
  }

  return [...signalsByKey.values()].sort((left, right) => {
    const countDiff = right.count - left.count;

    return countDiff === 0
      ? right.latestAt.localeCompare(left.latestAt)
      : countDiff;
  });
};

const buildClosureChecklist = (task: Task): DashboardClosureCue[] => {
  const hasPullRequest = task.pull_request_url !== null;
  const hasWorktree = task.worktree_path !== null;
  const hasResult = task.result.trim().length > 0;
  const hasSucceededCompletion =
    task.done && String(task.status) === "succeeded";

  return [
    {
      key: "pullRequest",
      label: "Pull Request",
      statusLabel: hasPullRequest ? "Present" : "Missing",
      detail: task.pull_request_url ?? "No pull_request_url recorded",
      isComplete: hasPullRequest,
    },
    {
      key: "worktree",
      label: "Worktree",
      statusLabel: hasWorktree ? "Present" : "Missing",
      detail: task.worktree_path ?? "No worktree_path recorded",
      isComplete: hasWorktree,
    },
    {
      key: "result",
      label: "Result Feedback",
      statusLabel: hasResult ? "Present" : "Missing",
      detail: summarizeTaskResult(task.result),
      isComplete: hasResult,
    },
    {
      key: "completion",
      label: "Done / Status",
      statusLabel: hasSucceededCompletion ? "Complete" : "Incomplete",
      detail: `done=${String(task.done)}; status=${task.status}`,
      isComplete: hasSucceededCompletion,
    },
  ];
};

export const adaptDashboardTask = (task: Task): DashboardTask => ({
  id: task.task_id,
  title: task.title,
  taskSpec: task.task_spec,
  result: task.result,
  projectPath: task.project_path,
  contractStatus: task.status,
  dashboardStatus: toDashboardStatus(task.status),
  sessionId: task.session_id,
  worktreePath: task.worktree_path,
  pullRequestUrl: task.pull_request_url,
  closureChecklist: buildClosureChecklist(task),
  dependencies: task.dependencies,
  createdAt: task.created_at,
  updatedAt: task.updated_at,
  isDone: task.done,
});

const getTaskDepth = (
  task: DashboardTask,
  tasksById: Map<string, DashboardTask>,
  depthByTaskId: Map<string, number>,
  activeTaskIds: Set<string>,
): number => {
  const cachedDepth = depthByTaskId.get(task.id);

  if (cachedDepth !== undefined) {
    return cachedDepth;
  }

  if (activeTaskIds.has(task.id)) {
    return 0;
  }

  activeTaskIds.add(task.id);

  const dependencyDepths = task.dependencies
    .map((dependencyId) => tasksById.get(dependencyId))
    .filter(
      (dependency): dependency is DashboardTask => dependency !== undefined,
    )
    .map((dependency) =>
      getTaskDepth(dependency, tasksById, depthByTaskId, activeTaskIds),
    );

  activeTaskIds.delete(task.id);

  const depth =
    dependencyDepths.length === 0 ? 0 : Math.max(...dependencyDepths) + 1;

  depthByTaskId.set(task.id, depth);

  return depth;
};

export const adaptTaskDashboard = (
  response: TaskDashboardResponse,
): TaskDashboardViewModel & {
  graphEdges: DashboardGraphEdge[];
  graphNodes: DashboardGraphNode[];
} => {
  const tasks = response.active.items.map(adaptDashboardTask);
  const historyTasks = response.history.items.map(adaptDashboardTask);
  const rejectedFeedbackSignals = buildRejectedFeedbackSignals(historyTasks);
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const depthByTaskId = new Map<string, number>();
  const rowByDepth = new Map<number, number>();
  const graphNodes = tasks.map<DashboardGraphNode>((task) => {
    const depth = getTaskDepth(
      task,
      tasksById,
      depthByTaskId,
      new Set<string>(),
    );
    const row = rowByDepth.get(depth) ?? 0;

    rowByDepth.set(depth, row + 1);

    return {
      id: task.id,
      data: {
        color: statusColorMap[task.dashboardStatus],
        label: task.title,
        status: task.dashboardStatus,
        testId: `graph-node-${task.id}`,
      },
      position: {
        x: depth * 240,
        y: row * 140,
      },
    };
  });
  const graphEdges = tasks.flatMap((task) =>
    task.dependencies.map<DashboardGraphEdge>((dependencyId) => ({
      id: `${dependencyId}-${task.id}`,
      source: dependencyId,
      target: task.id,
    })),
  );
  const runningCount =
    countTasksByStatus(tasks, "running") +
    countTasksByStatus(tasks, "outbound") +
    countTasksByStatus(tasks, "pr_following") +
    countTasksByStatus(tasks, "closing");
  const waitingCount =
    countTasksByStatus(tasks, "created") +
    countTasksByStatus(tasks, "waiting_assumptions");
  const succeededCount = countTasksByStatus(historyTasks, "succeeded");
  const failedCount = countTasksByStatus(historyTasks, "failed");
  const historyCount = historyTasks.length;
  const successRate =
    historyCount === 0 ? 0 : Math.round((succeededCount / historyCount) * 100);
  const dependencyLinkedCount = tasks.filter(
    (task) => task.dependencies.length > 0,
  ).length;
  const attentionSignalCount = waitingCount + failedCount;

  return {
    graphEdges,
    graphNodes,
    historyTasks,
    rejectedFeedbackSignals,
    tasks,
    summaryCards: [
      { key: "pool", label: "Task Pool", value: tasks.length },
      {
        key: "running",
        label: "Running / Outbound",
        value: runningCount,
      },
      {
        key: "waiting",
        label: "Waiting / Created",
        value: waitingCount,
      },
      {
        key: "historySucceeded",
        label: "History Succeeded",
        value: succeededCount,
      },
      {
        key: "historyFailed",
        label: "History Failed",
        value: failedCount,
      },
    ],
    decisionSignals: [
      {
        key: "coverage",
        label: "Coverage",
        value: `${tasks.length} active`,
        detail: `${tasks.length} active tasks carry the task pool direction, including ${dependencyLinkedCount} with dependencies.`,
      },
      {
        key: "flow",
        label: "Flow To History",
        value: `${historyCount} closed`,
        detail: `${historyCount} tasks have reached history while ${tasks.length} remain active.`,
      },
      {
        key: "successRate",
        label: "Success Rate",
        value: historyCount === 0 ? "No history" : `${successRate}%`,
        detail:
          historyCount === 0
            ? "No completed task history is available yet."
            : `${succeededCount} succeeded and ${failedCount} failed in completed history.`,
      },
      {
        key: "gap",
        label: "Gap / Blocker Signal",
        value: `${attentionSignalCount} signals`,
        detail: `${waitingCount} waiting or newly created tasks and ${failedCount} failed history items may need Manager/Coordinator attention.`,
      },
    ],
    statusBoardItems: [
      {
        key: "created",
        label: "Created",
        value: countTasksByStatus(tasks, "created"),
      },
      {
        key: "waiting_assumptions",
        label: "Waiting",
        value: countTasksByStatus(tasks, "waiting_assumptions"),
      },
      {
        key: "running",
        label: "Running",
        value: countTasksByStatus(tasks, "running"),
      },
      {
        key: "outbound",
        label: "Outbound",
        value: countTasksByStatus(tasks, "outbound"),
      },
      {
        key: "pr_following",
        label: "PR Following",
        value: countTasksByStatus(tasks, "pr_following"),
      },
      {
        key: "closing",
        label: "Closing",
        value: countTasksByStatus(tasks, "closing"),
      },
    ],
    activitySeries: [...historyTasks]
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .map((task, index) => ({
        label: task.updatedAt.slice(0, 10),
        value: index + 1,
      })),
    recentTasks: tasks
      .filter(isActiveTask)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 5),
  };
};
