import type { Task, TaskListResponse, TaskStatus } from "@aim-ai/contract";

import type {
  DashboardClosureCue,
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
  ready: "#228be6",
  running: "#fab005",
  blocked: "#f08c00",
  done: "#2f9e44",
  failed: "#e03131",
};

export const toDashboardStatus = (status: TaskStatus): DashboardStatus => {
  switch (status) {
    case "created":
      return "ready";
    case "waiting_assumptions":
      return "blocked";
    case "running":
    case "outbound":
    case "pr_following":
    case "closing":
      return "running";
    case "succeeded":
      return "done";
    case "failed":
      return "failed";
  }
};

const countTasksByStatus = (tasks: DashboardTask[], status: DashboardStatus) =>
  tasks.filter((task) => task.dashboardStatus === status).length;

const isActiveTask = (task: DashboardTask) =>
  task.dashboardStatus === "ready" ||
  task.dashboardStatus === "running" ||
  task.dashboardStatus === "blocked";

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

const buildClosureChecklist = (task: Task): DashboardClosureCue[] => {
  const hasPullRequest = task.pull_request_url !== null;
  const hasWorktree = task.worktree_path !== null;
  const hasResult = task.result.trim().length > 0;
  const hasSucceededCompletion = task.done && task.status === "succeeded";

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
  response: TaskListResponse,
): TaskDashboardViewModel & {
  graphEdges: DashboardGraphEdge[];
  graphNodes: DashboardGraphNode[];
} => {
  const tasks = response.items.map(adaptDashboardTask);
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

  return {
    graphEdges,
    graphNodes,
    tasks,
    summaryCards: [
      { key: "total", label: "Total Tasks", value: tasks.length },
      {
        key: "running",
        label: "Running",
        value: countTasksByStatus(tasks, "running"),
      },
      {
        key: "blocked",
        label: "Blocked",
        value: countTasksByStatus(tasks, "blocked"),
      },
      {
        key: "done",
        label: "Done",
        value: countTasksByStatus(tasks, "done"),
      },
    ],
    statusBoardItems: [
      {
        key: "ready",
        label: "Ready",
        value: countTasksByStatus(tasks, "ready"),
      },
      {
        key: "running",
        label: "Running",
        value: countTasksByStatus(tasks, "running"),
      },
      {
        key: "blocked",
        label: "Blocked",
        value: countTasksByStatus(tasks, "blocked"),
      },
      {
        key: "done",
        label: "Done",
        value: countTasksByStatus(tasks, "done"),
      },
      {
        key: "failed",
        label: "Failed",
        value: countTasksByStatus(tasks, "failed"),
      },
    ],
    activitySeries: [...tasks]
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
