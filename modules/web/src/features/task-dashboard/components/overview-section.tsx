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
import { Card } from "../../../components/ui/card.js";
import { Input } from "../../../components/ui/input.js";
import { Label } from "../../../components/ui/label.js";
import { Select } from "../../../components/ui/select.js";
import { useI18n } from "../../../lib/i18n.js";
import type { TaskDashboardViewModel } from "../model/task-dashboard-view-model.js";
import { TaskStatusBadge } from "./task-status-badge.js";

// English section labels remain in i18n resources: Recent Active Tasks.

const summarizeResult = (result: string, emptyLabel: string) => {
  const trimmedResult = result.trim();

  if (trimmedResult.length === 0) {
    return emptyLabel;
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
  const { t } = useI18n();
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
      <section
        aria-label={t("baselineConvergenceMapRegion")}
        className="section-stack cockpit-region"
        id="convergence-map"
      >
        <div className="region-header">
          <div>
            <p className="eyebrow">{t("baselineConvergenceMapRegion")}</p>
            <h2 className="section-title">{t("goalStateReview")}</h2>
          </div>
          <p className="section-copy">{t("goalStateReviewDescription")}</p>
        </div>
        <div className="summary-grid">
          {dashboard.summaryCards.map((card) => (
            <section className="surface-stat" key={card.key}>
              <p className="eyebrow">{card.label}</p>
              <h2 className="page-title">{card.value}</h2>
            </section>
          ))}
        </div>

        <div className="split-grid">
          <Card className="section-stack evidence-panel">
            <div>
              <p className="eyebrow">{t("taskPool")}</p>
              <h2 className="section-title">Status Board</h2>
            </div>
            <div className="chart-frame">
              <ResponsiveContainer height="100%" width="100%">
                <BarChart data={dashboard.statusBoardItems}>
                  <XAxis dataKey="label" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar
                    dataKey="value"
                    fill="var(--status-blocked)"
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="section-stack evidence-panel">
            <div>
              <p className="eyebrow">{t("history")}</p>
              <h2 className="section-title">{t("completedResultActivity")}</h2>
            </div>
            <div className="chart-frame">
              <ResponsiveContainer height="100%" width="100%">
                <AreaChart data={dashboard.activitySeries}>
                  <XAxis dataKey="label" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Area
                    dataKey="value"
                    fill="var(--status-ready)"
                    stroke="var(--primary)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <Card className="section-stack evidence-panel">
          <div>
            <p className="eyebrow">{t("decisionObservability")}</p>
            <h2 className="section-title">{t("taskPoolDecisionSignals")}</h2>
            <p className="section-copy">
              {t("taskPoolDecisionSignalsDescription")}
            </p>
          </div>
          <div className="task-list">
            {dashboard.decisionSignals.map((signal) => (
              <div className="task-list__item" key={signal.key}>
                <div className="panel-stack">
                  <p className="field-label">{signal.label}</p>
                  <p className="table-meta">{signal.detail}</p>
                </div>
                <strong>{signal.value}</strong>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section
        aria-label={t("evidenceLedgerLower")}
        className="section-stack cockpit-region"
        id="evidence-ledger"
      >
        <div className="region-header">
          <div>
            <p className="eyebrow">{t("evidenceLedgerLower")}</p>
            <h2 className="section-title">Task Evidence and Feedback</h2>
          </div>
          <p className="section-copy">{t("evidenceLedgerDescription")}</p>
        </div>

        <Card className="section-stack evidence-panel">
          <div>
            <p className="eyebrow">Signal</p>
            <h2 className="section-title">{t("recentActiveTasks")}</h2>
          </div>
          <div className="task-list">
            {dashboard.recentTasks.map((task) => (
              <div className="task-list__item" key={task.id}>
                <div className="panel-stack">
                  <Button onClick={() => onSelectTask(task.id)} variant="link">
                    {task.title}
                  </Button>
                  <p className="table-meta">{task.id}</p>
                </div>
                <TaskStatusBadge status={task.dashboardStatus} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="section-stack evidence-panel">
          <div>
            <p className="eyebrow">{t("coordinatorInput")}</p>
            <h2 className="section-title">{t("rejectedFeedbackSignals")}</h2>
            <p className="section-copy">
              {t("rejectedFeedbackSignalsDescription")}
            </p>
          </div>
          <div className="rejected-feedback-filters">
            <Label className="field-stack">
              <span className="field-label">{t("reasonCategory")}</span>
              <Select
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
              </Select>
            </Label>
            <Label className="field-stack">
              <span className="field-label">Coordinate or task</span>
              <Input
                onChange={(event) =>
                  setRejectedCoordinateFilter(event.target.value)
                }
                placeholder="Filter by project path, title, or task id"
                type="search"
                value={rejectedCoordinateFilter}
              />
            </Label>
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
                          variant="link"
                        >
                          {task.title}
                        </Button>
                        <p className="table-meta">{task.id}</p>
                      </div>
                      <p className="table-meta">
                        {task.updatedAt.slice(0, 10)}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
            {dashboard.rejectedFeedbackSignals.length === 0 ? (
              <p className="muted-text">{t("noRejectedFeedbackRecorded")}</p>
            ) : null}
            {dashboard.rejectedFeedbackSignals.length > 0 &&
            filteredRejectedFeedbackSignals.length === 0 ? (
              <p className="muted-text">{t("noRejectedFeedbackMatches")}</p>
            ) : null}
          </div>
        </Card>

        <Card className="section-stack evidence-panel">
          <div>
            <p className="eyebrow">{t("historyResults")}</p>
            <h2 className="section-title">{t("completedTaskFeedback")}</h2>
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
                      variant="link"
                    >
                      {task.title}
                    </Button>
                    <p className="table-meta">
                      {summarizeResult(
                        task.result,
                        t("noResultFeedbackRecorded"),
                      )}
                    </p>
                  </div>
                  <TaskStatusBadge status={task.dashboardStatus} />
                </div>
              ))}
            {dashboard.historyTasks.length === 0 ? (
              <p className="muted-text">No completed task history yet.</p>
            ) : null}
          </div>
        </Card>
      </section>
    </div>
  );
};
