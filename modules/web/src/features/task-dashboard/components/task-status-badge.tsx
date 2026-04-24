import { Badge, useComputedColorScheme, useMantineTheme } from "@mantine/core";

import type { DashboardStatus } from "../model/task-dashboard-view-model.js";
import { getDashboardThemeTokens } from "./dashboard-theme.js";

const statusLabelMap: Record<DashboardStatus, string> = {
  ready: "Ready",
  running: "Running",
  blocked: "Blocked",
  done: "Done",
  failed: "Failed",
};

export const TaskStatusBadge = ({ status }: { status: DashboardStatus }) => {
  const theme = useMantineTheme();
  const colorScheme = useComputedColorScheme("light");
  const tokens = getDashboardThemeTokens(theme, colorScheme);
  const palette = tokens.status[status];

  return (
    <Badge
      radius="sm"
      styles={{
        root: {
          backgroundColor: palette.background,
          border: `1px solid ${palette.border}`,
          color: palette.text,
        },
      }}
      variant="filled"
    >
      {statusLabelMap[status]}
    </Badge>
  );
};
