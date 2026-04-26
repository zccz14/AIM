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
import { Badge } from "../../../components/ui/badge.js";
import { Button } from "../../../components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.js";
import { Field, FieldLabel } from "../../../components/ui/field.js";
import { Input } from "../../../components/ui/input.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select.js";
import { useI18n } from "../../../lib/i18n.js";
import type { TaskDashboardViewModel } from "../model/task-dashboard-view-model.js";
import {
  cardHeader,
  chartFrame,
  cockpitRegion,
  eyebrow,
  pageStack,
  panelStack,
  regionHeader,
  responsiveTwoGrid,
  sectionCopy,
  sectionTitle,
  tableMeta,
  taskList,
  taskListItem,
} from "./dashboard-styles.js";
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
    <div className={pageStack}>
      <section
        aria-label={t("baselineConvergenceMapRegion")}
        className={`${pageStack} ${cockpitRegion}`}
        id="convergence-map"
      >
        <div className={regionHeader}>
          <div>
            <p className={eyebrow}>{t("baselineConvergenceMapRegion")}</p>
            <h2 className={sectionTitle}>{t("goalStateReview")}</h2>
          </div>
          <p className={sectionCopy}>{t("goalStateReviewDescription")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {dashboard.summaryCards.map((card) => (
            <Card className="p-5" key={card.key}>
              <p className={eyebrow}>{card.label}</p>
              <h2 className="m-0 text-3xl font-medium tracking-tight">
                {card.value}
              </h2>
            </Card>
          ))}
        </div>

        <div className={responsiveTwoGrid}>
          <Card>
            <CardHeader className={cardHeader}>
              <p className={eyebrow}>{t("taskPool")}</p>
              <CardTitle className={sectionTitle}>Status Board</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={chartFrame}>
                <ResponsiveContainer height="100%" width="100%">
                  <BarChart data={dashboard.statusBoardItems}>
                    <XAxis dataKey="label" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar
                      dataKey="value"
                      fill="var(--primary)"
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className={cardHeader}>
              <p className={eyebrow}>{t("history")}</p>
              <CardTitle className={sectionTitle}>
                {t("completedResultActivity")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={chartFrame}>
                <ResponsiveContainer height="100%" width="100%">
                  <AreaChart data={dashboard.activitySeries}>
                    <XAxis dataKey="label" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Area
                      dataKey="value"
                      fill="var(--primary)"
                      stroke="var(--primary)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className={cardHeader}>
            <p className={eyebrow}>{t("decisionObservability")}</p>
            <CardTitle className={sectionTitle}>
              {t("taskPoolDecisionSignals")}
            </CardTitle>
            <CardDescription>
              {t("taskPoolDecisionSignalsDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className={taskList}>
            {dashboard.decisionSignals.map((signal) => (
              <div className={taskListItem} key={signal.key}>
                <div className={panelStack}>
                  <p className="m-0 text-sm font-medium">{signal.label}</p>
                  <p className={tableMeta}>{signal.detail}</p>
                </div>
                <strong>{signal.value}</strong>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section
        aria-label={t("evidenceLedgerLower")}
        className={`${pageStack} ${cockpitRegion}`}
        id="evidence-ledger"
      >
        <div className={regionHeader}>
          <div>
            <p className={eyebrow}>{t("evidenceLedgerLower")}</p>
            <h2 className={sectionTitle}>Task Evidence and Feedback</h2>
          </div>
          <p className={sectionCopy}>{t("evidenceLedgerDescription")}</p>
        </div>

        <Card>
          <CardHeader className={cardHeader}>
            <p className={eyebrow}>Signal</p>
            <CardTitle className={sectionTitle}>
              {t("recentActiveTasks")}
            </CardTitle>
          </CardHeader>
          <CardContent className={taskList}>
            {dashboard.recentTasks.map((task) => (
              <div className={taskListItem} key={task.id}>
                <div className={panelStack}>
                  <Button onClick={() => onSelectTask(task.id)} variant="link">
                    {task.title}
                  </Button>
                  <p className={tableMeta}>{task.id}</p>
                </div>
                <TaskStatusBadge status={task.dashboardStatus} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={cardHeader}>
            <p className={eyebrow}>{t("coordinatorInput")}</p>
            <CardTitle className={sectionTitle}>
              {t("rejectedFeedbackSignals")}
            </CardTitle>
            <CardDescription>
              {t("rejectedFeedbackSignalsDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className={pageStack}>
            <div className="grid gap-3 md:grid-cols-[minmax(12rem,0.35fr)_minmax(16rem,1fr)]">
              <Field>
                <FieldLabel>{t("reasonCategory")}</FieldLabel>
                <Select
                  onValueChange={setRejectedCategoryFilter}
                  value={rejectedCategoryFilter}
                >
                  <SelectTrigger aria-label={t("reasonCategory")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {rejectedCategoryOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="rejected-coordinate-filter">
                  Coordinate or task
                </FieldLabel>
                <Input
                  id="rejected-coordinate-filter"
                  onChange={(event) =>
                    setRejectedCoordinateFilter(event.target.value)
                  }
                  placeholder="Filter by project path, title, or task id"
                  type="search"
                  value={rejectedCoordinateFilter}
                />
              </Field>
            </div>
            <div className={taskList}>
              {filteredRejectedFeedbackSignals.map((signal) => (
                <article
                  className="flex flex-col gap-3 border-t py-4 first:border-t-0 first:pt-0 last:pb-0"
                  key={signal.key}
                >
                  <div className="flex items-start justify-between gap-4 max-md:flex-col">
                    <div className={panelStack}>
                      <p className={eyebrow}>{signal.reasonCategoryLabel}</p>
                      <h3 className={sectionTitle}>{signal.reasonSummary}</h3>
                    </div>
                    <Badge variant="destructive">
                      {signal.count} {signal.count === 1 ? "task" : "tasks"}
                    </Badge>
                  </div>
                  <p className={tableMeta}>Latest: {signal.latestAt}</p>
                  <p className={tableMeta}>
                    Coordinates: {signal.coordinates.join(", ")}
                  </p>
                  <div className={taskList}>
                    {signal.sampleTasks.map((task) => (
                      <div className={taskListItem} key={task.id}>
                        <div className={panelStack}>
                          <Button
                            onClick={() => onSelectTask(task.id)}
                            variant="link"
                          >
                            {task.title}
                          </Button>
                          <p className={tableMeta}>{task.id}</p>
                        </div>
                        <p className={tableMeta}>
                          {task.updatedAt.slice(0, 10)}
                        </p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
              {dashboard.rejectedFeedbackSignals.length === 0 ? (
                <p className={sectionCopy}>{t("noRejectedFeedbackRecorded")}</p>
              ) : null}
              {dashboard.rejectedFeedbackSignals.length > 0 &&
              filteredRejectedFeedbackSignals.length === 0 ? (
                <p className={sectionCopy}>{t("noRejectedFeedbackMatches")}</p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={cardHeader}>
            <p className={eyebrow}>{t("historyResults")}</p>
            <CardTitle className={sectionTitle}>
              {t("completedTaskFeedback")}
            </CardTitle>
          </CardHeader>
          <CardContent className={taskList}>
            {dashboard.historyTasks
              .slice()
              .sort((left, right) =>
                right.updatedAt.localeCompare(left.updatedAt),
              )
              .slice(0, 5)
              .map((task) => (
                <div className={taskListItem} key={task.id}>
                  <div className={panelStack}>
                    <Button
                      onClick={() => onSelectTask(task.id)}
                      variant="link"
                    >
                      {task.title}
                    </Button>
                    <p className={tableMeta}>
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
              <p className={sectionCopy}>No completed task history yet.</p>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </div>
  );
};
