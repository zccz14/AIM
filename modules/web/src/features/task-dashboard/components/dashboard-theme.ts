import {
  alpha,
  type MantineColorScheme,
  type MantineTheme,
} from "@mantine/core";

import type { DashboardStatus } from "../model/task-dashboard-view-model.js";

type DashboardStatusPalette = {
  background: string;
  border: string;
  text: string;
};

export type DashboardThemeTokens = {
  chartArea: string;
  chartGrid: string;
  chartText: string;
  graphCanvas: string;
  graphEdge: string;
  heroBackground: string;
  heroBorder: string;
  mutedText: string;
  panelBackground: string;
  panelBorder: string;
  shellBackground: string;
  status: Record<DashboardStatus, DashboardStatusPalette>;
  tableHeaderBackground: string;
  tableRowHover: string;
};

const darkStatusPalette: Record<DashboardStatus, DashboardStatusPalette> = {
  blocked: {
    background: alpha("#f59f00", 0.18),
    border: "#f59f00",
    text: "#ffd8a8",
  },
  done: {
    background: alpha("#40c057", 0.18),
    border: "#40c057",
    text: "#b2f2bb",
  },
  failed: {
    background: alpha("#fa5252", 0.2),
    border: "#fa5252",
    text: "#ffc9c9",
  },
  ready: {
    background: alpha("#4dabf7", 0.18),
    border: "#4dabf7",
    text: "#d0ebff",
  },
  running: {
    background: alpha("#9775fa", 0.2),
    border: "#9775fa",
    text: "#e5dbff",
  },
};

const lightStatusPalette: Record<DashboardStatus, DashboardStatusPalette> = {
  blocked: {
    background: "#fff4e6",
    border: "#f08c00",
    text: "#9c4c00",
  },
  done: {
    background: "#ebfbee",
    border: "#2f9e44",
    text: "#1b5e20",
  },
  failed: {
    background: "#fff5f5",
    border: "#e03131",
    text: "#8f1d1d",
  },
  ready: {
    background: "#edf6ff",
    border: "#1c7ed6",
    text: "#0b5394",
  },
  running: {
    background: "#f3f0ff",
    border: "#7048e8",
    text: "#4527a0",
  },
};

export const getDashboardThemeTokens = (
  _theme: MantineTheme,
  colorScheme: MantineColorScheme,
): DashboardThemeTokens => {
  const isDark = colorScheme === "dark";

  return {
    chartArea: isDark ? alpha("#7c8dff", 0.28) : alpha("#4c6ef5", 0.18),
    chartGrid: isDark ? alpha("#91a7ff", 0.2) : "#dbe4ff",
    chartText: isDark ? "#dbe4ff" : "#33436f",
    graphCanvas: isDark ? alpha("#91a7ff", 0.05) : "#f3f6ff",
    graphEdge: isDark ? "#91a7ff" : "#5c6ac4",
    heroBackground: isDark
      ? "linear-gradient(135deg, #182447 0%, #0f172d 100%)"
      : "linear-gradient(135deg, #eef3ff 0%, #ffffff 100%)",
    heroBorder: isDark ? alpha("#91a7ff", 0.24) : "#d0dbff",
    mutedText: isDark ? "#94a3c4" : "#667085",
    panelBackground: isDark ? "#12182b" : "#ffffff",
    panelBorder: isDark ? alpha("#91a7ff", 0.18) : "#d9e2ff",
    shellBackground: isDark ? "#0a0f1e" : "#f4f7fb",
    status: isDark ? darkStatusPalette : lightStatusPalette,
    tableHeaderBackground: isDark ? "#12182b" : "#edf2ff",
    tableRowHover: isDark ? alpha("#91a7ff", 0.08) : "#f5f8ff",
  };
};
