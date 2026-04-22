import {
  Alert,
  AppShell,
  Button,
  Center,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
    projectPath: string;
    taskSpec: string;
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
        : (selectedTask?.title ?? "Task Details");

  const renderContent = () => {
    if (route.kind === "create") {
      return (
        <Stack gap="md">
          <Text c="dimmed" maw={720}>
            Create a new AIM task without leaving the main desktop workspace.
          </Text>
          <CreateTaskForm
            errorMessage={
              createTaskMutation.isError
                ? getTaskCreateErrorMessage(createTaskMutation.error)
                : null
            }
            isSubmitting={createTaskMutation.isPending}
            onCancel={goToDashboard}
            onSubmit={handleCreateTask}
          />
        </Stack>
      );
    }

    if (route.kind === "task") {
      return <TaskDetailsPage task={selectedTask} />;
    }

    return (
      <Stack gap="lg">
        <ServerBaseUrlForm onSave={handleRefresh} />

        {dashboardQuery.isPending ? (
          <Center mih={240}>
            <Loader aria-label="Loading task dashboard" />
          </Center>
        ) : null}

        {dashboardQuery.isError ? (
          <Alert
            color="red"
            icon={<AlertCircle size={16} />}
            title="Dashboard Error"
          >
            <Stack gap="sm">
              <Text>{getTaskDashboardErrorMessage(dashboardQuery.error)}</Text>
              <Button
                disabled={dashboardQuery.isFetching}
                loading={dashboardQuery.isFetching}
                onClick={() => void handleRefresh()}
                variant="light"
              >
                Retry
              </Button>
            </Stack>
          </Alert>
        ) : null}

        {dashboardQuery.isSuccess && dashboardQuery.data.tasks.length === 0 ? (
          <Text>No tasks available from the configured server.</Text>
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
      </Stack>
    );
  };

  return (
    <AppShell header={{ height: 76 }} padding="lg">
      <AppShell.Header px="lg" py="md">
        <Group h="100%" justify="space-between">
          <Group align="center" gap="sm">
            <img alt="AIM icon" height={28} src="/aim-icon.svg" width={28} />
            <div>
              <Text fw={700} size="sm">
                AIM
              </Text>
              <Title order={1}>{headerTitle}</Title>
            </div>
          </Group>
          <Group gap="sm">
            {route.kind === "dashboard" ? (
              <>
                <Button
                  disabled={dashboardQuery.isFetching}
                  loading={dashboardQuery.isFetching}
                  onClick={() => void handleRefresh()}
                  variant="default"
                >
                  Refresh
                </Button>
                <Button onClick={goToCreateTask}>Create Task</Button>
              </>
            ) : null}
            {route.kind === "create" ? (
              <Button
                disabled={createTaskMutation.isPending}
                onClick={goToDashboard}
                variant="default"
              >
                Back to Dashboard
              </Button>
            ) : null}
            {route.kind === "task" ? (
              <>
                <Button
                  disabled={dashboardQuery.isFetching}
                  loading={dashboardQuery.isFetching}
                  onClick={() => void handleRefresh()}
                  variant="default"
                >
                  Refresh
                </Button>
                <Button onClick={goToDashboard} variant="default">
                  Back to Dashboard
                </Button>
              </>
            ) : null}
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Stack gap="lg">{renderContent()}</Stack>
      </AppShell.Main>
    </AppShell>
  );
};
