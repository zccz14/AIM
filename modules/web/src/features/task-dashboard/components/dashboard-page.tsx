import type { OptimizerStatusResponse } from "@aim-ai/contract";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "../../../components/ui/alert.js";
import { Button } from "../../../components/ui/button.js";
import { Card, CardContent } from "../../../components/ui/card.js";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "../../../components/ui/empty.js";
import { LanguageToggle } from "../../../components/ui/language-toggle.js";
import { Skeleton } from "../../../components/ui/skeleton.js";
import { Switch } from "../../../components/ui/switch.js";
import { ThemeToggle } from "../../../components/ui/theme-toggle.js";
import { useI18n } from "../../../lib/i18n.js";
import { cn } from "../../../lib/utils.js";
import {
  getOpenCodeModels,
  getOptimizerStatus,
  startOptimizer,
  stopOptimizer,
} from "../api/task-dashboard-api.js";
import { adaptDashboardTask } from "../model/task-dashboard-adapter.js";
import type { DashboardTask } from "../model/task-dashboard-view-model.js";
import {
  getTaskCreateErrorMessage,
  getTaskDashboardErrorMessage,
  taskDashboardQueryOptions,
} from "../queries.js";
import { useTaskCreateMutation } from "../use-task-create-mutation.js";
import { useTaskDashboardQuery } from "../use-task-dashboard-query.js";
import { AimDimensionReportSection } from "./aim-dimension-report-section.js";
import { CreateTaskForm } from "./create-task-form.js";
import { DashboardPanelBoundary } from "./dashboard-error-boundary.js";
import {
  actionGroup,
  cockpitRegion,
  eyebrow,
  pageStack,
  panelStack,
  sectionCopy,
  sectionStack,
  sectionTitle,
} from "./dashboard-styles.js";
import { DimensionDetailsPage } from "./dimension-details-page.js";
import { ManagerReportDetailsPage } from "./manager-report-details-page.js";
import { ManagerReportSection } from "./manager-report-section.js";
import { OverviewSection } from "./overview-section.js";
import { ProjectRegisterPage } from "./project-register-page.js";
import { ServerBaseUrlForm } from "./server-base-url-form.js";
import { TaskDetailsPage } from "./task-details-page.js";
import { TaskTableSection } from "./task-table-section.js";
import { TaskWriteBulkDetailsPage } from "./task-write-bulk-details-page.js";
import { TaskWriteBulkSection } from "./task-write-bulk-section.js";

// English dashboard action labels remain in i18n resources: Create Task, Refresh, Retry.

type DashboardRoute =
  | { kind: "dashboard" }
  | { kind: "create" }
  | { dimensionId: string; kind: "dimension" }
  | { kind: "managerReport"; projectPath: string; reportId: string }
  | { kind: "projects" }
  | { kind: "task-write-bulk"; bulkId: string }
  | { kind: "task"; taskId: string };

const DASHBOARD_PATH = "/";
const CREATE_TASK_PATH = "/tasks/new";
const PROJECTS_PATH = "/projects";

const getCurrentPath = () => {
  const hashPath = window.location.hash.slice(1);

  return hashPath.startsWith("/") ? hashPath : DASHBOARD_PATH;
};

const getDashboardRoute = (pathname: string): DashboardRoute => {
  if (pathname === CREATE_TASK_PATH) {
    return { kind: "create" };
  }

  if (pathname === PROJECTS_PATH) {
    return { kind: "projects" };
  }

  const taskMatch = pathname.match(/^\/tasks\/([^/]+)$/);

  if (taskMatch) {
    const taskId = taskMatch[1];

    if (taskId) {
      return { kind: "task", taskId: decodeURIComponent(taskId) };
    }
  }

  const dimensionMatch = pathname.match(/^\/dimensions\/([^/]+)$/);

  if (dimensionMatch) {
    const dimensionId = dimensionMatch[1];

    if (dimensionId) {
      return {
        dimensionId: decodeURIComponent(dimensionId),
        kind: "dimension",
      };
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
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const dashboardQuery = useTaskDashboardQuery();
  const createTaskMutation = useTaskCreateMutation();
  const [pathname, setPathname] = useState(getCurrentPath);
  const [models, setModels] = useState<
    Awaited<ReturnType<typeof getOpenCodeModels>>["items"]
  >([]);
  const [optimizerStatus, setOptimizerStatus] =
    useState<OptimizerStatusResponse | null>(null);
  const [isOptimizerChanging, setIsOptimizerChanging] = useState(false);
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
  const selectedDimension =
    route.kind === "dimension"
      ? (dashboardQuery.data?.dimensionReports.find(
          (report) => report.dimension.id === route.dimensionId,
        ) ?? null)
      : null;
  const hasDashboardData =
    dashboardQuery.data !== undefined &&
    (dashboardQuery.data.tasks.length > 0 ||
      dashboardQuery.data.historyTasks.length > 0 ||
      dashboardQuery.data.dimensionReports.length > 0 ||
      dashboardQuery.data.taskWriteBulks.length > 0);
  const optimizerRunning = optimizerStatus?.running ?? false;

  useEffect(() => {
    const handleHashChange = () => setPathname(getCurrentPath());

    window.addEventListener("hashchange", handleHashChange);

    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    let isActive = true;

    void getOptimizerStatus()
      .then((status) => {
        if (isActive) {
          setOptimizerStatus(status);
        }
      })
      .catch(() => undefined);

    return () => {
      isActive = false;
    };
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
    const [, status] = await Promise.all([
      dashboardQuery.refetch(),
      getOptimizerStatus().catch(() => null),
    ]);

    if (status) {
      setOptimizerStatus(status);
    }
  };

  const handleOptimizerToggle = async () => {
    setIsOptimizerChanging(true);

    try {
      const status = optimizerRunning
        ? await stopOptimizer()
        : await startOptimizer();

      setOptimizerStatus(status);
    } catch {
      return;
    } finally {
      setIsOptimizerChanging(false);
    }
  };

  const goToDashboard = () => {
    createTaskMutation.reset();
    navigateTo(DASHBOARD_PATH);
  };

  const goToCreateTask = () => {
    createTaskMutation.reset();
    navigateTo(CREATE_TASK_PATH);
  };

  const goToProjects = () => {
    createTaskMutation.reset();
    navigateTo(PROJECTS_PATH);
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

  const goToDimension = (dimensionId: string) => {
    navigateTo(`/dimensions/${encodeURIComponent(dimensionId)}`);
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
      ? t("baselineConvergenceCockpit")
      : route.kind === "create"
        ? t("createTask")
        : route.kind === "projects"
          ? "Project Register"
          : route.kind === "managerReport"
            ? t("managerReport")
            : route.kind === "dimension"
              ? "Dimension Detail"
              : route.kind === "task-write-bulk"
                ? "Task Write Bulk Details"
                : t("taskDetails");

  const renderDirectorRail = () => (
    <aside
      aria-label={t("interventionRailAria")}
      className="sticky top-4 flex flex-col gap-4 self-stretch border bg-card p-5 max-lg:static"
      id="intervention-rail"
    >
      <div>
        <p className={eyebrow}>{t("humanReviewNeeded")}</p>
        <h3 className={sectionTitle}>{t("directorReviewRail")}</h3>
      </div>
      <p className={sectionCopy}>{t("humanAttention")}</p>
      <ul
        aria-label={t("directorCheckpoints")}
        className="m-0 grid list-none gap-2 p-0"
      >
        <li>{t("baselineReview")}</li>
        <li>{t("writeIntentReview")}</li>
        <li>{t("dependencyPressure")}</li>
        <li>{t("managerHandoffReport")}</li>
        <li>{t("rejectedFeedback")}</li>
        <li>{t("taskIntakeLower")}</li>
      </ul>
      <Button onClick={goToCreateTask} variant="outline">
        <Plus data-icon="inline-start" />
        {t("taskIntakeLower")}
      </Button>
    </aside>
  );

  const renderContent = () => {
    if (route.kind === "create") {
      return (
        <DashboardPanelBoundary
          onRetry={handleRefresh}
          resetKeys={[route.kind, models]}
          scope="Task Intake"
        >
          <section className={pageStack}>
            <p className={sectionCopy}>{t("createTaskDescription")}</p>
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
        </DashboardPanelBoundary>
      );
    }

    if (route.kind === "task") {
      return (
        <DashboardPanelBoundary
          onRetry={handleRefresh}
          resetKeys={[route.kind, selectedTask?.id]}
          scope="Task Details"
        >
          <TaskDetailsPage task={selectedTask} />
        </DashboardPanelBoundary>
      );
    }

    if (route.kind === "projects") {
      return (
        <DashboardPanelBoundary
          onRetry={handleRefresh}
          resetKeys={[route.kind]}
          scope="Project Register"
        >
          <ProjectRegisterPage />
        </DashboardPanelBoundary>
      );
    }

    if (route.kind === "task-write-bulk") {
      return (
        <DashboardPanelBoundary
          onRetry={handleRefresh}
          resetKeys={[route.kind, selectedTaskWriteBulk?.bulk_id]}
          scope="Task Write Bulk Details"
        >
          <TaskWriteBulkDetailsPage bulk={selectedTaskWriteBulk} />
        </DashboardPanelBoundary>
      );
    }

    if (route.kind === "dimension") {
      return (
        <DashboardPanelBoundary
          onRetry={handleRefresh}
          resetKeys={[route.kind, selectedDimension?.dimension.id]}
          scope="Dimension Detail"
        >
          <DimensionDetailsPage report={selectedDimension} />
        </DashboardPanelBoundary>
      );
    }

    if (route.kind === "managerReport") {
      return (
        <DashboardPanelBoundary
          onRetry={handleRefresh}
          resetKeys={[route.kind, selectedReport?.id]}
          scope="Manager Report Details"
        >
          <ManagerReportDetailsPage report={selectedReport} />
        </DashboardPanelBoundary>
      );
    }

    return (
      <div className={pageStack}>
        <ServerBaseUrlForm onSave={handleRefresh} />

        {dashboardQuery.isPending ? (
          <Card className="state-card">
            <CardContent className="flex items-center gap-3">
              <LoaderCircle
                aria-label="Loading task dashboard"
                className="animate-spin"
                data-icon="inline-start"
              />
              <div className={sectionStack}>
                <p className={sectionCopy}>{t("loadingConvergenceEvidence")}</p>
                <Skeleton className="h-3 w-full max-w-sm" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </CardContent>
          </Card>
        ) : null}

        {dashboardQuery.isError ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>{t("dashboardError")}</AlertTitle>
            <AlertDescription>
              <p>{getTaskDashboardErrorMessage(dashboardQuery.error)}</p>
              <Button
                disabled={dashboardQuery.isFetching}
                onClick={() => void handleRefresh()}
                variant="outline"
              >
                {t("retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {dashboardQuery.isSuccess && !hasDashboardData ? (
          <Empty className="state-card border">
            <EmptyHeader>
              <EmptyTitle>{t("noActiveDashboardData")}</EmptyTitle>
              <EmptyDescription>
                Refresh the configured server or create a task intake to begin
                collecting convergence evidence.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {dashboardQuery.isSuccess && hasDashboardData ? (
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.28fr)]">
            <div className="min-w-0">
              <DashboardPanelBoundary
                onRetry={handleRefresh}
                resetKeys={[dashboardQuery.data.dimensionReports]}
                scope="AIM Dimension Report"
              >
                <AimDimensionReportSection
                  dimensionReports={dashboardQuery.data.dimensionReports}
                  onSelectDimension={goToDimension}
                />
              </DashboardPanelBoundary>
              <DashboardPanelBoundary
                onRetry={handleRefresh}
                resetKeys={[dashboardQuery.data]}
                scope="Dashboard Overview"
              >
                <OverviewSection
                  dashboard={dashboardQuery.data}
                  onSelectTask={goToTask}
                />
              </DashboardPanelBoundary>
              <DashboardPanelBoundary
                onRetry={handleRefresh}
                resetKeys={[dashboardQuery.data.taskWriteBulks]}
                scope="Task Write Bulks"
              >
                <TaskWriteBulkSection
                  bulks={dashboardQuery.data.taskWriteBulks}
                  onSelectBulk={goToTaskWriteBulk}
                />
              </DashboardPanelBoundary>
              <DashboardPanelBoundary
                onRetry={handleRefresh}
                resetKeys={[dashboardQuery.data.managerReports]}
                scope="Manager Reports"
              >
                <ManagerReportSection
                  managerReports={dashboardQuery.data.managerReports}
                  onSelectReport={goToManagerReport}
                />
              </DashboardPanelBoundary>
              <DashboardPanelBoundary
                onRetry={handleRefresh}
                resetKeys={[dashboardQuery.data.tasks]}
                scope="Task Table"
              >
                <TaskTableSection
                  onSelectTask={goToTask}
                  tasks={dashboardQuery.data.tasks}
                />
              </DashboardPanelBoundary>
            </div>
            <DashboardPanelBoundary
              onRetry={handleRefresh}
              resetKeys={[route.kind]}
              scope="Intervention Rail"
            >
              {renderDirectorRail()}
            </DashboardPanelBoundary>
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
    <Button asChild size="sm" variant="outline">
      <a href={href}>{label}</a>
    </Button>
  );
  const optimizerStatusTitle = optimizerStatus
    ? `Triggers: ${optimizerStatus.enabled_triggers.join(", ") || "none"}; last event: ${optimizerStatus.last_event?.type ?? "none"}`
    : "Optimizer status not loaded";

  return (
    <div className="min-h-screen p-4 md:p-5">
      <div
        className="mx-auto flex w-full max-w-[1480px] flex-col gap-4 bg-background"
        data-testid="dashboard-shell"
      >
        <header className="border bg-card p-5">
          <div className="flex flex-col gap-5">
            <div className="flex w-full items-center justify-between gap-4 max-md:flex-col max-md:items-stretch">
              <div className={panelStack}>
                <div className="flex items-center justify-between gap-4">
                  <img
                    alt="AIM icon"
                    className="size-10 border bg-card p-2"
                    src="/aim-icon.svg"
                  />
                  <div className={panelStack}>
                    <p className={eyebrow}>{t("aimNavigator")}</p>
                    <h1 className="m-0 text-base font-medium">AIM</h1>
                  </div>
                </div>
              </div>
              <fieldset aria-label="Global controls" className={actionGroup}>
                <LanguageToggle />
                <ThemeToggle />
                <div
                  className="inline-flex min-h-9 cursor-pointer items-center gap-2 border bg-background px-3 text-xs font-medium has-[[data-slot=switch]:disabled]:cursor-not-allowed has-[[data-slot=switch]:disabled]:opacity-50"
                  title={optimizerStatusTitle}
                >
                  <Switch
                    aria-label="AIM Optimizer"
                    checked={optimizerRunning}
                    disabled={isOptimizerChanging}
                    onCheckedChange={() => void handleOptimizerToggle()}
                  />
                  <span>AIM Optimizer</span>
                </div>
                {route.kind !== "create" ? (
                  <Button
                    disabled={dashboardQuery.isFetching}
                    onClick={() => void handleRefresh()}
                    size="sm"
                    variant="outline"
                  >
                    <RefreshCw data-icon="inline-start" />
                    {t("refresh")}
                  </Button>
                ) : null}
                {route.kind !== "dashboard"
                  ? renderNavAction(
                      false,
                      createTaskMutation.isPending,
                      t("backToDashboard"),
                      goToDashboard,
                    )
                  : null}
              </fieldset>
            </div>

            <div className="flex w-full items-stretch justify-between gap-4 max-md:flex-col">
              <div className="flex max-w-3xl flex-col gap-2">
                <p className={eyebrow}>{t("baselineConvergenceForDirector")}</p>
                <h2 className="m-0 max-w-[13ch] text-4xl font-medium leading-none tracking-tight">
                  {headerTitle}
                </h2>
                {route.kind === "dashboard" ? (
                  <h3 className="m-0 w-fit border px-2 py-0.5 text-xs font-medium">
                    {t("methodologyHub")}
                  </h3>
                ) : null}
                <p className={sectionCopy}>{t("flowSummary")}</p>
                {route.kind === "dashboard" ? (
                  <nav
                    aria-label={t("directorWorkspace")}
                    className="mt-1 flex flex-wrap gap-2"
                  >
                    {renderWorkspaceLink(
                      "#aim-dimension-report",
                      t("aimDimensionReport"),
                    )}
                    {renderWorkspaceLink(
                      "#convergence-map",
                      t("baselineConvergenceMap"),
                    )}
                    {renderWorkspaceLink(
                      "#evidence-ledger",
                      t("evidenceLedger"),
                    )}
                    {renderWorkspaceLink(
                      "#manager-reports",
                      t("managerReports"),
                    )}
                    {renderWorkspaceLink(
                      "#task-write-bulks",
                      "Task Write Bulks",
                    )}
                    {renderWorkspaceLink(
                      "#intervention-rail",
                      t("interventionRail"),
                    )}
                  </nav>
                ) : null}
                <nav aria-label="AIM sections" className={actionGroup}>
                  {renderNavAction(
                    route.kind === "dashboard",
                    false,
                    t("baselineReview"),
                    goToDashboard,
                  )}
                  {renderNavAction(
                    route.kind === "dashboard",
                    false,
                    t("interventionQueue"),
                    goToDashboard,
                  )}
                  {renderNavAction(
                    route.kind === "projects",
                    false,
                    "Projects",
                    goToProjects,
                  )}
                  {renderNavAction(
                    route.kind === "create",
                    false,
                    t("taskIntake"),
                    goToCreateTask,
                  )}
                </nav>
              </div>

              <div className="flex flex-wrap justify-end gap-3">
                {route.kind === "dashboard" ? (
                  <Button onClick={goToCreateTask}>
                    <Plus data-icon="inline-start" />
                    {t("createTask")}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <main className={cn(pageStack, cockpitRegion)}>{renderContent()}</main>
      </div>
    </div>
  );
};
