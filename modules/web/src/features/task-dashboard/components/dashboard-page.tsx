import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "../../../components/ui/button.js";
import { Card } from "../../../components/ui/card.js";
import { ThemeToggle } from "../../../components/ui/theme-toggle.js";
import { getOpenCodeModels } from "../api/task-dashboard-api.js";
import { adaptDashboardTask } from "../model/task-dashboard-adapter.js";
import type { DashboardTask } from "../model/task-dashboard-view-model.js";
import {
  getTaskCreateErrorMessage,
  getTaskDashboardErrorMessage,
  taskDashboardQueryOptions,
} from "../queries.js";
import { useTaskCreateMutation } from "../use-task-create-mutation.js";
import { useTaskDashboardQuery } from "../use-task-dashboard-query.js";
import { CreateTaskForm } from "./create-task-form.js";
import { DependencyGraphSection } from "./dependency-graph-section.js";
import { ManagerReportDetailsPage } from "./manager-report-details-page.js";
import { ManagerReportSection } from "./manager-report-section.js";
import { OverviewSection } from "./overview-section.js";
import { ServerBaseUrlForm } from "./server-base-url-form.js";
import { TaskDetailsPage } from "./task-details-page.js";
import { TaskTableSection } from "./task-table-section.js";
import { TaskWriteBulkDetailsPage } from "./task-write-bulk-details-page.js";
import { TaskWriteBulkSection } from "./task-write-bulk-section.js";

type DashboardRoute =
  | { kind: "dashboard" }
  | { kind: "create" }
  | { kind: "managerReport"; projectPath: string; reportId: string }
  | { kind: "task-write-bulk"; bulkId: string }
  | { kind: "task"; taskId: string };

const DASHBOARD_PATH = "/";
const CREATE_TASK_PATH = "/tasks/new";

const getCurrentPath = () => {
  const hashPath = window.location.hash.slice(1);

  return hashPath.startsWith("/") ? hashPath : DASHBOARD_PATH;
};

const getDashboardRoute = (pathname: string): DashboardRoute => {
  if (pathname === CREATE_TASK_PATH) {
    return { kind: "create" };
  }

  const taskMatch = pathname.match(/^\/tasks\/([^/]+)$/);

  if (taskMatch) {
    const taskId = taskMatch[1];

    if (taskId) {
      return { kind: "task", taskId: decodeURIComponent(taskId) };
    }
  }

  const taskWriteBulkMatch = pathname.match(/^\/task-write-bulks\/([^/]+)$/);

  if (taskWriteBulkMatch) {
    const bulkId = taskWriteBulkMatch[1];

    if (bulkId) {
      return {
        kind: "task-write-bulk",
        bulkId: decodeURIComponent(bulkId),
      };
    }
  }

  const managerReportMatch = pathname.match(
    /^\/manager-reports\/([^/]+)\/([^/]+)$/,
  );

  if (managerReportMatch) {
    const projectPath = managerReportMatch[1];
    const reportId = managerReportMatch[2];

    if (projectPath && reportId) {
      return {
        kind: "managerReport",
        projectPath: decodeURIComponent(projectPath),
        reportId: decodeURIComponent(reportId),
      };
    }
  }

  return { kind: "dashboard" };
};

const navigateTo = (pathname: string) => {
  window.location.hash = pathname;
  window.dispatchEvent(new HashChangeEvent("hashchange"));
};

export const DashboardPage = () => {
  const queryClient = useQueryClient();
  const dashboardQuery = useTaskDashboardQuery();
  const createTaskMutation = useTaskCreateMutation();
  const [pathname, setPathname] = useState(getCurrentPath);
  const [models, setModels] = useState<
    Awaited<ReturnType<typeof getOpenCodeModels>>["items"]
  >([]);
  const [selectedTaskFallback, setSelectedTaskFallback] =
    useState<DashboardTask | null>(null);
  const route = useMemo(() => getDashboardRoute(pathname), [pathname]);
  const selectedTaskId = route.kind === "task" ? route.taskId : null;
  const selectedReport =
    route.kind === "managerReport"
      ? (dashboardQuery.data?.managerReports.find(
          (report) =>
            report.id === route.reportId &&
            report.projectPath === route.projectPath,
        ) ?? null)
      : null;
  const selectedTask =
    dashboardQuery.data?.tasks.find((task) => task.id === selectedTaskId) ??
    dashboardQuery.data?.historyTasks.find(
      (task) => task.id === selectedTaskId,
    ) ??
    (selectedTaskId === selectedTaskFallback?.id ? selectedTaskFallback : null);
  const selectedTaskWriteBulkId =
    route.kind === "task-write-bulk" ? route.bulkId : null;
  const selectedTaskWriteBulk =
    dashboardQuery.data?.taskWriteBulks.find(
      (bulk) => bulk.bulk_id === selectedTaskWriteBulkId,
    ) ?? null;
  const hasDashboardData =
    dashboardQuery.data !== undefined &&
    (dashboardQuery.data.tasks.length > 0 ||
      dashboardQuery.data.historyTasks.length > 0 ||
      dashboardQuery.data.taskWriteBulks.length > 0);

  useEffect(() => {
    const handleHashChange = () => setPathname(getCurrentPath());

    window.addEventListener("hashchange", handleHashChange);

    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (route.kind !== "create") {
      return;
    }

    let isActive = true;

    void getOpenCodeModels()
      .then((response) => {
        if (isActive) {
          setModels(response.items);
        }
      })
      .catch(() => {
        if (isActive) {
          setModels([]);
        }
      });

    return () => {
      isActive = false;
    };
  }, [route.kind]);

  const handleRefresh = async () => {
    await dashboardQuery.refetch();
  };

  const goToDashboard = () => {
    createTaskMutation.reset();
    navigateTo(DASHBOARD_PATH);
  };

  const goToCreateTask = () => {
    createTaskMutation.reset();
    navigateTo(CREATE_TASK_PATH);
  };

  const goToTask = (taskId: string) => {
    navigateTo(`/tasks/${encodeURIComponent(taskId)}`);
  };

  const goToTaskWriteBulk = (bulkId: string) => {
    navigateTo(`/task-write-bulks/${encodeURIComponent(bulkId)}`);
  };

  const goToManagerReport = (report: { id: string; projectPath: string }) => {
    navigateTo(
      `/manager-reports/${encodeURIComponent(report.projectPath)}/${encodeURIComponent(report.id)}`,
    );
  };

  const handleCreateTask = async (input: {
    title: string;
    projectPath: string;
    taskSpec: string;
    developerProviderId: string;
    developerModelId: string;
  }) => {
    createTaskMutation.reset();

    try {
      const createdTask = await createTaskMutation.mutateAsync(input);
      const createdDashboardTaskFallback = adaptDashboardTask(createdTask);

      setSelectedTaskFallback(createdDashboardTaskFallback);

      const refreshedDashboard = await queryClient
        .fetchQuery(taskDashboardQueryOptions)
        .catch(() => null);
      const createdDashboardTask = refreshedDashboard?.tasks.find(
        (task) => task.id === createdTask.task_id,
      );

      setSelectedTaskFallback(
        createdDashboardTask ?? createdDashboardTaskFallback,
      );
      goToTask(createdDashboardTask?.id ?? createdDashboardTaskFallback.id);
    } catch {
      return;
    }
  };

  const headerTitle =
    route.kind === "dashboard"
      ? "Baseline Convergence Cockpit"
      : route.kind === "create"
        ? "Create Task"
        : route.kind === "managerReport"
          ? "Manager Report"
          : route.kind === "task-write-bulk"
            ? "Task Write Bulk Details"
            : "Task Details";

  const renderDirectorRail = () => (
    <aside
      aria-label="Intervention rail"
      className="director-rail"
      id="intervention-rail"
    >
      <div>
        <p className="eyebrow">Human review needed</p>
        <h3 className="section-title">Director Review Rail</h3>
      </div>
      <p className="section-copy">
        Human attention stays on goals, blockers, and clarification points.
        Dependency pressure and rejected feedback stay visible beside the
        ledger.
      </p>
      <ul aria-label="Director checkpoints" className="rail-checkpoints">
        <li>Baseline review</li>
        <li>Write intent review</li>
        <li>Dependency pressure</li>
        <li>Manager handoff report</li>
        <li>Rejected feedback</li>
        <li>Task intake</li>
      </ul>
      <Button onClick={goToCreateTask} variant="outline">
        <Plus size={16} />
        Task intake
      </Button>
    </aside>
  );

  const renderContent = () => {
    if (route.kind === "create") {
      return (
        <section className="section-stack route-panel">
          <p className="section-copy">
            Create a new AIM task from the same Director workspace used for
            convergence review.
          </p>
          <CreateTaskForm
            errorMessage={
              createTaskMutation.isError
                ? getTaskCreateErrorMessage(createTaskMutation.error)
                : null
            }
            isSubmitting={createTaskMutation.isPending}
            models={models}
            onCancel={goToDashboard}
            onSubmit={handleCreateTask}
          />
        </section>
      );
    }

    if (route.kind === "task") {
      return <TaskDetailsPage task={selectedTask} />;
    }

    if (route.kind === "task-write-bulk") {
      return <TaskWriteBulkDetailsPage bulk={selectedTaskWriteBulk} />;
    }

    if (route.kind === "managerReport") {
      return <ManagerReportDetailsPage report={selectedReport} />;
    }

    return (
      <div className="section-stack">
        <ServerBaseUrlForm onSave={handleRefresh} />

        {dashboardQuery.isPending ? (
          <Card className="state-card">
            <div className="state-card__content">
              <LoaderCircle
                aria-label="Loading task dashboard"
                className="animate-spin"
              />
              <p className="muted-text">Loading convergence evidence.</p>
            </div>
          </Card>
        ) : null}

        {dashboardQuery.isError ? (
          <section className="alert-card">
            <div className="form-stack">
              <p className="field-label">
                <AlertCircle aria-hidden="true" size={16} /> Dashboard Error
              </p>
              <p>{getTaskDashboardErrorMessage(dashboardQuery.error)}</p>
              <Button
                disabled={dashboardQuery.isFetching}
                onClick={() => void handleRefresh()}
                variant="outline"
              >
                Retry
              </Button>
            </div>
          </section>
        ) : null}

        {dashboardQuery.isSuccess && !hasDashboardData ? (
          <Card className="state-card">
            <p className="muted-text">
              No active Task Pool or completed task history available from the
              configured server. Check the server target or create the first AIM
              task when the baseline direction is ready.
            </p>
          </Card>
        ) : null}

        {dashboardQuery.isSuccess && hasDashboardData ? (
          <div className="director-workspace">
            <div className="director-workspace__main">
              <OverviewSection
                dashboard={dashboardQuery.data}
                onSelectTask={goToTask}
              />
              <TaskWriteBulkSection
                bulks={dashboardQuery.data.taskWriteBulks}
                onSelectBulk={goToTaskWriteBulk}
              />
              <DependencyGraphSection
                graphEdges={dashboardQuery.data.graphEdges}
                graphNodes={dashboardQuery.data.graphNodes}
                onSelectTask={goToTask}
              />
              <ManagerReportSection
                managerReports={dashboardQuery.data.managerReports}
                onSelectReport={goToManagerReport}
              />
              <TaskTableSection
                onSelectTask={goToTask}
                tasks={dashboardQuery.data.tasks}
              />
            </div>
            {renderDirectorRail()}
          </div>
        ) : null}
      </div>
    );
  };

  const renderNavAction = (
    isActive: boolean,
    isDisabled: boolean,
    label: string,
    onClick: () => void,
  ) => (
    <Button
      disabled={isDisabled}
      onClick={onClick}
      variant={isActive ? "default" : "outline"}
    >
      {label}
    </Button>
  );

  const renderWorkspaceLink = (href: string, label: string) => (
    <a className="workspace-link" href={href}>
      {label}
    </a>
  );

  return (
    <div className="app-shell">
      <div className="app-shell__frame" data-testid="dashboard-shell">
        <header className="app-shell__hero">
          <div className="app-shell__hero-content">
            <div className="app-shell__topbar">
              <div className="brand-lockup">
                <div className="field-row">
                  <img
                    alt="AIM icon"
                    className="brand-mark"
                    src="/aim-icon.svg"
                  />
                  <div className="brand-lockup">
                    <p className="eyebrow">AIM Navigator</p>
                    <h1 className="brand-title">AIM</h1>
                  </div>
                </div>
              </div>
              <div className="actions-group">
                <ThemeToggle />
                {route.kind !== "dashboard"
                  ? renderNavAction(
                      false,
                      createTaskMutation.isPending,
                      "Back to Dashboard",
                      goToDashboard,
                    )
                  : null}
              </div>
            </div>

            <div className="app-shell__hero-main">
              <div className="hero-copy">
                <p className="eyebrow">
                  Baseline convergence for the AIM Director
                </p>
                <h2 className="hero-title">{headerTitle}</h2>
                {route.kind === "dashboard" ? (
                  <h3 className="route-kicker">Methodology Hub</h3>
                ) : null}
                <p className="section-copy">
                  A disciplined review surface for reading goal alignment, task
                  pool pressure, rejected feedback, dependency risk, and the
                  next human intervention.
                </p>
                {route.kind === "dashboard" ? (
                  <nav
                    aria-label="Director workspace"
                    className="workspace-nav"
                  >
                    {renderWorkspaceLink("#convergence-map", "Convergence Map")}
                    {renderWorkspaceLink("#evidence-ledger", "Evidence Ledger")}
                    {renderWorkspaceLink("#manager-reports", "Manager Reports")}
                    {renderWorkspaceLink(
                      "#task-write-bulks",
                      "Task Write Bulks",
                    )}
                    {renderWorkspaceLink(
                      "#intervention-rail",
                      "Intervention Rail",
                    )}
                  </nav>
                ) : null}
                <nav aria-label="AIM sections" className="nav-group">
                  {renderNavAction(
                    route.kind === "dashboard",
                    false,
                    "Baseline Review",
                    goToDashboard,
                  )}
                  {renderNavAction(
                    route.kind === "dashboard",
                    false,
                    "Intervention Queue",
                    goToDashboard,
                  )}
                  {renderNavAction(
                    route.kind === "create",
                    false,
                    "Task Intake",
                    goToCreateTask,
                  )}
                </nav>
              </div>

              <div className="hero-actions">
                {route.kind !== "create" ? (
                  <Button
                    disabled={dashboardQuery.isFetching}
                    onClick={() => void handleRefresh()}
                    variant="outline"
                  >
                    <RefreshCw size={16} />
                    Refresh
                  </Button>
                ) : null}
                {route.kind === "dashboard" ? (
                  <Button onClick={goToCreateTask}>
                    <Plus size={16} />
                    Create Task
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <main className="app-main">{renderContent()}</main>
      </div>
    </div>
  );
};
