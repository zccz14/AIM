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
          <p className="eyebrow">Throughput</p>
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
          <p className="eyebrow">Cadence</p>
          <h2 className="section-title">Recent Activity</h2>
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
  </div>
);
