import { expect, test } from "@playwright/test";

test("fixes the Shadcn UI registry contract for the web workspace", async () => {
  const { readFile } = await import("node:fs/promises");
  const componentsConfig = JSON.parse(
    await readFile(`${process.cwd()}/modules/web/components.json`, "utf8"),
  ) as {
    aliases?: Record<string, string>;
    iconLibrary?: string;
    rsc?: boolean;
    style?: string;
    tailwind?: { css?: string; cssVariables?: boolean };
    tsx?: boolean;
  };
  const packageSource = await readFile(
    `${process.cwd()}/modules/web/package.json`,
    "utf8",
  );

  expect(componentsConfig).toMatchObject({
    aliases: {
      components: "src/components",
      hooks: "src/hooks",
      lib: "src/lib",
      ui: "src/components/ui",
      utils: "src/lib/utils",
    },
    iconLibrary: "lucide",
    rsc: false,
    style: "radix-lyra",
    tailwind: {
      css: "src/styles.css",
      cssVariables: true,
    },
    tsx: true,
  });
  expect(packageSource).toContain('"@radix-ui/react-slot"');
  expect(packageSource).toContain('"class-variance-authority"');
  expect(packageSource).toContain('"lucide-react"');
  expect(packageSource).not.toContain('"@lyra');
});

test("publishes Lyra preset tokens through CSS variables instead of an imagined package", async () => {
  const { readFile } = await import("node:fs/promises");
  const lyraPresetSource = await readFile(
    `${process.cwd()}/modules/web/src/components/ui/lyra-preset.css`,
    "utf8",
  );
  const stylesSource = await readFile(
    `${process.cwd()}/modules/web/src/styles.css`,
    "utf8",
  );

  expect(lyraPresetSource).toContain("--lyra-background");
  expect(lyraPresetSource).toContain("--lyra-primary");
  expect(lyraPresetSource).toContain("--lyra-ring");
  expect(lyraPresetSource).toContain("--radius");
  expect(lyraPresetSource).toContain('html[data-theme="dark"]');
  expect(lyraPresetSource).toContain('html[data-theme="light"]');
  expect(stylesSource).toContain('@import "./components/ui/lyra-preset.css"');
  expect(stylesSource).toContain("--background: var(--lyra-background)");
  expect(stylesSource).toContain("--primary: var(--lyra-primary)");
});

test("keeps dashboard pages on shared Shadcn-style UI primitives", async () => {
  const { readFile } = await import("node:fs/promises");
  const primitiveFiles = [
    "badge.tsx",
    "button.tsx",
    "card.tsx",
    "input.tsx",
    "label.tsx",
    "lyra-surface.tsx",
    "select.tsx",
    "textarea.tsx",
    "theme-provider.tsx",
    "theme-toggle.tsx",
  ];

  for (const fileName of primitiveFiles) {
    await expect(
      readFile(
        `${process.cwd()}/modules/web/src/components/ui/${fileName}`,
        "utf8",
      ),
    ).resolves.toBeTruthy();
  }

  const pageSources = await Promise.all(
    [
      "dashboard-page.tsx",
      "overview-section.tsx",
      "task-table-section.tsx",
      "server-base-url-form.tsx",
      "create-task-form.tsx",
      "task-details-page.tsx",
      "task-status-badge.tsx",
    ].map((fileName) =>
      readFile(
        `${process.cwd()}/modules/web/src/features/task-dashboard/components/${fileName}`,
        "utf8",
      ),
    ),
  );
  const combinedPageSource = pageSources.join("\n");

  expect(combinedPageSource).toContain("components/ui/card.js");
  expect(combinedPageSource).toContain("components/ui/input.js");
  expect(combinedPageSource).toContain("components/ui/lyra-surface.js");
  expect(combinedPageSource).toContain("components/ui/select.js");
  expect(combinedPageSource).toContain("components/ui/textarea.js");
  expect(combinedPageSource).not.toContain('className="field-input"');
  expect(combinedPageSource).not.toContain('className="surface-card');
  expect(combinedPageSource).not.toContain('className="aim-field"');
});

test("boots the dashboard app with branded theme providers instead of Mantine", async () => {
  const { readFile } = await import("node:fs/promises");
  const mainSource = await readFile(
    `${process.cwd()}/modules/web/src/main.tsx`,
    "utf8",
  );
  const appSource = await readFile(
    `${process.cwd()}/modules/web/src/app.tsx`,
    "utf8",
  );
  const packageSource = await readFile(
    `${process.cwd()}/modules/web/package.json`,
    "utf8",
  );

  expect(mainSource).toContain('import "./styles.css"');
  expect(mainSource).toContain("<ThemeProvider>");
  expect(mainSource).toContain("<QueryClientProvider client={webQueryClient}>");
  expect(mainSource).not.toContain("@mantine/core");
  expect(appSource).toContain(
    "./features/task-dashboard/components/dashboard-page.js",
  );
  expect(packageSource).not.toContain("@mantine/core");
  expect(packageSource).not.toContain("@mantine/hooks");
  expect(packageSource).toContain('"react": "^19.2.0"');
});

test("keeps task details and create flow free of direct Mantine component imports", async () => {
  const { readFile } = await import("node:fs/promises");
  const taskDetailsSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/components/task-details-page.tsx`,
    "utf8",
  );
  const createTaskFormSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/components/create-task-form.tsx`,
    "utf8",
  );
  const taskStatusBadgeSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/components/task-status-badge.tsx`,
    "utf8",
  );

  expect(taskDetailsSource).not.toContain("@mantine/core");
  expect(createTaskFormSource).not.toContain("@mantine/core");
  expect(taskStatusBadgeSource).not.toContain("@mantine/core");
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
  expect(dashboardPageSource).not.toContain("DependencyGraphSection");
  expect(dashboardPageSource).not.toContain("graphEdges");
  expect(dashboardPageSource).not.toContain("graphNodes");
  expect(apiClientSource).toContain("readServerBaseUrl");
  expect(apiClientSource).not.toContain("https://aim.zccz14.com");
  expect(configSource).toContain("http://localhost:8192");
  expect(adapterSource).toContain("toDashboardStatus");
  expect(adapterSource).toContain("processing");
  expect(adapterSource).not.toContain("waiting_assumptions");
  expect(adapterSource).not.toContain("graphNodes");
  expect(adapterSource).not.toContain("graphEdges");
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
  const createTaskFormSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/components/create-task-form.tsx`,
    "utf8",
  );

  expect(dashboardPageSource).toContain("Create Task");
  expect(dashboardPageSource).toContain("<CreateTaskForm");
  expect(dashboardPageSource).toContain('kind: "create"');
  expect(dashboardPageSource).not.toContain("react-router");
  expect(createTaskFormSource).toContain('htmlFor="create-task-spec"');
  expect(createTaskFormSource).toContain("<span>Task Spec</span>");
  expect(createTaskFormSource).toContain('htmlFor="create-task-project-path"');
  expect(createTaskFormSource).toContain("<span>Project Path</span>");
  expect(createTaskFormSource).not.toContain('label="Title"');
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
  expect(apiSource).toContain("project_path: input.projectPath");
  expect(mutationSource).toContain("taskSpec: string");
  expect(mutationSource).toContain("projectPath: string");
  expect(apiClientSource).toContain('request.headers.get("content-type")');
  expect(apiClientSource).toContain("request.body");
  expect(apiClientSource).not.toContain(
    "body: request.body === null ? undefined : await request.text()",
  );
  expect(mutationSource).toContain("useMutation");
});

test("keeps dashboard refresh actions behind a shared handler", async () => {
  const { readFile } = await import("node:fs/promises");
  const dashboardPageSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/components/dashboard-page.tsx`,
    "utf8",
  );

  expect(dashboardPageSource).toContain("const handleRefresh = async () =>");
  expect(dashboardPageSource).toContain("disabled={dashboardQuery.isFetching}");
  expect(dashboardPageSource).toContain("Refresh");
  expect(dashboardPageSource).toContain("onClick={() => void handleRefresh()}");
  expect(dashboardPageSource).toContain(
    "<ServerBaseUrlForm onSave={handleRefresh} />",
  );
  expect(dashboardPageSource).toContain("Retry");
  expect(dashboardPageSource).not.toContain(
    "onClick={() => void dashboardQuery.refetch()}",
  );
});

test("shares branded dashboard shell tokens across overview and table", async () => {
  const { readFile } = await import("node:fs/promises");
  const mainSource = await readFile(
    `${process.cwd()}/modules/web/src/main.tsx`,
    "utf8",
  );
  const stylesSource = await readFile(
    `${process.cwd()}/modules/web/src/styles.css`,
    "utf8",
  );
  const dashboardPageSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/components/dashboard-page.tsx`,
    "utf8",
  );
  const overviewSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/components/overview-section.tsx`,
    "utf8",
  );
  const tableSource = await readFile(
    `${process.cwd()}/modules/web/src/features/task-dashboard/components/task-table-section.tsx`,
    "utf8",
  );

  expect(mainSource).toContain("<ThemeProvider>");
  expect(stylesSource).toContain('html[data-theme="dark"]');
  expect(stylesSource).toContain('html[data-theme="light"]');
  expect(stylesSource).toContain("--status-ready");
  expect(stylesSource).not.toContain(".graph-node");
  expect(stylesSource).toContain(".task-table thead th");
  expect(dashboardPageSource).toContain("ThemeToggle");
  expect(dashboardPageSource).toContain('data-testid="dashboard-shell"');
  expect(overviewSource).toContain("Recent Active Tasks");
  expect(tableSource).toContain('data-testid="dashboard-table-header"');
});
