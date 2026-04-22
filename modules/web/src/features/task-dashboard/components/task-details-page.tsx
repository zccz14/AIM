import { Anchor, Card, Group, Stack, Text, Title } from "@mantine/core";

import type { DashboardTask } from "../model/task-dashboard-view-model.js";
import { TaskStatusBadge } from "./task-status-badge.js";

export const TaskDetailsPage = ({ task }: { task: DashboardTask | null }) => {
  if (!task) {
    return (
      <Card maw={880} padding="xl" radius="md" withBorder>
        <Stack gap="sm">
          <Title order={2}>Task not found</Title>
          <Text c="dimmed">
            The requested task is not available from the current dashboard data.
          </Text>
        </Stack>
      </Card>
    );
  }

  return (
    <Card maw={880} padding="xl" radius="md" withBorder>
      <Stack gap="md">
        <Stack gap="xs">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text c="dimmed" size="sm">
                Task Details
              </Text>
              <Title order={2}>{task.title}</Title>
            </div>
            <TaskStatusBadge status={task.dashboardStatus} />
          </Group>
          <Text style={{ whiteSpace: "pre-wrap" }}>
            Task Spec: {task.taskSpec}
          </Text>
        </Stack>
        <Text>Project Path: {task.projectPath}</Text>
        <Text>Task ID: {task.id}</Text>
        <Text>Contract Status: {task.contractStatus}</Text>
        <Text>
          Dashboard Status: <TaskStatusBadge status={task.dashboardStatus} />
        </Text>
        <Text>Session ID: {task.sessionId ?? "None"}</Text>
        <Text>Worktree: {task.worktreePath ?? "None"}</Text>
        <Text>
          Dependencies:{" "}
          {task.dependencies.length > 0 ? task.dependencies.join(", ") : "None"}
        </Text>
        <Text>Created At: {task.createdAt}</Text>
        <Text>Updated At: {task.updatedAt}</Text>
        {task.pullRequestUrl ? (
          <Anchor href={task.pullRequestUrl} rel="noreferrer" target="_blank">
            Open PR
          </Anchor>
        ) : null}
      </Stack>
    </Card>
  );
};
