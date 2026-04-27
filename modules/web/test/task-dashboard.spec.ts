import { expect, test } from "@playwright/test";

const buildTask = ({
  dependencies = [],
  done = false,
  gitOriginUrl = "https://github.com/example/main.git",
  projectId = "00000000-0000-4000-8000-000000000010",
  result = "",
  spec,
  status = "processing",
  taskId,
  updatedAt = "2026-04-19T00:00:00.000Z",
}: {
  dependencies?: string[];
  done?: boolean;
  gitOriginUrl?: string;
  projectId?: string;
  result?: string;
  spec: string;
  status?: string;
  taskId: string;
  updatedAt?: string;
}) => ({
  task_id: taskId,
  title: spec.split("\n", 1)[0] ?? spec,
  task_spec: spec,
  project_id: projectId,
  git_origin_url: gitOriginUrl,
  developer_provider_id: "anthropic",
  developer_model_id: "claude-sonnet-4-5",
  session_id: null,
  worktree_path: null,
  pull_request_url: null,
  dependencies,
  result,
  source_metadata: {},
  done,
  status,
  created_at: "2026-04-19T00:00:00.000Z",
  updated_at: updatedAt,
});

const buildOptimizerStatus = (running: boolean) => ({
  enabled_triggers: ["task_resolved"],
  lanes: {
    coordinator_task_pool: { last_error: null, last_scan_at: null, running },
    developer_follow_up: { last_error: null, last_scan_at: null, running },
    manager_evaluation: { last_error: null, last_scan_at: null, running },
  },
  last_event: null,
  last_scan_at: null,
  running,
});

const buildDimension = ({
  dimensionId = "dimension-readme-fit",
  evaluationMethod = "Compare visible dashboard evidence against README goal convergence.",
  goal = "Dashboard keeps AIM Director focused on baseline convergence.",
  name = "README Fit",
  projectId = "00000000-0000-4000-8000-000000000010",
}: {
  dimensionId?: string;
  evaluationMethod?: string;
  goal?: string;
  name?: string;
  projectId?: string;
} = {}) => ({
  id: dimensionId,
  project_id: projectId,
  name,
  goal,
  evaluation_method: evaluationMethod,
  created_at: "2026-04-20T09:00:00.000Z",
  updated_at: "2026-04-20T09:05:00.000Z",
});

const buildDimensionEvaluation = ({
  createdAt = "2026-04-20T09:10:00.000Z",
  dimensionId = "dimension-readme-fit",
  evaluation = "Strong convergence evidence, missing one explicit intervention path.",
  evaluationId = "evaluation-readme-fit-1",
  score = 82,
}: {
  createdAt?: string;
  dimensionId?: string;
  evaluation?: string;
  evaluationId?: string;
  score?: number;
} = {}) => ({
  id: evaluationId,
  dimension_id: dimensionId,
  project_id: "00000000-0000-4000-8000-000000000010",
  commit_sha: "abc1234",
  evaluator_model: "gpt-5.5",
  score,
  evaluation,
  created_at: createdAt,
});

const buildProject = ({
  gitOriginUrl = "https://github.com/example/main.git",
  globalModelId = "claude-sonnet-4-5",
  globalProviderId = "anthropic",
  name = "Main project",
  projectId = "00000000-0000-4000-8000-000000000010",
}: {
  gitOriginUrl?: string;
  globalModelId?: string;
  globalProviderId?: string;
  name?: string;
  projectId?: string;
} = {}) => ({
  id: projectId,
  name,
  git_origin_url: gitOriginUrl,
  global_provider_id: globalProviderId,
  global_model_id: globalModelId,
  created_at: "2026-04-26T00:00:00.000Z",
  updated_at: "2026-04-26T00:00:00.000Z",
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("aim.serverBaseUrl", "/api");
    window.localStorage.setItem("aim.web.locale", "en");
  });

  await page.route("**/tasks**", async (route) => {
    const doneFilter = new URL(route.request().url()).searchParams.get("done");

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items:
          doneFilter === "true"
            ? [
                buildTask({
                  done: true,
                  result: "Merged and verified.",
                  spec: "Completed project task",
                  status: "resolved",
                  taskId: "task-resolved",
                }),
              ]
            : [
                buildTask({
                  dependencies: ["task-resolved"],
                  spec: "Active main task",
                  taskId: "task-main",
                }),
                buildTask({
                  gitOriginUrl: "https://github.com/example/research.git",
                  projectId: "00000000-0000-4000-8000-000000000011",
                  spec: "Research project task",
                  taskId: "task-research",
                }),
              ],
      }),
    });
  });

  await page.route("**/projects**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          buildProject(),
          buildProject({
            globalModelId: "gpt-5.5",
            globalProviderId: "openai",
            gitOriginUrl: "https://github.com/example/research.git",
            name: "Research project",
            projectId: "00000000-0000-4000-8000-000000000011",
          }),
        ],
      }),
    });
  });

  await page.route("**/dimensions**", async (route) => {
    const projectId = new URL(route.request().url()).searchParams.get(
      "project_id",
    );
    const dimensions = [
      buildDimension(),
      buildDimension({
        dimensionId: "dimension-research-fit",
        name: "Research Fit",
        projectId: "00000000-0000-4000-8000-000000000011",
      }),
    ].filter(
      (dimension) => projectId === null || dimension.project_id === projectId,
    );

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: dimensions }),
    });
  });

  await page.route("**/dimensions/*/evaluations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [buildDimensionEvaluation()] }),
    });
  });

  await page.route("**/task_write_bulks**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.route("**/optimizer/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(buildOptimizerStatus(false)),
    });
  });

  await page.route("**/optimizer/start", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(buildOptimizerStatus(true)),
    });
  });

  await page.route("**/optimizer/stop", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(buildOptimizerStatus(false)),
    });
  });
});

test("renders a simplified top-level dashboard for projects and dimensions", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { exact: true, name: "Dashboard" }),
  ).toBeVisible();
  await expect(
    page.getByText("Multi-project observability and global settings."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Projects" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Dimensions" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Project observability" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "AIM Dimension report" }),
  ).toBeVisible();
  await expect(page.getByText("2 projects")).toBeVisible();
  await expect(page.getByText("2 dimensions")).toBeVisible();

  for (const removedLabel of [
    "Task Write Bulks",
    "History Results",
    "Rejected Feedback Signals",
    "Recent Active Tasks",
    "Evidence Ledger",
    "Decision Observability",
    "Intervention Rail",
  ]) {
    await expect(page.getByText(removedLabel, { exact: true })).toHaveCount(0);
  }
});

test("opens project detail with project-scoped dimensions and task pool stats", async ({
  page,
}) => {
  await page.goto("/#/projects");

  await page.getByRole("link", { name: "Open Main project" }).click();

  await expect(page).toHaveURL(
    /\/#\/projects\/00000000-0000-4000-8000-000000000010$/,
  );
  await expect(
    page.getByRole("heading", { name: "Project Detail" }),
  ).toBeVisible();
  await expect(page.getByText("Main project", { exact: true })).toBeVisible();
  await expect(
    page.getByText("https://github.com/example/main.git"),
  ).toBeVisible();
  await expect(page.getByText("1 active task")).toBeVisible();
  await expect(page.getByText("1 completed task")).toBeVisible();
  await expect(page.getByText("1 dependency-linked task")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Project dimensions" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "README Fit" }).first(),
  ).toBeVisible();
  await expect(page.getByText("Research Fit")).toHaveCount(0);
});

test("keeps project management available on the Projects page", async ({
  page,
}) => {
  let projects = [buildProject()];
  const requests: string[] = [];

  await page.route("**/projects**", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const projectId = decodeURIComponent(
      requestUrl.pathname.split("/").at(-1) ?? "",
    );

    requests.push(request.method());

    if (request.method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ items: projects }),
      });
      return;
    }

    if (request.method() === "POST") {
      const payload = JSON.parse(request.postData() ?? "{}") as {
        git_origin_url: string;
        global_model_id: string;
        global_provider_id: string;
        name: string;
      };
      const createdProject = buildProject({
        gitOriginUrl: payload.git_origin_url,
        globalModelId: payload.global_model_id,
        globalProviderId: payload.global_provider_id,
        name: payload.name,
        projectId: "00000000-0000-4000-8000-000000000012",
      });

      projects = [...projects, createdProject];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(createdProject),
      });
      return;
    }

    if (request.method() === "PATCH") {
      const payload = JSON.parse(request.postData() ?? "{}") as {
        git_origin_url?: string;
        global_model_id?: string;
        global_provider_id?: string;
        name?: string;
      };
      const updatedProject = {
        ...projects.find((project) => project.id === projectId),
        ...payload,
        updated_at: "2026-04-26T00:05:00.000Z",
      };

      projects = projects.map((project) =>
        project.id === projectId ? updatedProject : project,
      );
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(updatedProject),
      });
      return;
    }

    if (request.method() === "DELETE") {
      projects = projects.filter((project) => project.id !== projectId);
      await route.fulfill({ status: 204 });
      return;
    }

    await route.fallback();
  });

  await page.goto("/#/projects");

  await expect(
    page.getByRole("heading", { name: "Project Register" }),
  ).toBeVisible();
  await expect(page.getByRole("row", { name: /Main project/ })).toBeVisible();

  await page.getByLabel("Project Name").fill("Created project");
  await page
    .getByLabel("Git Origin URL")
    .fill("https://github.com/example/created.git");
  await page.getByLabel("Global Provider").fill("anthropic");
  await page.getByLabel("Global Model").fill("claude-sonnet-4-5");
  await page.getByRole("button", { name: "Create Project" }).click();

  await expect(
    page.getByRole("row", { name: /Created project/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit Main project" }).click();
  await page.getByLabel("Project Name").fill("Renamed project");
  await page.getByRole("button", { name: "Save Project" }).click();

  await expect(
    page.getByRole("row", { name: /Renamed project/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete Renamed project" }).click();

  await expect(page.getByRole("row", { name: /Renamed project/ })).toHaveCount(
    0,
  );
  expect(requests).toEqual(
    expect.arrayContaining(["GET", "POST", "PATCH", "DELETE"]),
  );
});

test("opens a dimension detail trend with time, score, evaluation points, and tooltip descriptions", async ({
  page,
}) => {
  const dimension = buildDimension();
  const evaluations = [
    buildDimensionEvaluation({
      createdAt: "2026-04-20T09:10:00.000Z",
      dimensionId: dimension.id,
      evaluation:
        "Initial fit is weak because the dashboard hides Director goals.",
      evaluationId: "evaluation-readme-fit-1",
      score: 48,
    }),
    buildDimensionEvaluation({
      createdAt: "2026-04-20T10:15:00.000Z",
      dimensionId: dimension.id,
      evaluation: "Goal fit improves once dimensions appear before tasks.",
      evaluationId: "evaluation-readme-fit-2",
      score: 74,
    }),
    buildDimensionEvaluation({
      createdAt: "2026-04-20T11:20:00.000Z",
      dimensionId: dimension.id,
      evaluation:
        "Strong convergence evidence, missing one explicit intervention path.",
      evaluationId: "evaluation-readme-fit-3",
      score: 82,
    }),
  ];

  await page.route("**/dimensions**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [dimension] }),
    });
  });

  await page.route("**/dimensions/*/evaluations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: evaluations }),
    });
  });

  await page.goto(`/#/dimensions/${dimension.id}`);

  await expect(page.getByRole("heading", { name: "README Fit" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Dimension Detail" }),
  ).toBeVisible();

  const trend = page.getByRole("figure", { name: "README Fit score trend" });

  await expect(trend).toBeVisible();
  await expect(trend.getByText("Time", { exact: true })).toBeVisible();
  await expect(trend.getByText("Score", { exact: true })).toBeVisible();
  await expect(
    trend.getByText("2026-04-20 09:10", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    trend.getByText("2026-04-20 10:15", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    trend.getByText("2026-04-20 11:20", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    trend.getByRole("application", { name: "README Fit score trend chart" }),
  ).toBeVisible();
  await expect(trend.getByText("Score 82").first()).toBeVisible();

  await trend
    .getByRole("application", { name: "README Fit score trend chart" })
    .focus();
  await expect(
    trend
      .getByText(
        "Strong convergence evidence, missing one explicit intervention path.",
      )
      .first(),
  ).toBeVisible();
});

test("renders the AIM brand mark and global controls", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByAltText("AIM icon")).toBeVisible();
  await expect(
    page.getByRole("heading", { exact: true, name: "AIM" }),
  ).toBeVisible();
  await expect(
    page.locator('head link[rel="icon"][href="/favicon.svg"]'),
  ).toHaveCount(1);

  const globalControls = page.getByRole("group", { name: "Global controls" });

  await expect(
    globalControls.getByRole("button", { name: "Switch to light theme" }),
  ).toBeVisible();
  await expect(
    globalControls.getByRole("button", { exact: true, name: "Refresh" }),
  ).toBeVisible();
  await expect(
    globalControls.getByRole("switch", { name: "AIM Optimizer" }),
  ).toBeVisible();
});

test("toggles the optimizer from the global dashboard controls", async ({
  page,
}) => {
  const optimizerRequests: string[] = [];

  await page.route("**/optimizer/status", async (route) => {
    optimizerRequests.push(route.request().url());
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(buildOptimizerStatus(false)),
    });
  });
  await page.route("**/optimizer/start", async (route) => {
    optimizerRequests.push(route.request().url());
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(buildOptimizerStatus(true)),
    });
  });
  await page.route("**/optimizer/stop", async (route) => {
    optimizerRequests.push(route.request().url());
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(buildOptimizerStatus(false)),
    });
  });

  await page.goto("/");

  const optimizerSwitch = page.getByRole("switch", { name: "AIM Optimizer" });

  await expect(optimizerSwitch).toBeVisible();
  await expect(optimizerSwitch).not.toBeChecked();

  await optimizerSwitch.click();

  await expect(optimizerSwitch).toBeChecked();

  await optimizerSwitch.click();

  await expect(optimizerSwitch).not.toBeChecked();
  expect(
    optimizerRequests.some((url) => url.endsWith("/optimizer/status")),
  ).toBe(true);
  expect(
    optimizerRequests.some((url) => url.endsWith("/optimizer/start")),
  ).toBe(true);
  expect(optimizerRequests.some((url) => url.endsWith("/optimizer/stop"))).toBe(
    true,
  );
});

test("redirects removed task write bulk and direct task creation routes", async ({
  page,
}) => {
  await page.goto("/#/task-write-bulks/bulk-approval-1");

  await expect(page).toHaveURL(/\/#\/$/);
  await expect(page.getByText("Task Write Bulk Details")).toHaveCount(0);

  await page.goto("/#/tasks/new");

  await expect(page).toHaveURL(/\/#\/$/);
  await expect(page.getByLabel("Task Spec")).toHaveCount(0);
});
