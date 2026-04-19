import { Anchor, Drawer, Stack, Text, Title } from "@mantine/core";

import type { DashboardTask } from "../model/task-dashboard-view-model.js";
import { TaskStatusBadge } from "./task-status-badge.js";

export const TaskDetailsDrawer = ({
  onClose,
  opened,
  task,
}: {
  onClose: () => void;
  opened: boolean;
  task: DashboardTask | null;
}) => (
  <Drawer
    closeButtonProps={{ "aria-label": "Close" }}
    onClose={onClose}
    opened={opened}
    position="right"
    size="md"
    title="Task Details"
  >
    {task ? (
      <Stack gap="sm">
        <Title order={3}>{task.title}</Title>
        <Text style={{ whiteSpace: "pre-wrap" }}>
          Task Spec: {task.taskSpec}
        </Text>
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
    ) : null}
  </Drawer>
);
