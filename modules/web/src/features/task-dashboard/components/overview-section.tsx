import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TaskDashboardViewModel } from "../model/task-dashboard-view-model.js";
import { TaskStatusBadge } from "./task-status-badge.js";

const summarizeResult = (result: string) => {
  const trimmedResult = result.trim();

  if (trimmedResult.length === 0) {
    return "No result feedback recorded";
  }

  return trimmedResult.length <= 120
    ? trimmedResult
    : `${trimmedResult.slice(0, 117)}...`;
};

export const OverviewSection = ({
  dashboard,
  onSelectTask,
}: {
  dashboard: TaskDashboardViewModel;
  onSelectTask: (taskId: string) => void;
}) => (
  <div className="section-stack">
    <div className="summary-grid">
      {dashboard.summaryCards.map((card) => (
        <section className="surface-stat" key={card.key}>
          <p className="eyebrow">{card.label}</p>
          <h2 className="page-title">{card.value}</h2>
        </section>
      ))}
    </div>

    <div className="split-grid">
      <section className="surface-card section-stack">
        <div>
          <p className="eyebrow">Task Pool</p>
          <h2 className="section-title">Status Board</h2>
        </div>
        <div className="chart-frame">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={dashboard.statusBoardItems}>
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#22d3ee" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="surface-card section-stack">
        <div>
          <p className="eyebrow">History</p>
          <h2 className="section-title">Completed Result Activity</h2>
        </div>
        <div className="chart-frame">
          <ResponsiveContainer height="100%" width="100%">
            <AreaChart data={dashboard.activitySeries}>
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Area dataKey="value" fill="#67e8f9" stroke="#6366f1" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>

    <section className="surface-card section-stack">
      <div>
        <p className="eyebrow">Signal</p>
        <h2 className="section-title">Recent Active Tasks</h2>
      </div>
      <div className="task-list">
        {dashboard.recentTasks.map((task) => (
          <div className="task-list__item" key={task.id}>
            <div className="panel-stack">
              <button
                className="task-title-button"
                onClick={() => onSelectTask(task.id)}
                type="button"
              >
                {task.title}
              </button>
              <p className="table-meta">{task.id}</p>
            </div>
            <TaskStatusBadge status={task.dashboardStatus} />
          </div>
        ))}
      </div>
    </section>

    <section className="surface-card section-stack">
      <div>
        <p className="eyebrow">History Results</p>
        <h2 className="section-title">Completed Task Feedback</h2>
      </div>
      <div className="task-list">
        {dashboard.historyTasks
          .slice()
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          .slice(0, 5)
          .map((task) => (
            <div className="task-list__item" key={task.id}>
              <div className="panel-stack">
                <button
                  className="task-title-button"
                  onClick={() => onSelectTask(task.id)}
                  type="button"
                >
                  {task.title}
                </button>
                <p className="table-meta">{summarizeResult(task.result)}</p>
              </div>
              <TaskStatusBadge status={task.dashboardStatus} />
            </div>
          ))}
        {dashboard.historyTasks.length === 0 ? (
          <p className="muted-text">No completed task history yet.</p>
        ) : null}
      </div>
    </section>
  </div>
);
