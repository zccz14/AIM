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
import { AlertCircle } from "lucide-react";
import { useState } from "react";

import { getTaskDashboardErrorMessage } from "../queries.js";
import { useTaskDashboardQuery } from "../use-task-dashboard-query.js";
import { DependencyGraphSection } from "./dependency-graph-section.js";
import { OverviewSection } from "./overview-section.js";
import { CreateTaskDrawer } from "./create-task-drawer.js";
import { ServerBaseUrlForm } from "./server-base-url-form.js";
import { TaskDetailsDrawer } from "./task-details-drawer.js";
import { TaskTableSection } from "./task-table-section.js";

export const DashboardPage = () => {
  const dashboardQuery = useTaskDashboardQuery();
  const [createDrawerOpened, setCreateDrawerOpened] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTask =
    dashboardQuery.data?.tasks.find((task) => task.id === selectedTaskId) ??
    null;

  return (
    <AppShell padding="lg">
      <AppShell.Main>
        <Stack gap="lg">
          <Group justify="space-between">
            <Group align="center" gap="sm">
              <img alt="AIM icon" height={28} src="/aim-icon.svg" width={28} />
              <div>
                <Text fw={700} size="sm">
                  AIM
                </Text>
                <Title order={1}>Task Dashboard</Title>
              </div>
            </Group>
            <Button
              disabled={createDrawerOpened}
              onClick={() => setCreateDrawerOpened(true)}
            >
              Create Task
            </Button>
          </Group>
          <ServerBaseUrlForm onSave={() => dashboardQuery.refetch()} />

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
                <Text>
                  {getTaskDashboardErrorMessage(dashboardQuery.error)}
                </Text>
                <Button
                  onClick={() => void dashboardQuery.refetch()}
                  variant="light"
                >
                  Retry
                </Button>
              </Stack>
            </Alert>
          ) : null}

          {dashboardQuery.isSuccess &&
          dashboardQuery.data.tasks.length === 0 ? (
            <Text>No tasks available from the configured server.</Text>
          ) : null}

          {dashboardQuery.isSuccess && dashboardQuery.data.tasks.length > 0 ? (
            <>
              <OverviewSection
                dashboard={dashboardQuery.data}
                onSelectTask={setSelectedTaskId}
              />
              <DependencyGraphSection
                graphEdges={dashboardQuery.data.graphEdges}
                graphNodes={dashboardQuery.data.graphNodes}
                onSelectTask={setSelectedTaskId}
              />
              <TaskTableSection
                onSelectTask={setSelectedTaskId}
                tasks={dashboardQuery.data.tasks}
              />
            </>
          ) : null}

          <CreateTaskDrawer
            onClose={() => setCreateDrawerOpened(false)}
            onSubmit={async () => undefined}
            opened={createDrawerOpened}
          />
          <TaskDetailsDrawer
            onClose={() => setSelectedTaskId(null)}
            opened={selectedTask !== null}
            task={selectedTask}
          />
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
};
