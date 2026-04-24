import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
import { OverviewSection } from "./overview-section.js";
import { ServerBaseUrlForm } from "./server-base-url-form.js";
import { TaskDetailsPage } from "./task-details-page.js";
import { TaskTableSection } from "./task-table-section.js";

type DashboardRoute =
  | { kind: "dashboard" }
  | { kind: "create" }
  | { kind: "task"; taskId: string };

const DASHBOARD_PATH = "/";
const CREATE_TASK_PATH = "/tasks/new";

const getCurrentPath = () => window.location.pathname;

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

  return { kind: "dashboard" };
};

const navigateTo = (pathname: string) => {
  window.history.pushState({}, "", pathname);
  window.dispatchEvent(new PopStateEvent("popstate"));
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
  const selectedTask =
    dashboardQuery.data?.tasks.find((task) => task.id === selectedTaskId) ??
    (selectedTaskId === selectedTaskFallback?.id ? selectedTaskFallback : null);

  useEffect(() => {
    const handlePopState = () => setPathname(getCurrentPath());

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
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
      ? "Task Dashboard"
      : route.kind === "create"
        ? "Create Task"
        : "Task Details";

  const renderContent = () => {
    if (route.kind === "create") {
      return (
        <section className="section-stack">
          <p className="section-copy">
            Create a new AIM task without leaving the main desktop workspace.
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

    return (
      <div className="section-stack">
        <ServerBaseUrlForm onSave={handleRefresh} />

        {dashboardQuery.isPending ? (
          <section className="surface-card">
            <div className="hero-actions">
              <LoaderCircle
                aria-label="Loading task dashboard"
                className="animate-spin"
              />
            </div>
          </section>
        ) : null}

        {dashboardQuery.isError ? (
          <section className="alert-card">
            <div className="form-stack">
              <p className="field-label">
                <AlertCircle aria-hidden="true" size={16} /> Dashboard Error
              </p>
              <p>{getTaskDashboardErrorMessage(dashboardQuery.error)}</p>
              <button
                className="ui-button ui-button--ghost"
                disabled={dashboardQuery.isFetching}
                onClick={() => void handleRefresh()}
                type="button"
              >
                Retry
              </button>
            </div>
          </section>
        ) : null}

        {dashboardQuery.isSuccess && dashboardQuery.data.tasks.length === 0 ? (
          <section className="surface-card">
            <p className="muted-text">
              No tasks available from the configured server.
            </p>
          </section>
        ) : null}

        {dashboardQuery.isSuccess && dashboardQuery.data.tasks.length > 0 ? (
          <>
            <OverviewSection
              dashboard={dashboardQuery.data}
              onSelectTask={goToTask}
            />
            <DependencyGraphSection
              graphEdges={dashboardQuery.data.graphEdges}
              graphNodes={dashboardQuery.data.graphNodes}
              onSelectTask={goToTask}
            />
            <TaskTableSection
              onSelectTask={goToTask}
              tasks={dashboardQuery.data.tasks}
            />
          </>
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
    <button
      className={`nav-pill ${isActive ? "nav-pill--active" : ""}`}
      disabled={isDisabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
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
                <p className="eyebrow">Mission control for autonomous builds</p>
                <h2 className="hero-title">{headerTitle}</h2>
                <p className="section-copy">
                  Branded command surfaces, shared light and dark tokens, and
                  the existing AIM task workflows on one stable shell.
                </p>
                <div className="nav-group">
                  {renderNavAction(
                    route.kind === "dashboard",
                    false,
                    "Dashboard",
                    goToDashboard,
                  )}
                  {renderNavAction(
                    route.kind === "create",
                    false,
                    "Task Intake",
                    goToCreateTask,
                  )}
                </div>
              </div>

              <div className="hero-actions">
                {route.kind !== "create" ? (
                  <button
                    className="ui-button ui-button--ghost"
                    disabled={dashboardQuery.isFetching}
                    onClick={() => void handleRefresh()}
                    type="button"
                  >
                    <RefreshCw size={16} />
                    Refresh
                  </button>
                ) : null}
                {route.kind === "dashboard" ? (
                  <button
                    className="ui-button ui-button--primary"
                    onClick={goToCreateTask}
                    type="button"
                  >
                    <Plus size={16} />
                    Create Task
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <main>{renderContent()}</main>
      </div>
    </div>
  );
};
