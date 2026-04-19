import { expect, test } from "@playwright/test";

test("boots the dashboard app with Mantine and query providers", async () => {
  const { readFile } = await import("node:fs/promises");
  const mainSource = await readFile(
    `${process.cwd()}/modules/web/src/main.tsx`,
    "utf8",
  );
  const appSource = await readFile(
    `${process.cwd()}/modules/web/src/app.tsx`,
    "utf8",
  );

  expect(mainSource).toContain("@mantine/core/styles.css");
  expect(mainSource).toContain("<MantineProvider>");
  expect(mainSource).toContain("<QueryClientProvider client={webQueryClient}>");
  expect(appSource).toContain(
    "./features/task-dashboard/components/dashboard-page.js",
  );
  expect(appSource).not.toContain("CZ-Stack Web");
});

test("keeps task dashboard data behind adapter and local config boundaries", async () => {
  const { readFile } = await import("node:fs/promises");
  const appSource = await readFile(
    `${process.cwd()}/modules/web/src/app.tsx`,
    "utf8",
  );
  const dashboardPageSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/components/dashboard-page.tsx`,
    "utf8",
  );
  const apiClientSource = await readFile(
    `${process.cwd()}/modules/web/src/lib/api-client.ts`,
    "utf8",
  );
  const configSource = await readFile(
    `${process.cwd()}/modules/web/src/lib/server-base-url.ts`,
    "utf8",
  );
  const adapterSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/model/task-dashboard-adapter.ts`,
    "utf8",
  );

  expect(appSource).not.toContain("task_spec");
  expect(appSource).not.toContain("waiting_assumptions");
  expect(dashboardPageSource).toContain("DependencyGraphSection");
  expect(dashboardPageSource).not.toContain("health");
  expect(apiClientSource).toContain("readServerBaseUrl");
  expect(apiClientSource).not.toContain("https://aim.zccz14.com");
  expect(configSource).toContain("https://aim.zccz14.com");
  expect(adapterSource).toContain("toDashboardStatus");
  expect(adapterSource).toContain("created");
  expect(adapterSource).toContain("waiting_assumptions");
  expect(adapterSource).toContain("graphNodes");
  expect(adapterSource).toContain("graphEdges");
});
