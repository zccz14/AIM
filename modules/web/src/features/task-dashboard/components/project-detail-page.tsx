import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.js";
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

const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

export const ProjectDetailPage = ({
  dashboard,
  projectId,
}: {
  dashboard: TaskDashboardViewModel | undefined;
  projectId: string;
}) => {
  const project = dashboard?.projects.find((item) => item.id === projectId);

  if (!dashboard || !project) {
    return (
      <Card className={detailSurface}>
        <CardHeader>
          <CardTitle>Project not available</CardTitle>
          <CardDescription>
            Refresh projects before opening project-scoped observability.
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

  return (
    <section className={pageStack}>
      <Card className={detailSurface}>
        <CardHeader className={cardHeader}>
          <p className={eyebrow}>Project Detail</p>
          <CardTitle>{project.name}</CardTitle>
          <CardDescription>{project.git_origin_url}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className={panelStack}>
            <p className={eyebrow}>Task Pool</p>
            <strong>{pluralize(activeTasks.length, "active task")}</strong>
          </div>
          <div className={panelStack}>
            <p className={eyebrow}>Completed</p>
            <strong>
              {pluralize(completedTasks.length, "completed task")}
            </strong>
          </div>
          <div className={panelStack}>
            <p className={eyebrow}>Dependency Pressure</p>
            <strong>
              {pluralize(
                dependencyLinkedTasks.length,
                "dependency-linked task",
              )}
            </strong>
          </div>
        </CardContent>
      </Card>

      <section aria-label="Project dimensions" className={pageStack}>
        <div>
          <p className={eyebrow}>Dimensions</p>
          <h2 className={sectionTitle}>Project Dimensions</h2>
          <p className={sectionCopy}>
            Dimension fit is scoped to this project ID only.
          </p>
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
                    : "No score"}
                </strong>
              </div>
            ))}
            {dimensions.length === 0 ? (
              <p className={sectionCopy}>
                No dimensions registered for this project.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </section>
  );
};
