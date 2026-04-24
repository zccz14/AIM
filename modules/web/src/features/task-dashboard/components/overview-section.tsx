import { useState } from "react";
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

import { Button } from "../../../components/ui/button.js";
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
}) => {
  const [rejectedCategoryFilter, setRejectedCategoryFilter] = useState("all");
  const [rejectedCoordinateFilter, setRejectedCoordinateFilter] = useState("");
  const normalizedCoordinateFilter = rejectedCoordinateFilter
    .trim()
    .toLowerCase();
  const filteredRejectedFeedbackSignals =
    dashboard.rejectedFeedbackSignals.filter((signal) => {
      const matchesCategory =
        rejectedCategoryFilter === "all" ||
        signal.reasonCategory === rejectedCategoryFilter;
      const matchesCoordinate =
        normalizedCoordinateFilter.length === 0 ||
        signal.coordinates.some((coordinate) =>
          coordinate.toLowerCase().includes(normalizedCoordinateFilter),
        ) ||
        signal.sampleTasks.some(
          (task) =>
            task.title.toLowerCase().includes(normalizedCoordinateFilter) ||
            task.id.toLowerCase().includes(normalizedCoordinateFilter),
        );

      return matchesCategory && matchesCoordinate;
    });
  const rejectedCategoryOptions = [
    { label: "All Rejected", value: "all" },
    { label: "Stale Spec Premise", value: "stale_spec" },
    { label: "Scheduler Session", value: "scheduler_session" },
    { label: "General Rejection", value: "general" },
  ];

  return (
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
                <Button onClick={() => onSelectTask(task.id)} variant="taskTitle">
                  {task.title}
                </Button>
                <p className="table-meta">{task.id}</p>
              </div>
              <TaskStatusBadge status={task.dashboardStatus} />
            </div>
          ))}
        </div>
      </section>

      <section className="surface-card section-stack">
        <div>
          <p className="eyebrow">Coordinator Input</p>
          <h2 className="section-title">Rejected Feedback Signals</h2>
          <p className="section-copy">
            Deduplicated failed task feedback for planning review only;
            historical task records stay unchanged.
          </p>
        </div>
        <div className="rejected-feedback-filters">
          <label className="field-stack">
            <span className="field-label">Reason category</span>
            <select
              className="field-input"
              onChange={(event) =>
                setRejectedCategoryFilter(event.target.value)
              }
              value={rejectedCategoryFilter}
            >
              {rejectedCategoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field-stack">
            <span className="field-label">Coordinate or task</span>
            <input
              className="field-input"
              onChange={(event) =>
                setRejectedCoordinateFilter(event.target.value)
              }
              placeholder="Filter by project path, title, or task id"
              type="search"
              value={rejectedCoordinateFilter}
            />
          </label>
        </div>
        <div className="task-list">
          {filteredRejectedFeedbackSignals.map((signal) => (
            <article className="rejected-feedback-card" key={signal.key}>
              <div className="rejected-feedback-card__header">
                <div className="panel-stack">
                  <p className="eyebrow">{signal.reasonCategoryLabel}</p>
                  <h3 className="section-title">{signal.reasonSummary}</h3>
                </div>
                <strong className="rejected-feedback-count">
                  {signal.count} {signal.count === 1 ? "task" : "tasks"}
                </strong>
              </div>
              <p className="table-meta">Latest: {signal.latestAt}</p>
              <p className="table-meta">
                Coordinates: {signal.coordinates.join(", ")}
              </p>
              <div className="task-list">
                {signal.sampleTasks.map((task) => (
                  <div className="task-list__item" key={task.id}>
                    <div className="panel-stack">
                      <Button
                        onClick={() => onSelectTask(task.id)}
                        variant="taskTitle"
                      >
                        {task.title}
                      </Button>
                      <p className="table-meta">{task.id}</p>
                    </div>
                    <p className="table-meta">{task.updatedAt.slice(0, 10)}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
          {dashboard.rejectedFeedbackSignals.length === 0 ? (
            <p className="muted-text">No rejected feedback recorded yet.</p>
          ) : null}
          {dashboard.rejectedFeedbackSignals.length > 0 &&
          filteredRejectedFeedbackSignals.length === 0 ? (
            <p className="muted-text">No rejected feedback matches filters.</p>
          ) : null}
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
            .sort((left, right) =>
              right.updatedAt.localeCompare(left.updatedAt),
            )
            .slice(0, 5)
            .map((task) => (
              <div className="task-list__item" key={task.id}>
                <div className="panel-stack">
                  <Button
                    onClick={() => onSelectTask(task.id)}
                    variant="taskTitle"
                  >
                    {task.title}
                  </Button>
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
};
