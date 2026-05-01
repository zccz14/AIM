import type {
  CoordinatorProposalDryRunResponse,
  CreateCoordinatorProposalDryRunRequest,
} from "@aim-ai/contract";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "../../../components/ui/badge.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.js";
import { useI18n } from "../../../lib/i18n.js";
import {
  createCoordinatorProposalDryRun,
  getProjectTokenUsage,
} from "../api/task-dashboard-api.js";
import type {
  DashboardDimensionReportItem,
  DashboardTask,
  TaskDashboardViewModel,
} from "../model/task-dashboard-view-model.js";
import {
  cardHeader,
  detailSurface,
  eyebrow,
  pageStack,
  panelStack,
  sectionCopy,
  sectionTitle,
  tableMeta,
  taskList,
  taskListItem,
} from "./dashboard-styles.js";
import { DirectorClarificationPanel } from "./director-clarification-panel.js";

const formatCount = (count: number, label: string) => `${count} ${label}`;

const formatTokens = (count: number) =>
  `${new Intl.NumberFormat("en-US").format(count)} tokens`;

const formatCost = (cost: number) => `$${cost.toFixed(2)}`;

const formatOptionalTokenThreshold = (threshold: number | null) =>
  threshold === null ? null : formatTokens(threshold);

const formatOptionalCostThreshold = (threshold: number | null) =>
  threshold === null ? null : formatCost(threshold);

const normalizeGapText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getCoverageTokens = (value: string) =>
  normalizeGapText(value)
    .split(" ")
    .filter(
      (token) =>
        token.length >= 4 &&
        ![
          "dashboard",
          "director",
          "current",
          "dimension",
          "missing",
          "visible",
        ].includes(token),
    );

const findMainGap = (reports: DashboardDimensionReportItem[]) =>
  reports
    .filter((report) => report.latestEvaluation !== null)
    .sort((left, right) => {
      const scoreDiff =
        (left.latestEvaluation?.score ?? 100) -
        (right.latestEvaluation?.score ?? 100);

      return scoreDiff === 0
        ? (right.latestEvaluation?.created_at ?? "").localeCompare(
            left.latestEvaluation?.created_at ?? "",
          )
        : scoreDiff;
    })[0];

const managerSummarySectionLabels = ["gap_analysis", "coordinator_handoff"];

const getManagerSummarySection = (evaluation: string, label: string) => {
  const sectionMatch = new RegExp(
    `(?:^|\\n)${label}:\\s*(.*?)(?=\\n[a-z][a-z_]+:\\s*|$)`,
    "s",
  ).exec(evaluation);

  if (!sectionMatch) {
    return null;
  }

  const sectionText = (sectionMatch[1] ?? "")
    .split("\n")
    .map((line) => line.trim().replace(/^-\s*/, ""))
    .filter(Boolean)
    .join("; ");

  return sectionText.length > 0 ? `${label}: ${sectionText}` : null;
};

const getManagerEvaluationSummary = (evaluation: string) => {
  const sections = managerSummarySectionLabels.flatMap((label) => {
    const summary = getManagerSummarySection(evaluation, label);

    return summary ? [summary] : [];
  });

  return sections.length > 0 ? sections : null;
};

const hasUnfinishedCoverage = (
  mainGap: DashboardDimensionReportItem | undefined,
  tasks: DashboardTask[],
) => {
  if (!mainGap?.latestEvaluation) {
    return false;
  }

  const gapTokens = getCoverageTokens(
    `${mainGap.dimension.name} ${mainGap.dimension.goal} ${mainGap.latestEvaluation.evaluation}`,
  );

  if (gapTokens.length === 0) {
    return false;
  }

  return tasks.some((task) => {
    const taskText = normalizeGapText(`${task.title} ${task.taskSpec}`);

    return gapTokens.some((token) => taskText.includes(token));
  });
};

const hasRejectedCoverageRisk = (tasks: DashboardTask[]) =>
  tasks.some((task) => {
    const feedback = normalizeGapText(
      `${task.title} ${task.taskSpec} ${task.result}`,
    );

    return (
      feedback.includes("stale") ||
      feedback.includes("duplicate") ||
      feedback.includes("overlap") ||
      feedback.includes("self overlap")
    );
  });

const toDryRunTaskPoolItem = (
  task: DashboardTask,
  currentBaselineCommit: string,
) => ({
  task_id: task.id,
  title: task.title,
  done: task.isDone,
  result: task.result,
  status: task.contractStatus,
  worktree_path: task.worktreePath,
  pull_request_url: task.pullRequestUrl,
  source_metadata: {
    latest_origin_main_commit: currentBaselineCommit,
  },
});

const buildDryRunRequest = ({
  activeTasks,
  completedTasks,
  currentBaselineCommit,
  dimensions,
  projectId,
}: {
  activeTasks: DashboardTask[];
  completedTasks: DashboardTask[];
  currentBaselineCommit: string;
  dimensions: DashboardDimensionReportItem[];
  projectId: string;
}): CreateCoordinatorProposalDryRunRequest => ({
  project_id: projectId,
  currentBaselineCommit,
  evaluations: dimensions.flatMap((report) =>
    report.latestEvaluation
      ? [
          {
            source_dimension: {
              id: report.dimension.id,
              name: report.dimension.name,
              goal: report.dimension.goal,
              evaluation_method: report.dimension.evaluation_method,
            },
            source_evaluation: {
              id: report.latestEvaluation.id,
              commit_sha: report.latestEvaluation.commit_sha,
              evaluation: report.latestEvaluation.evaluation,
              score: report.latestEvaluation.score,
            },
            source_gap: report.latestEvaluation.evaluation,
          },
        ]
      : [],
  ),
  taskPool: activeTasks.map((task) =>
    toDryRunTaskPoolItem(task, currentBaselineCommit),
  ),
  rejectedTasks: completedTasks
    .filter((task) => task.dashboardStatus === "rejected")
    .map((task) => toDryRunTaskPoolItem(task, currentBaselineCommit)),
  staleTaskFeedback: completedTasks
    .filter((task) => task.dashboardStatus === "rejected")
    .map((task) => ({
      reason: task.result || task.title,
      task: toDryRunTaskPoolItem(task, currentBaselineCommit),
    })),
});

const countDryRunDecisions = (
  dryRun: CoordinatorProposalDryRunResponse | undefined,
) => ({
  create:
    dryRun?.operations.filter((operation) => operation.decision === "create")
      .length ?? 0,
  keep:
    dryRun?.operations.filter((operation) => operation.decision === "keep")
      .length ?? 0,
  delete:
    dryRun?.operations.filter((operation) => operation.decision === "delete")
      .length ?? 0,
  blocked:
    dryRun?.operations.filter(
      (operation) => operation.planning_feedback?.blocked === true,
    ).length ?? 0,
});

const getDryRunOperationKey = (
  operation: CoordinatorProposalDryRunResponse["operations"][number],
) =>
  [
    operation.decision,
    "task_id" in operation
      ? operation.task_id
      : operation.task_spec_draft?.title,
    operation.planning_feedback?.reason,
    operation.source_evaluation?.id,
    operation.source_gap,
  ]
    .filter(Boolean)
    .join(":");

const CoordinatorDryRunSummary = ({
  activeTasks,
  completedTasks,
  currentBaselineCommit,
  dimensions,
  projectId,
}: {
  activeTasks: DashboardTask[];
  completedTasks: DashboardTask[];
  currentBaselineCommit: string | null | undefined;
  dimensions: DashboardDimensionReportItem[];
  projectId: string;
}) => {
  const { t } = useI18n();
  const dryRunRequest = currentBaselineCommit
    ? buildDryRunRequest({
        activeTasks,
        completedTasks,
        currentBaselineCommit,
        dimensions,
        projectId,
      })
    : null;
  const hasDryRunInput =
    dryRunRequest !== null && dryRunRequest.evaluations.length > 0;
  const dryRunQuery = useQuery({
    queryKey: ["coordinator-proposal-dry-run", projectId, dryRunRequest],
    queryFn: () => {
      if (!dryRunRequest) {
        throw new Error(t("coordinatorDryRunMissingBaseline"));
      }

      return createCoordinatorProposalDryRun(dryRunRequest);
    },
    enabled: hasDryRunInput,
    retry: false,
  });
  const dryRunCounts = countDryRunDecisions(dryRunQuery.data);
  const dryRunInputError = !currentBaselineCommit
    ? t("coordinatorDryRunMissingBaseline")
    : !hasDryRunInput
      ? t("coordinatorDryRunMissingEvaluations")
      : null;

  return (
    <section
      aria-label={t("coordinatorDryRunSummaryRegion")}
      className={pageStack}
    >
      <div>
        <p className={eyebrow}>{t("coordinatorInput")}</p>
        <h2 className={sectionTitle}>{t("coordinatorDryRunSummary")}</h2>
        <p className={sectionCopy}>{t("coordinatorDryRunDescription")}</p>
      </div>
      <Card>
        <CardContent className={panelStack}>
          <p className={sectionCopy}>{t("coordinatorDryRunSafety")}</p>
          {dryRunInputError ? (
            <div className={panelStack}>
              <strong>{t("coordinatorDryRunUnavailable")}</strong>
              <p className={sectionCopy}>{dryRunInputError}</p>
            </div>
          ) : dryRunQuery.isError ? (
            <div className={panelStack}>
              <strong>{t("coordinatorDryRunUnavailable")}</strong>
              <p className={sectionCopy}>{t("coordinatorDryRunRetry")}</p>
            </div>
          ) : dryRunQuery.isLoading ? (
            <p className={sectionCopy}>{t("coordinatorDryRunLoading")}</p>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <div className={panelStack}>
                  <p className={eyebrow}>{t("coordinatorDryRunCreate")}</p>
                  <strong>{`${t("coordinatorDryRunCreate")} ${dryRunCounts.create}`}</strong>
                </div>
                <div className={panelStack}>
                  <p className={eyebrow}>{t("coordinatorDryRunKeep")}</p>
                  <strong>{`${t("coordinatorDryRunKeep")} ${dryRunCounts.keep}`}</strong>
                </div>
                <div className={panelStack}>
                  <p className={eyebrow}>{t("coordinatorDryRunDelete")}</p>
                  <strong>{`${t("coordinatorDryRunDelete")} ${dryRunCounts.delete}`}</strong>
                </div>
                <div className={panelStack}>
                  <p className={eyebrow}>{t("coordinatorDryRunBlocked")}</p>
                  <strong>{`${t("coordinatorDryRunBlocked")} ${dryRunCounts.blocked}`}</strong>
                </div>
              </div>
              <div className={taskList}>
                {dryRunQuery.data?.operations.map((operation) => (
                  <div
                    className={taskListItem}
                    key={getDryRunOperationKey(operation)}
                  >
                    <div className={panelStack}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            operation.planning_feedback?.blocked
                              ? "destructive"
                              : operation.decision === "keep"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {operation.decision}
                        </Badge>
                        <span className={tableMeta}>
                          {operation.coverage_judgment.status}
                        </span>
                      </div>
                      <p className={sectionCopy}>
                        {operation.coverage_judgment.summary}
                      </p>
                      {operation.planning_feedback ? (
                        <p className={sectionCopy}>
                          {operation.planning_feedback.reason}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
};

const ProjectTokenUsageSummary = ({ projectId }: { projectId: string }) => {
  const { t } = useI18n();
  const usageQuery = useQuery({
    queryKey: ["project-token-usage", projectId],
    queryFn: () => getProjectTokenUsage(projectId),
    retry: false,
  });
  const usage = usageQuery.data;
  const heaviestTask = usage?.tasks
    .filter((task) => task.totals.total > 0 || task.totals.cost > 0)
    .sort((left, right) => right.totals.total - left.totals.total)[0];
  const failureCount = usage?.failures.length ?? 0;
  const hasUsage =
    (usage?.totals.total ?? 0) > 0 || (usage?.totals.cost ?? 0) > 0;
  const budgetWarning = usage?.budget_warning;
  const tokenThreshold = budgetWarning
    ? formatOptionalTokenThreshold(budgetWarning.token_warning_threshold)
    : null;
  const costThreshold = budgetWarning
    ? formatOptionalCostThreshold(budgetWarning.cost_warning_threshold)
    : null;

  return (
    <section aria-label={t("projectTokenUsageRegion")} className={pageStack}>
      <div>
        <p className={eyebrow}>{t("projectTokenUsageEyebrow")}</p>
        <h2 className={sectionTitle}>{t("projectTokenUsageTitle")}</h2>
        <p className={sectionCopy}>{t("projectTokenUsageDescription")}</p>
      </div>
      <Card>
        <CardContent className={panelStack}>
          {usageQuery.isError ? (
            <div className={panelStack}>
              <strong>{t("projectTokenUsageUnavailable")}</strong>
              <p className={sectionCopy}>{t("projectTokenUsageRetry")}</p>
            </div>
          ) : usageQuery.isLoading ? (
            <p className={sectionCopy}>{t("projectTokenUsageLoading")}</p>
          ) : usage && !hasUsage ? (
            <div className={panelStack}>
              <strong>{t("projectTokenUsageEmpty")}</strong>
              <p className={sectionCopy}>
                {t("projectTokenUsageEmptyDescription")}
              </p>
            </div>
          ) : usage ? (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <div className={panelStack}>
                  <p className={eyebrow}>{t("projectTokenUsageTokens")}</p>
                  <strong>{formatTokens(usage.totals.total)}</strong>
                </div>
                <div className={panelStack}>
                  <p className={eyebrow}>{t("projectTokenUsageCost")}</p>
                  <strong>{formatCost(usage.totals.cost)}</strong>
                </div>
                <div className={panelStack}>
                  <p className={eyebrow}>{t("projectTokenUsageBreakdown")}</p>
                  <strong>{`${t("projectTokenUsageInput")} ${usage.totals.input} / ${t("projectTokenUsageOutput")} ${usage.totals.output}`}</strong>
                </div>
                <div className={panelStack}>
                  <p className={eyebrow}>{t("projectTokenUsageMessages")}</p>
                  <strong>{`${usage.totals.messages} ${t("projectTokenUsageMessageUnit")}`}</strong>
                </div>
              </div>
              {budgetWarning?.status === "exceeded" ? (
                <div className={panelStack}>
                  <Badge variant="destructive">
                    {t("projectBudgetWarning")}
                  </Badge>
                  {budgetWarning.message ? (
                    <p className={sectionCopy}>{budgetWarning.message}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {tokenThreshold ? (
                      <span>{`${t("projectTokenWarningThreshold")} ${tokenThreshold}`}</span>
                    ) : null}
                    {costThreshold ? (
                      <span>{`${t("projectCostWarningThreshold")} ${costThreshold}`}</span>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className={panelStack}>
                <p className={eyebrow}>{t("projectTokenUsageHeaviestTask")}</p>
                {heaviestTask ? (
                  <a
                    className="font-medium underline-offset-4 hover:underline"
                    href={`#/tasks/${encodeURIComponent(heaviestTask.task_id)}`}
                  >
                    {heaviestTask.title}
                  </a>
                ) : (
                  <strong>{t("none")}</strong>
                )}
                {heaviestTask ? (
                  <p className={sectionCopy}>{`${formatTokens(
                    heaviestTask.totals.total,
                  )} / ${formatCost(heaviestTask.totals.cost)}`}</p>
                ) : null}
              </div>
              {failureCount > 0 ? (
                <div className={panelStack}>
                  <p
                    className={sectionCopy}
                  >{`${failureCount} ${t("projectTokenUsageFailureUnit")}`}</p>
                  <div className={taskList}>
                    {usage.failures.map((failure) => (
                      <div
                        className={taskListItem}
                        key={`${failure.task_id}-${failure.root_session_id}-${failure.code}`}
                      >
                        <div className={panelStack}>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="destructive">{failure.code}</Badge>
                            <strong>{`${failure.task_id} / ${failure.root_session_id}`}</strong>
                          </div>
                          <p className={sectionCopy}>{failure.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
};

export const ProjectDetailPage = ({
  dashboard,
  projectId,
}: {
  dashboard: TaskDashboardViewModel | undefined;
  projectId: string;
}) => {
  const { t } = useI18n();
  const project = dashboard?.projects.find((item) => item.id === projectId);

  if (!dashboard || !project) {
    return (
      <Card className={detailSurface}>
        <CardHeader>
          <CardTitle>{t("projectNotAvailable")}</CardTitle>
          <CardDescription>
            {t("projectNotAvailableDescription")}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const activeTasks = dashboard.tasks.filter(
    (task) => task.projectId === project.id,
  );
  const completedTasks = dashboard.historyTasks.filter(
    (task) => task.projectId === project.id,
  );
  const dependencyLinkedTasks = activeTasks.filter(
    (task) => task.dependencies.length > 0,
  );
  const rejectedTasks = completedTasks.filter(
    (task) => task.dashboardStatus === "rejected",
  );
  const dimensions = dashboard.dimensionReports.filter(
    (report) => report.dimension.project_id === project.id,
  );
  const mainGap = findMainGap(dimensions);
  const targetGapEvaluationSummary = mainGap?.latestEvaluation
    ? getManagerEvaluationSummary(mainGap.latestEvaluation.evaluation)
    : null;
  const isCoveredByUnfinishedTasks = hasUnfinishedCoverage(
    mainGap,
    activeTasks,
  );
  const rejectedCoverageRisk = hasRejectedCoverageRisk(rejectedTasks);
  const recommendedAction = rejectedCoverageRisk
    ? t("targetGapReplan")
    : isCoveredByUnfinishedTasks
      ? t("targetGapWaitDeveloper")
      : t("targetGapReplan");
  const optimizerStatus = dashboard.projectOptimizerStatuses[project.id];
  const currentBaselineCommit = optimizerStatus?.current_baseline_commit_sha;
  const configEnabled =
    optimizerStatus?.optimizer_enabled ?? project.optimizer_enabled;
  const runtimeLabel = optimizerStatus
    ? optimizerStatus.runtime_active
      ? t("projectOptimizerRuntimeActive")
      : t("projectOptimizerRuntimeInactive")
    : t("projectOptimizerRuntimeUnknown");
  const tokenUsage = optimizerStatus?.token_usage;
  const tokenUsageLabel = tokenUsage
    ? tokenUsage.availability === "available"
      ? t("projectOptimizerTokenUsageAvailable")
      : tokenUsage.availability === "partial"
        ? t("projectOptimizerTokenUsagePartial")
        : tokenUsage.availability === "unavailable"
          ? t("projectOptimizerTokenUsageUnavailable")
          : t("projectOptimizerTokenUsageNoSessions")
    : t("projectOptimizerTokenUsageUnavailable");
  const recentOptimizerEvents = optimizerStatus?.recent_events ?? [];

  return (
    <section className={pageStack}>
      <Card className={detailSurface}>
        <CardHeader className={cardHeader}>
          <p className={eyebrow}>{t("projectDetail")}</p>
          <CardTitle>{project.name}</CardTitle>
          <CardDescription>{project.git_origin_url}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className={panelStack}>
            <p className={eyebrow}>{t("taskPool")}</p>
            <strong>
              {formatCount(activeTasks.length, t("taskSingular"))}
            </strong>
          </div>
          <div className={panelStack}>
            <p className={eyebrow}>{t("completedStatus")}</p>
            <strong>
              {formatCount(completedTasks.length, t("completedTaskSingular"))}
            </strong>
          </div>
          <div className={panelStack}>
            <p className={eyebrow}>{t("dependencyPressure")}</p>
            <strong>
              {formatCount(
                dependencyLinkedTasks.length,
                t("dependencyLinkedTask"),
              )}
            </strong>
          </div>
        </CardContent>
      </Card>

      <section aria-label={t("targetGapCockpitRegion")} className={pageStack}>
        <div>
          <p className={eyebrow}>{t("goalFit")}</p>
          <h2 className={sectionTitle}>{t("targetGapCockpit")}</h2>
          <p className={sectionCopy}>{t("targetGapCockpitDescription")}</p>
        </div>
        <Card>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className={panelStack}>
              <p className={eyebrow}>{t("targetGapMain")}</p>
              {mainGap?.latestEvaluation ? (
                <>
                  <strong>{mainGap.dimension.name}</strong>
                  {targetGapEvaluationSummary ? (
                    <div className={panelStack}>
                      {targetGapEvaluationSummary.map((summary) => (
                        <p className={sectionCopy} key={summary}>
                          {summary}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className={sectionCopy}>
                      {mainGap.latestEvaluation.evaluation}
                    </p>
                  )}
                  <Badge variant="outline">
                    {mainGap.latestEvaluation.score}/100
                  </Badge>
                  <a
                    className="font-medium underline-offset-4 hover:underline"
                    href={`#/dimensions/${encodeURIComponent(mainGap.dimension.id)}`}
                  >
                    {`${t("targetGapReviewPath")} ${mainGap.dimension.name} gap path`}
                  </a>
                </>
              ) : (
                <p className={sectionCopy}>{t("targetGapNoEvaluation")}</p>
              )}
            </div>
            <div className={panelStack}>
              <p className={eyebrow}>{t("targetGapCoverageStatus")}</p>
              <Badge
                variant={isCoveredByUnfinishedTasks ? "default" : "outline"}
              >
                {isCoveredByUnfinishedTasks
                  ? t("targetGapCovered")
                  : t("targetGapMissingCoverage")}
              </Badge>
              <p className={sectionCopy}>
                {`${activeTasks.length} unfinished task${activeTasks.length === 1 ? "" : "s"}`}
              </p>
            </div>
            <div className={panelStack}>
              <p className={eyebrow}>{t("targetGapRejectedRisk")}</p>
              <Badge
                variant={rejectedCoverageRisk ? "destructive" : "secondary"}
              >
                {rejectedCoverageRisk
                  ? t("targetGapRejectedRiskDetected")
                  : t("targetGapRejectedRiskClear")}
              </Badge>
              <p className={sectionCopy}>
                {formatCount(rejectedTasks.length, t("completedTaskSingular"))}
              </p>
            </div>
            <div className={panelStack}>
              <p className={eyebrow}>{t("targetGapAction")}</p>
              <strong>{recommendedAction}</strong>
              <p className={sectionCopy}>
                {optimizerStatus?.blocker_summary ?? runtimeLabel}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <DirectorClarificationPanel
        contextName={project.name}
        projectId={project.id}
      />

      <ProjectTokenUsageSummary projectId={project.id} />

      <CoordinatorDryRunSummary
        activeTasks={activeTasks}
        completedTasks={completedTasks}
        currentBaselineCommit={currentBaselineCommit}
        dimensions={dimensions}
        projectId={project.id}
      />

      <section
        aria-label={t("projectOptimizerRuntimeRegion")}
        className={pageStack}
      >
        <div>
          <p className={eyebrow}>{t("optimizer")}</p>
          <h2 className={sectionTitle}>{t("projectOptimizerRuntimeTitle")}</h2>
          <p className={sectionCopy}>
            {t("projectOptimizerRuntimeDescription")}
          </p>
        </div>
        <Card>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className={panelStack}>
              <p className={eyebrow}>{t("projectOptimizerConfig")}</p>
              <Badge variant={configEnabled ? "default" : "secondary"}>
                {configEnabled
                  ? t("projectOptimizerConfigEnabled")
                  : t("projectOptimizerConfigDisabled")}
              </Badge>
            </div>
            <div className={panelStack}>
              <p className={eyebrow}>{t("projectOptimizerRuntime")}</p>
              <Badge
                variant={
                  optimizerStatus?.runtime_active ? "default" : "outline"
                }
              >
                {runtimeLabel}
              </Badge>
            </div>
            <div className={panelStack}>
              <p className={eyebrow}>{t("projectOptimizerBlocker")}</p>
              <strong>{optimizerStatus?.blocker_summary ?? t("none")}</strong>
            </div>
            <div className={panelStack}>
              <p className={eyebrow}>{t("projectOptimizerTokenUsageStatus")}</p>
              <strong>{tokenUsageLabel}</strong>
              {tokenUsage ? (
                <>
                  <p className={sectionCopy}>{`${formatTokens(
                    tokenUsage.totals.total,
                  )} / ${formatCost(tokenUsage.totals.cost)}`}</p>
                  <p className={tableMeta}>
                    {`${tokenUsage.root_session_count} sessions / ${tokenUsage.failed_root_session_count} failed`}
                  </p>
                  {tokenUsage.failure_summary ? (
                    <p className={sectionCopy}>{tokenUsage.failure_summary}</p>
                  ) : null}
                </>
              ) : null}
            </div>
            <div className={`${panelStack} md:col-span-2`}>
              <p className={eyebrow}>{t("projectOptimizerRecentEvents")}</p>
              {recentOptimizerEvents.length > 0 ? (
                <div className={taskList}>
                  {recentOptimizerEvents.map((event) => (
                    <div
                      className={taskListItem}
                      key={`${event.lane_name}-${event.timestamp}-${event.summary}`}
                    >
                      <div className={panelStack}>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              event.event === "failure"
                                ? "destructive"
                                : event.event === "success"
                                  ? "default"
                                  : "outline"
                            }
                          >
                            {`${event.lane_name} ${event.event}`}
                          </Badge>
                          <span className={tableMeta}>{event.timestamp}</span>
                        </div>
                        <p className={sectionCopy}>{event.summary}</p>
                        {event.task_id || event.session_id ? (
                          <p className={tableMeta}>
                            {[event.task_id, event.session_id]
                              .filter(Boolean)
                              .join(" / ")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={sectionCopy}>
                  {t("projectOptimizerRecentEventsEmpty")}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-label={t("projectDimensionsRegion")} className={pageStack}>
        <div>
          <p className={eyebrow}>{t("dimensions")}</p>
          <h2 className={sectionTitle}>{t("projectDimensions")}</h2>
          <p className={sectionCopy}>{t("projectDimensionsDescription")}</p>
        </div>
        <Card>
          <CardContent className={taskList}>
            {dimensions.map((report) => (
              <div className={taskListItem} key={report.dimension.id}>
                <div className={panelStack}>
                  <a
                    className="font-medium underline-offset-4 hover:underline"
                    href={`#/dimensions/${encodeURIComponent(report.dimension.id)}`}
                  >
                    {report.dimension.name}
                  </a>
                  <p className={tableMeta}>{report.dimension.goal}</p>
                </div>
                <strong>
                  {report.latestEvaluation
                    ? `${report.latestEvaluation.score}/100`
                    : t("noScore")}
                </strong>
              </div>
            ))}
            {dimensions.length === 0 ? (
              <p className={sectionCopy}>{t("noDimensionsForProject")}</p>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </section>
  );
};
