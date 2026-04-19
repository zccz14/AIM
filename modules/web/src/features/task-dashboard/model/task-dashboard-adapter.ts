import type { TaskListResponse, TaskStatus } from "@aim-ai/contract";

import type {
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

export const adaptTaskDashboard = (
  response: TaskListResponse,
): TaskDashboardViewModel & {
  graphEdges: DashboardGraphEdge[];
  graphNodes: DashboardGraphNode[];
} => {
  const tasks = response.items.map<DashboardTask>((task) => ({
    id: task.task_id,
    title: task.task_spec,
    contractStatus: task.status,
    dashboardStatus: toDashboardStatus(task.status),
    sessionId: task.session_id,
    worktreePath: task.worktree_path,
    pullRequestUrl: task.pull_request_url,
    dependencies: task.dependencies,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    isDone: task.done,
  }));
  const graphNodes = tasks.map<DashboardGraphNode>((task, index) => ({
    id: task.id,
    data: {
      color: statusColorMap[task.dashboardStatus],
      label: task.title,
      status: task.dashboardStatus,
      testId: `graph-node-${task.id}`,
    },
    position: {
      x: (index % 3) * 240,
      y: Math.floor(index / 3) * 140,
    },
  }));
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
