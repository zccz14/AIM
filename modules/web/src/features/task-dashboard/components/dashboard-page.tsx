import {
  Alert,
  AppShell,
  Button,
  Center,
  Loader,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { AlertCircle } from "lucide-react";

import { getTaskDashboardErrorMessage } from "../queries.js";
import { useTaskDashboardQuery } from "../use-task-dashboard-query.js";
import { OverviewSection } from "./overview-section.js";
import { ServerBaseUrlForm } from "./server-base-url-form.js";

export const DashboardPage = () => {
  const dashboardQuery = useTaskDashboardQuery();

  return (
    <AppShell padding="lg">
      <AppShell.Main>
        <Stack gap="lg">
          <Title order={1}>Task Dashboard</Title>
          <ServerBaseUrlForm />

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
            <OverviewSection dashboard={dashboardQuery.data} />
          ) : null}
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
};
