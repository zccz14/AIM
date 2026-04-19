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
  expect(dashboardPageSource).toContain(
    "graphEdges={dashboardQuery.data.graphEdges}",
  );
  expect(dashboardPageSource).toContain(
    "graphNodes={dashboardQuery.data.graphNodes}",
  );
  expect(apiClientSource).toContain("readServerBaseUrl");
  expect(apiClientSource).not.toContain("https://aim.zccz14.com");
  expect(configSource).toContain("http://localhost:8192");
  expect(adapterSource).toContain("toDashboardStatus");
  expect(adapterSource).toContain("created");
  expect(adapterSource).toContain("waiting_assumptions");
  expect(adapterSource).toContain("graphNodes");
  expect(adapterSource).toContain("graphEdges");
});

test("wires the shared AIM icon assets into web and README entry points", async () => {
  const { readFile } = await import("node:fs/promises");
  const appShellSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/components/dashboard-page.tsx`,
    "utf8",
  );
  const htmlSource = await readFile(
    `${process.cwd()}/modules/web/index.html`,
    "utf8",
  );
  const readmeSource = await readFile(`${process.cwd()}/README.md`, "utf8");
  const iconSource = await readFile(
    `${process.cwd()}/docs/brand/aim-icon.svg`,
    "utf8",
  );
  const faviconSource = await readFile(
    `${process.cwd()}/docs/brand/aim-icon-16.svg`,
    "utf8",
  );
  const publicIconSource = await readFile(
    `${process.cwd()}/modules/web/public/aim-icon.svg`,
    "utf8",
  );
  const publicFaviconSource = await readFile(
    `${process.cwd()}/modules/web/public/favicon.svg`,
    "utf8",
  );

  expect(htmlSource).toContain("<title>AIM</title>");
  expect(htmlSource).toContain('rel="icon"');
  expect(htmlSource).toContain('href="/favicon.svg"');

  expect(appShellSource).toContain('alt="AIM icon"');
  expect(appShellSource).toContain('src="/aim-icon.svg"');
  expect(appShellSource).toContain("AIM");

  expect(readmeSource).toContain("docs/brand/aim-icon.svg");
  expect(readmeSource).toContain('alt="AIM icon"');

  expect(iconSource).toContain('viewBox="0 0 64 64"');
  expect(iconSource).toContain('<circle cx="32" cy="32" r="30"');
  expect(iconSource).toContain('<circle cx="32" cy="32" r="6"');
  expect(publicIconSource).toBe(iconSource);

  expect(faviconSource).toContain('viewBox="0 0 16 16"');
  expect(faviconSource).toContain('<circle cx="8" cy="8" r="7"');
  expect(faviconSource).toContain('<circle cx="8" cy="8" r="2"');
  expect(faviconSource).not.toContain('stroke-width="1"');
  expect(publicFaviconSource).toBe(faviconSource);
});

test("keeps task creation inside the dashboard shell", async () => {
  const { readFile } = await import("node:fs/promises");
  const dashboardPageSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/components/dashboard-page.tsx`,
    "utf8",
  );
  const createDrawerSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/components/create-task-drawer.tsx`,
    "utf8",
  );

  expect(dashboardPageSource).toContain("Create Task");
  expect(dashboardPageSource).toContain("<CreateTaskDrawer");
  expect(dashboardPageSource).not.toContain("react-router");
  expect(createDrawerSource).toContain('label="Task Spec"');
  expect(createDrawerSource).not.toContain('label="Title"');
});

test("routes task creation through feature-local api and mutation helpers", async () => {
  const { readFile } = await import("node:fs/promises");
  const dashboardPageSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/components/dashboard-page.tsx`,
    "utf8",
  );
  const apiSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/api/task-dashboard-api.ts`,
    "utf8",
  );
  const apiClientSource = await readFile(
    `${process.cwd()}/modules/web/src/lib/api-client.ts`,
    "utf8",
  );
  const mutationSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/use-task-create-mutation.ts`,
    "utf8",
  );

  expect(dashboardPageSource).toContain("useTaskCreateMutation");
  expect(dashboardPageSource).not.toContain('fetch("/tasks"');
  expect(apiSource).toContain("createTaskFromDashboard");
  expect(apiSource).not.toContain("createContractClient");
  expect(apiSource).not.toContain("readServerBaseUrl");
  expect(apiSource).not.toContain("resolveContractUrl");
  expect(apiSource).toContain("client.createTask({ task_spec: taskSpec })");
  expect(apiClientSource).toContain('request.headers.get("content-type")');
  expect(apiClientSource).toContain("request.body");
  expect(apiClientSource).not.toContain(
    "body: request.body === null ? undefined : await request.text()",
  );
  expect(mutationSource).toContain("useMutation");
});
