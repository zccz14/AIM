import { Badge } from "../../../components/ui/badge.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.js";
import { useI18n } from "../../../lib/i18n.js";
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
  const configEnabled =
    optimizerStatus?.optimizer_enabled ?? project.optimizer_enabled;
  const runtimeLabel = optimizerStatus
    ? optimizerStatus.runtime_active
      ? t("projectOptimizerRuntimeActive")
      : t("projectOptimizerRuntimeInactive")
    : t("projectOptimizerRuntimeUnknown");

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
                  <p className={sectionCopy}>
                    {mainGap.latestEvaluation.evaluation}
                  </p>
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
