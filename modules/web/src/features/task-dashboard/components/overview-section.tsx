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
  cockpitRegion,
  eyebrow,
  pageStack,
  panelStack,
  regionHeader,
  sectionCopy,
  sectionTitle,
  tableMeta,
  taskList,
  taskListItem,
} from "./dashboard-styles.js";

const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

export const OverviewSection = ({
  dashboard,
}: {
  dashboard: TaskDashboardViewModel;
}) => {
  const { t } = useI18n();
  const projectRows = dashboard.projects.map((project) => {
    const activeTasks = dashboard.tasks.filter(
      (task) =>
        task.projectId === project.id || task.projectPath === project.id,
    );
    const completedTasks = dashboard.historyTasks.filter(
      (task) =>
        task.projectId === project.id || task.projectPath === project.id,
    );
    const dimensions = dashboard.dimensionReports.filter(
      (report) => report.dimension.project_id === project.id,
    );

    return {
      activeTasks,
      completedTasks,
      dimensions,
      project,
    };
  });

  return (
    <section
      aria-label="Project observability"
      className={`${pageStack} ${cockpitRegion}`}
      id="project-observability"
    >
      <div className={regionHeader}>
        <div>
          <p className={eyebrow}>Project observability</p>
          <h2 className={sectionTitle}>Top-Level Dashboard</h2>
        </div>
        <p className={sectionCopy}>{t("dashboardSimpleDescription")}</p>
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

      <Card>
        <CardHeader className={cardHeader}>
          <p className={eyebrow}>Projects</p>
          <CardTitle className={sectionTitle}>Project Health</CardTitle>
          <CardDescription>
            Project-level scan path for dimensions and task pool pressure.
          </CardDescription>
        </CardHeader>
        <CardContent className={taskList}>
          {projectRows.map(
            ({ activeTasks, completedTasks, dimensions, project }) => (
              <div className={taskListItem} key={project.id}>
                <div className={panelStack}>
                  <a
                    className="font-medium underline-offset-4 hover:underline"
                    href={`#/projects/${encodeURIComponent(project.id)}`}
                  >
                    {project.name}
                  </a>
                  <p className={tableMeta}>{project.git_origin_url}</p>
                </div>
                <p className={tableMeta}>
                  {pluralize(dimensions.length, "dimension")} /{" "}
                  {pluralize(activeTasks.length, "active task")} /{" "}
                  {pluralize(completedTasks.length, "completed task")}
                </p>
              </div>
            ),
          )}
          {projectRows.length === 0 ? (
            <p className={sectionCopy}>No registered projects available.</p>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
};
