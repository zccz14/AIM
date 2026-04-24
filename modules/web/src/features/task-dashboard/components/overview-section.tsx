import {
  Box,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
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
import { getDashboardThemeTokens } from "./dashboard-theme.js";
import { TaskStatusBadge } from "./task-status-badge.js";

export const OverviewSection = ({
  dashboard,
  onSelectTask,
}: {
  dashboard: TaskDashboardViewModel;
  onSelectTask: (taskId: string) => void;
}) => {
  const theme = useMantineTheme();
  const colorScheme = useComputedColorScheme("light");
  const tokens = getDashboardThemeTokens(theme, colorScheme);

  return (
    <Stack gap="lg">
      <Card
        padding="xl"
        radius="xl"
        style={{
          background: tokens.heroBackground,
          border: `1px solid ${tokens.heroBorder}`,
        }}
      >
        <Stack gap="xl">
          <Group align="flex-start" justify="space-between">
            <Stack gap="xs" maw={680}>
              <Text c={tokens.mutedText} fw={700} size="sm" tt="uppercase">
                AIM orchestration brief
              </Text>
              <Title order={2}>Decision cockpit</Title>
              <Text c={tokens.mutedText} size="sm">
                Scan execution load, blockers, and ready work before diving into
                the dependency chain.
              </Text>
            </Stack>
            <Box ta="right">
              <Text c={tokens.mutedText} fw={600} size="sm">
                Active watchlist
              </Text>
              <Title order={2}>{dashboard.recentTasks.length}</Title>
            </Box>
          </Group>

          <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }}>
            {dashboard.summaryCards.map((card) => (
              <Card
                key={card.key}
                padding="lg"
                radius="lg"
                style={{
                  backgroundColor: tokens.panelBackground,
                  border: `1px solid ${tokens.panelBorder}`,
                }}
              >
                <Text c={tokens.mutedText} fw={600} size="sm">
                  {card.label}
                </Text>
                <Title order={2}>{card.value}</Title>
              </Card>
            ))}
          </SimpleGrid>
        </Stack>
      </Card>

      <SimpleGrid cols={{ base: 1, xl: 2 }}>
        <Card
          padding="lg"
          radius="xl"
          style={{
            backgroundColor: tokens.panelBackground,
            border: `1px solid ${tokens.panelBorder}`,
          }}
        >
          <Text c={tokens.mutedText} fw={700} size="xs" tt="uppercase">
            Status Board
          </Text>
          <Title mb="md" order={3}>
            Execution radar
          </Title>
          <ResponsiveContainer height={240} width="100%">
            <BarChart data={dashboard.statusBoardItems}>
              <XAxis dataKey="label" stroke={tokens.chartText} />
              <YAxis allowDecimals={false} stroke={tokens.chartText} />
              <Tooltip />
              <Bar
                dataKey="value"
                fill={tokens.status.ready.border}
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card
          padding="lg"
          radius="xl"
          style={{
            backgroundColor: tokens.panelBackground,
            border: `1px solid ${tokens.panelBorder}`,
          }}
        >
          <Text c={tokens.mutedText} fw={700} size="xs" tt="uppercase">
            Trend line
          </Text>
          <Title mb="md" order={3}>
            Recent Activity
          </Title>
          <ResponsiveContainer height={240} width="100%">
            <AreaChart data={dashboard.activitySeries}>
              <XAxis dataKey="label" stroke={tokens.chartText} />
              <YAxis allowDecimals={false} stroke={tokens.chartText} />
              <Tooltip />
              <Area
                dataKey="value"
                fill={tokens.chartArea}
                stroke={tokens.status.running.border}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </SimpleGrid>

      <Card
        padding="lg"
        radius="xl"
        style={{
          backgroundColor: tokens.panelBackground,
          border: `1px solid ${tokens.panelBorder}`,
        }}
      >
        <Text c={tokens.mutedText} fw={700} size="xs" tt="uppercase">
          Recent Active Tasks
        </Text>
        <Title mb="md" order={3}>
          Priority watchlist
        </Title>
        <Stack gap="sm">
          {dashboard.recentTasks.map((task) => (
            <Group justify="space-between" key={task.id}>
              <Stack gap={0}>
                <Button
                  justify="flex-start"
                  onClick={() => onSelectTask(task.id)}
                  p={0}
                  styles={{
                    inner: { justifyContent: "flex-start" },
                    label: { color: "inherit" },
                    root: { color: "inherit" },
                  }}
                  variant="subtle"
                >
                  {task.title}
                </Button>
                <Text c={tokens.mutedText} size="sm">
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
};
