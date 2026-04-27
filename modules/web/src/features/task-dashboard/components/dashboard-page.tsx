import { AlertCircle, LoaderCircle, RefreshCw } from "lucide-react";
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
import { ThemeToggle } from "../../../components/ui/theme-toggle.js";
import { useI18n } from "../../../lib/i18n.js";
import { cn } from "../../../lib/utils.js";
import { getTaskDashboardErrorMessage } from "../queries.js";
import { useTaskDashboardQuery } from "../use-task-dashboard-query.js";
import { AimDimensionReportSection } from "./aim-dimension-report-section.js";
import { DashboardPanelBoundary } from "./dashboard-error-boundary.js";
import {
  actionGroup,
  cockpitRegion,
  eyebrow,
  pageStack,
  panelStack,
  sectionCopy,
  sectionStack,
} from "./dashboard-styles.js";
import { DimensionDetailsPage } from "./dimension-details-page.js";
import { OverviewSection } from "./overview-section.js";
import { ProjectDetailPage } from "./project-detail-page.js";
import { ProjectRegisterPage } from "./project-register-page.js";
import { ServerBaseUrlForm } from "./server-base-url-form.js";
import { TaskDetailsPage } from "./task-details-page.js";

type DashboardRoute =
  | { kind: "dashboard" }
  | { dimensionId: string; kind: "dimension" }
  | { kind: "project"; projectId: string }
  | { kind: "projects" }
  | { kind: "task"; taskId: string };

const DASHBOARD_PATH = "/";
const BLOCKED_CREATE_TASK_PATH = "/tasks/new";
const PROJECTS_PATH = "/projects";

const getCurrentPath = () => {
  const hashPath = window.location.hash.slice(1);

  return hashPath.startsWith("/") ? hashPath : DASHBOARD_PATH;
};

const getDashboardRoute = (pathname: string): DashboardRoute => {
  if (
    pathname === BLOCKED_CREATE_TASK_PATH ||
    pathname.startsWith("/task-write-bulks/")
  ) {
    return { kind: "dashboard" };
  }

  if (pathname === PROJECTS_PATH) {
    return { kind: "projects" };
  }

  const projectMatch = pathname.match(/^\/projects\/([^/]+)$/);

  if (projectMatch) {
    const projectId = projectMatch[1];

    if (projectId) {
      return { kind: "project", projectId: decodeURIComponent(projectId) };
    }
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

  return { kind: "dashboard" };
};

const navigateTo = (pathname: string) => {
  window.location.hash = pathname;
  window.dispatchEvent(new HashChangeEvent("hashchange"));
};

export const DashboardPage = () => {
  const { t } = useI18n();
  const dashboardQuery = useTaskDashboardQuery();
  const [pathname, setPathname] = useState(getCurrentPath);
  const route = useMemo(() => getDashboardRoute(pathname), [pathname]);
  const selectedTaskId = route.kind === "task" ? route.taskId : null;
  const selectedTask =
    dashboardQuery.data?.tasks.find((task) => task.id === selectedTaskId) ??
    dashboardQuery.data?.historyTasks.find(
      (task) => task.id === selectedTaskId,
    ) ??
    null;
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
      dashboardQuery.data.projects.length > 0);
  useEffect(() => {
    const handleHashChange = () => setPathname(getCurrentPath());

    window.addEventListener("hashchange", handleHashChange);

    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (
      pathname === BLOCKED_CREATE_TASK_PATH ||
      pathname.startsWith("/task-write-bulks/")
    ) {
      navigateTo(DASHBOARD_PATH);
    }
  }, [pathname]);

  const handleRefresh = async () => {
    await dashboardQuery.refetch();
  };

  const goToDashboard = () => {
    navigateTo(DASHBOARD_PATH);
  };

  const goToProjects = () => {
    navigateTo(PROJECTS_PATH);
  };

  const goToDimension = (dimensionId: string) => {
    navigateTo(`/dimensions/${encodeURIComponent(dimensionId)}`);
  };

  const headerTitle =
    route.kind === "dashboard"
      ? t("dashboard")
      : route.kind === "projects"
        ? t("projectRegister")
        : route.kind === "project"
          ? t("projectDetail")
          : route.kind === "dimension"
            ? t("dimensionDetail")
            : t("taskDetails");

  const renderContent = () => {
    if (route.kind === "task") {
      return (
        <DashboardPanelBoundary
          onRetry={handleRefresh}
          resetKeys={[route.kind, selectedTask?.id]}
          scope={t("taskDetails")}
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
          scope={t("projectRegister")}
        >
          <ProjectRegisterPage />
        </DashboardPanelBoundary>
      );
    }

    if (route.kind === "project") {
      return (
        <DashboardPanelBoundary
          onRetry={handleRefresh}
          resetKeys={[route.kind, route.projectId, dashboardQuery.data]}
          scope={t("projectDetail")}
        >
          <ProjectDetailPage
            dashboard={dashboardQuery.data}
            projectId={route.projectId}
          />
        </DashboardPanelBoundary>
      );
    }

    if (route.kind === "dimension") {
      return (
        <DashboardPanelBoundary
          onRetry={handleRefresh}
          resetKeys={[route.kind, selectedDimension?.dimension.id]}
          scope={t("dimensionDetail")}
        >
          <DimensionDetailsPage report={selectedDimension} />
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
                aria-label={t("loadingTaskDashboard")}
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
              <EmptyDescription>{t("refreshForEvidence")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {dashboardQuery.isSuccess && hasDashboardData ? (
          <div className="grid items-start gap-4">
            <DashboardPanelBoundary
              onRetry={handleRefresh}
              resetKeys={[dashboardQuery.data]}
              scope={t("dashboardOverview")}
            >
              <OverviewSection dashboard={dashboardQuery.data} />
            </DashboardPanelBoundary>
            <DashboardPanelBoundary
              onRetry={handleRefresh}
              resetKeys={[dashboardQuery.data.dimensionReports]}
              scope={t("aimDimensionReport")}
            >
              <AimDimensionReportSection
                dimensionReports={dashboardQuery.data.dimensionReports}
                onSelectDimension={goToDimension}
              />
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
                    alt={t("aimIcon")}
                    className="size-10 border bg-card p-2"
                    src="/aim-icon.svg"
                  />
                  <div className={panelStack}>
                    <p className={eyebrow}>{t("aimNavigator")}</p>
                    <h1 className="m-0 text-base font-medium">AIM</h1>
                  </div>
                </div>
              </div>
              <fieldset
                aria-label={t("globalControls")}
                className={actionGroup}
              >
                <LanguageToggle />
                <ThemeToggle />
                <Button
                  disabled={dashboardQuery.isFetching}
                  onClick={() => void handleRefresh()}
                  size="sm"
                  variant="outline"
                >
                  <RefreshCw data-icon="inline-start" />
                  {t("refresh")}
                </Button>
                {route.kind !== "dashboard"
                  ? renderNavAction(
                      false,
                      false,
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
                    {renderWorkspaceLink("#/projects", t("projects"))}
                    {renderWorkspaceLink(
                      "#aim-dimension-report",
                      t("dimensions"),
                    )}
                  </nav>
                ) : null}
                <nav aria-label={t("aimSections")} className={actionGroup}>
                  {renderNavAction(
                    route.kind === "dashboard",
                    false,
                    t("dashboard"),
                    goToDashboard,
                  )}
                  {renderNavAction(
                    route.kind === "projects" || route.kind === "project",
                    false,
                    t("projects"),
                    goToProjects,
                  )}
                </nav>
              </div>
            </div>
          </div>
        </header>

        <main className={cn(pageStack, cockpitRegion)}>{renderContent()}</main>
      </div>
    </div>
  );
};
