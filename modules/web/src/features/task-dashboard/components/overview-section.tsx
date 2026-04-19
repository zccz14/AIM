import { Card, Group, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TaskDashboardViewModel } from "../model/task-dashboard-view-model.js";
import { TaskStatusBadge } from "./task-status-badge.js";

export const OverviewSection = ({
  dashboard,
}: {
  dashboard: TaskDashboardViewModel;
}) => (
  <Stack gap="lg">
    <SimpleGrid cols={{ base: 1, md: 4 }}>
      {dashboard.summaryCards.map((card) => (
        <Card key={card.key} withBorder>
          <Text c="dimmed" size="sm">
            {card.label}
          </Text>
          <Title order={2}>{card.value}</Title>
        </Card>
      ))}
    </SimpleGrid>

    <Card withBorder>
      <Title mb="md" order={3}>
        Status Board
      </Title>
      <ResponsiveContainer height={240} width="100%">
        <BarChart data={dashboard.statusBoardItems}>
          <XAxis dataKey="label" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="value" fill="#228be6" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>

    <Card withBorder>
      <Title mb="md" order={3}>
        Recent Activity
      </Title>
      <ResponsiveContainer height={240} width="100%">
        <AreaChart data={dashboard.activitySeries}>
          <XAxis dataKey="label" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Area dataKey="value" fill="#dbe4ff" stroke="#5c7cfa" />
        </AreaChart>
      </ResponsiveContainer>
    </Card>

    <Card withBorder>
      <Title mb="md" order={3}>
        Recent Active Tasks
      </Title>
      <Stack gap="sm">
        {dashboard.recentTasks.map((task) => (
          <Group justify="space-between" key={task.id}>
            <Stack gap={0}>
              <Text fw={600}>{task.title}</Text>
              <Text c="dimmed" size="sm">
                {task.id}
              </Text>
            </Stack>
            <TaskStatusBadge status={task.dashboardStatus} />
          </Group>
        ))}
      </Stack>
    </Card>
  </Stack>
);
