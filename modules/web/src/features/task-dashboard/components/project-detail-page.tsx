import { Badge } from "../../../components/ui/badge.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.js";
import { useI18n } from "../../../lib/i18n.js";
import type { TaskDashboardViewModel } from "../model/task-dashboard-view-model.js";
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

const formatCount = (count: number, label: string) => `${count} ${label}`;

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
  const dimensions = dashboard.dimensionReports.filter(
    (report) => report.dimension.project_id === project.id,
  );
  const optimizerStatus = dashboard.projectOptimizerStatuses[project.id];
  const configEnabled =
    optimizerStatus?.optimizer_enabled ?? project.optimizer_enabled;
  const runtimeLabel = optimizerStatus
    ? optimizerStatus.runtime_active
      ? "Runtime active"
      : "Runtime inactive"
    : "Runtime unknown";
  const recentEventText = optimizerStatus?.recent_event
    ? `${optimizerStatus.recent_event.type} (${optimizerStatus.recent_event.task_id})`
    : t("none");

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

      <section aria-label="Project optimizer runtime" className={pageStack}>
        <div>
          <p className={eyebrow}>Optimizer</p>
          <h2 className={sectionTitle}>Project Optimizer Runtime</h2>
          <p className={sectionCopy}>
            Project config and runtime activity are reported separately.
          </p>
        </div>
        <Card>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className={panelStack}>
              <p className={eyebrow}>Config</p>
              <Badge variant={configEnabled ? "default" : "secondary"}>
                {configEnabled ? "Config enabled" : "Config disabled"}
              </Badge>
            </div>
            <div className={panelStack}>
              <p className={eyebrow}>Runtime</p>
              <Badge
                variant={
                  optimizerStatus?.runtime_active ? "default" : "outline"
                }
              >
                {runtimeLabel}
              </Badge>
            </div>
            <div className={panelStack}>
              <p className={eyebrow}>Triggers</p>
              <strong>
                {optimizerStatus?.enabled_triggers.join(", ") || t("none")}
              </strong>
            </div>
            <div className={panelStack}>
              <p className={eyebrow}>Recent event</p>
              <strong>{recentEventText}</strong>
            </div>
            <div className={panelStack}>
              <p className={eyebrow}>Recent scan</p>
              <strong>{optimizerStatus?.recent_scan_at ?? t("none")}</strong>
            </div>
            <div className={panelStack}>
              <p className={eyebrow}>Blocker</p>
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
