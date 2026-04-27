import { expect, test } from "@playwright/test";

const buildTask = ({
  dependencies = [],
  done = false,
  result = "",
  spec,
  status = "processing",
  taskId,
  updatedAt = "2026-04-19T00:00:00.000Z",
}: {
  dependencies?: string[];
  done?: boolean;
  result?: string;
  spec: string;
  status?: string;
  taskId: string;
  updatedAt?: string;
}) => ({
  task_id: taskId,
  title: spec.split("\n", 1)[0] ?? spec,
  task_spec: spec,
  project_id: "project-dashboard",
  project_path: "/repo/dashboard",
  developer_provider_id: "anthropic",
  developer_model_id: "claude-sonnet-4-5",
  session_id: null,
  worktree_path: null,
  pull_request_url: null,
  dependencies,
  result,
  done,
  status,
  created_at: "2026-04-19T00:00:00.000Z",
  updated_at: updatedAt,
});

const buildOptimizerStatus = (running: boolean) => ({
  enabled_triggers: ["task_resolved"],
  lanes: {
    coordinator_task_pool: {
      last_error: null,
      last_scan_at: null,
      running,
    },
    developer_follow_up: {
      last_error: null,
      last_scan_at: null,
      running,
    },
    manager_evaluation: {
      last_error: null,
      last_scan_at: null,
      running,
    },
  },
  last_event: null,
  last_scan_at: null,
  running,
});

const buildTaskWriteBulk = () => ({
  project_path: "/repo/dashboard",
  bulk_id: "bulk-approval-1",
  content_markdown:
    "# Coordinator write intent\n\nPrepare two candidate task changes for Director approval.",
  entries: [
    {
      id: "entry-create-docs",
      action: "Create",
      depends_on: [],
      reason: "Expose missing Director documentation coverage.",
      source: "coordinator-session-1",
      create: {
        candidate_task_spec: "Write Director-facing task write bulk docs.",
        project_path: "/repo/dashboard",
        dependencies: ["task-existing-baseline"],
        verification_route: "pnpm test:web",
      },
      delete: null,
    },
    {
      id: "entry-delete-stale",
      action: "Delete",
      depends_on: ["entry-create-docs"],
      reason: "Remove stale duplicate candidate after replacement exists.",
      source: "coordinator-session-1",
      create: null,
      delete: {
        target_task_id: "task-stale-1",
        delete_reason: "Superseded by the approved write intent.",
        replacement: "entry-create-docs",
      },
    },
  ],
  baseline_ref: "origin/main@abc1234",
  source_metadata: [{ key: "coordinator_session_id", value: "session-bulk-1" }],
  created_at: "2026-04-20T10:00:00.000Z",
  updated_at: "2026-04-20T10:05:00.000Z",
});

const buildDimension = ({
  dimensionId = "dimension-readme-fit",
  evaluationMethod = "Compare visible dashboard evidence against README goal convergence.",
  goal = "Dashboard keeps AIM Director focused on baseline convergence.",
  name = "README Fit",
  projectPath = "/repo/dashboard",
}: {
  dimensionId?: string;
  evaluationMethod?: string;
  goal?: string;
  name?: string;
  projectPath?: string;
} = {}) => ({
  id: dimensionId,
  project_path: projectPath,
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
  project_path: "/repo/dashboard",
  commit_sha: "abc1234",
  evaluator_model: "gpt-5.5",
  score,
  evaluation,
  created_at: createdAt,
});

const buildProject = ({
  globalModelId = "claude-sonnet-4-5",
  globalProviderId = "anthropic",
  name = "Main project",
  projectId = "project-main",
  projectPath = "/repo/main",
}: {
  globalModelId?: string;
  globalProviderId?: string;
  name?: string;
  projectId?: string;
  projectPath?: string;
} = {}) => ({
  id: projectId,
  name,
  project_path: projectPath,
  global_provider_id: globalProviderId,
  global_model_id: globalModelId,
  created_at: "2026-04-26T00:00:00.000Z",
  updated_at: "2026-04-26T00:00:00.000Z",
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("aim.serverBaseUrl", "/api");
  });

  await page.route("**/tasks**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const doneFilter = requestUrl.searchParams.get("done");

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items:
          doneFilter === "true"
            ? []
            : [
                buildTask({
                  spec: "stub task spec",
                  taskId: "task-123",
                }),
                buildTask({
                  dependencies: ["task-123"],
                  spec: "blocked task spec",
                  status: "processing",
                  taskId: "task-456",
                }),
              ],
      }),
    });
  });

  await page.route("**/opencode/models", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            model_id: "claude-sonnet-4-5",
            model_name: "Claude Sonnet 4.5",
            provider_id: "anthropic",
            provider_name: "Anthropic",
          },
          {
            model_id: "gpt-5.5",
            model_name: "GPT 5.5",
            provider_id: "openai",
            provider_name: "OpenAI",
          },
        ],
      }),
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

  await page.route("**/task_write_bulks**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.route("**/dimensions**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.route("**/dimensions/*/evaluations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    });
  });
});

test("renders the overview landing view", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Methodology Hub" }),
  ).toBeVisible();
  await expect(
    page.getByText("Task Pool", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Status Board")).toBeVisible();
  await expect(page.getByText("Task Pool Decision Signals")).toBeVisible();
  await expect(page.getByText("Completed Result Activity")).toBeVisible();
  await expect(
    page
      .locator('[data-slot="card"]')
      .filter({ hasText: "Status Board" })
      .getByRole("application", { name: "Status Board chart" }),
  ).toBeVisible();
  await expect(
    page
      .locator('[data-slot="card"]')
      .filter({ hasText: "Completed Result Activity" })
      .getByRole("application", {
        name: "Completed Result Activity chart",
      }),
  ).toBeVisible();
  await expect(page.getByText("Recent Active Tasks")).toBeVisible();
});

test("keeps the dashboard available when task responses include project_id", async ({
  page,
}) => {
  await page.route("**/tasks**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          buildTask({
            spec: "Server task with project identifier",
            taskId: "task-project-id",
          }),
        ],
      }),
    });
  });

  await page.goto("/");

  await expect(page.getByText("Task dashboard unavailable")).not.toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Server task with project identifier" }),
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

  const optimizerSwitch = page.getByRole("switch", {
    name: "AIM Optimizer",
  });

  await expect(optimizerSwitch).toBeVisible();
  await expect(optimizerSwitch).not.toBeChecked();
  await expect(optimizerSwitch).toHaveAttribute("data-state", "unchecked");

  await optimizerSwitch.click();

  await expect(optimizerSwitch).toBeChecked();
  await expect(optimizerSwitch).toHaveAttribute("data-state", "checked");

  await optimizerSwitch.click();

  await expect(optimizerSwitch).not.toBeChecked();
  await expect(optimizerSwitch).toHaveAttribute("data-state", "unchecked");
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

test("refreshes the optimizer switch from optimizer status running", async ({
  page,
}) => {
  let optimizerStatusRunning = false;

  await page.route("**/optimizer/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(buildOptimizerStatus(optimizerStatusRunning)),
    });
  });

  await page.goto("/");

  const optimizerSwitch = page.getByRole("switch", {
    name: "AIM Optimizer",
  });

  await expect(optimizerSwitch).toBeVisible();
  await expect(optimizerSwitch).not.toBeChecked();

  optimizerStatusRunning = true;
  await page.getByRole("button", { name: "Refresh" }).click();

  await expect(optimizerSwitch).toBeChecked();
});

test("prioritizes the AIM Dimension report before task execution evidence", async ({
  page,
}) => {
  const requestedDimensionUrls: string[] = [];
  const dimension = buildDimension();

  await page.route("**/dimensions**", async (route) => {
    requestedDimensionUrls.push(route.request().url());

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [dimension] }),
    });
  });

  await page.route("**/dimensions/*/evaluations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          buildDimensionEvaluation({ dimensionId: dimension.id, score: 82 }),
        ],
      }),
    });
  });

  await page.goto("/");

  await expect.poll(() => requestedDimensionUrls.length).toBeGreaterThan(0);

  const dimensionReport = page.getByRole("region", {
    name: "AIM Dimension report",
  });
  const convergenceMap = page.getByRole("region", {
    name: "Baseline convergence map",
  });

  await expect(dimensionReport).toBeVisible();
  await expect(
    dimensionReport.getByRole("heading", { name: "AIM Dimension Report" }),
  ).toBeVisible();
  await expect(
    dimensionReport.getByText(
      "Dimension scores surface before task mechanics so the Director sees goal fit first.",
    ),
  ).toBeVisible();
  await expect(
    dimensionReport.getByRole("heading", { name: "README Fit" }),
  ).toBeVisible();
  await expect(dimensionReport.getByText("82/100")).toBeVisible();
  await expect(
    dimensionReport.getByText(
      "Strong convergence evidence, missing one explicit intervention path.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "AIM Dimension Report" }),
  ).toBeVisible();

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const report = document.querySelector("#aim-dimension-report");
        const map = document.querySelector("#convergence-map");

        if (!report || !map) {
          return false;
        }

        return (
          (report.compareDocumentPosition(map) &
            Node.DOCUMENT_POSITION_FOLLOWING) !==
          0
        );
      }),
    )
    .toBe(true);
  await expect(convergenceMap).toBeVisible();
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
    trend.getByText("2026-04-20 09:10", { exact: true }),
  ).toBeVisible();
  await expect(
    trend.getByText("2026-04-20 10:15", { exact: true }),
  ).toBeVisible();
  await expect(
    trend.getByText("2026-04-20 11:20", { exact: true }),
  ).toBeVisible();
  await expect(trend.getByText("0", { exact: true })).toBeVisible();
  await expect(trend.getByText("100", { exact: true })).toBeVisible();
  await expect(
    trend.getByRole("application", { name: "README Fit score trend chart" }),
  ).toBeVisible();
  await expect(trend.getByText("Score 82")).toBeVisible();

  await trend
    .getByRole("application", { name: "README Fit score trend chart" })
    .focus();
  await expect(
    trend.getByText(
      "Strong convergence evidence, missing one explicit intervention path.",
    ),
  ).toBeVisible();
});

test("lists Task Write Bulks as pre-approval write intents and opens read-only details", async ({
  page,
}) => {
  const requestedBulkUrls: string[] = [];
  const taskWriteBulk = buildTaskWriteBulk();

  await page.route("**/task_write_bulks**", async (route) => {
    requestedBulkUrls.push(route.request().url());

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [taskWriteBulk] }),
    });
  });

  await page.goto("/");

  await expect.poll(() => requestedBulkUrls.length).toBeGreaterThan(0);

  const bulkSection = page
    .getByRole("region", { name: "Task Write Bulk intents" })
    .locator('[data-slot="card"]');

  await expect(
    bulkSection.getByRole("heading", { name: "Task Write Bulks" }),
  ).toBeVisible();
  await expect(
    bulkSection.getByText(
      "Pre-approval Coordinator write intent. No tasks have been created or executed from these records.",
    ),
  ).toBeVisible();
  await expect(
    bulkSection.getByRole("button", { name: /bulk-approval-1/i }),
  ).toBeVisible();
  await expect(bulkSection.getByText("2 proposed entries")).toBeVisible();
  await expect(bulkSection.getByText("origin/main@abc1234")).toBeVisible();

  await bulkSection.getByRole("button", { name: /bulk-approval-1/i }).click();

  await expect(
    page.getByRole("heading", { name: "Task Write Bulk Details" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Read-only Coordinator proposal. This is not an executed task result and provides no approve, create, or delete action.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Bulk ID: bulk-approval-1")).toBeVisible();
  await expect(
    page.getByText("Baseline Ref: origin/main@abc1234"),
  ).toBeVisible();
  await expect(
    page.getByText("Created At: 2026-04-20T10:00:00.000Z"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Coordinator write intent" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "entry-create-docs" }),
  ).toBeVisible();
  await expect(page.getByText("Create", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Write Director-facing task write bulk docs."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "entry-delete-stale" }),
  ).toBeVisible();
  await expect(page.getByText("Delete", { exact: true })).toBeVisible();
  await expect(page.getByText("task-stale-1")).toBeVisible();
  await expect(page.getByRole("button", { name: /approve/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /delete/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /create task/i })).toHaveCount(
    0,
  );
});

test("frames the dashboard as a Director methodology hub", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Methodology Hub" }),
  ).toBeVisible();
  await expect(
    page.getByText("Baseline convergence for the AIM Director"),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "AIM sections" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Baseline Review" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Intervention Queue" }),
  ).toBeVisible();
  await expect(page.getByText("Director Review Rail")).toBeVisible();
  await expect(
    page.getByText(
      "Human attention stays on goals, blockers, and clarification points.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
});

test("presents a cohesive Director cockpit with convergence, evidence, and intervention regions", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("banner").getByRole("heading", {
      name: "Baseline Convergence Cockpit",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Director workspace" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Convergence Map" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Evidence Ledger" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Intervention Rail" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Baseline convergence map" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Evidence ledger" }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Intervention rail" }),
  ).toBeVisible();
  await expect(
    page.getByText("Human review needed", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { exact: true, name: "Task intake" }),
  ).toHaveCount(0);
});

test("manages projects with list, create, edit, and delete actions", async ({
  page,
}) => {
  let projects = [
    buildProject(),
    buildProject({
      globalModelId: "gpt-5.5",
      globalProviderId: "openai",
      name: "Research project",
      projectId: "project-research",
      projectPath: "/repo/research",
    }),
  ];
  const requests: Array<{
    method: string;
    postData: null | string;
    url: string;
  }> = [];

  await page.route("**/projects**", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const projectId = decodeURIComponent(
      requestUrl.pathname.split("/").at(-1) ?? "",
    );

    requests.push({
      method: request.method(),
      postData: request.postData(),
      url: request.url(),
    });

    if (request.method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ items: projects }),
      });
      return;
    }

    if (request.method() === "POST") {
      const payload = JSON.parse(request.postData() ?? "{}") as {
        global_model_id: string;
        global_provider_id: string;
        name: string;
        project_path: string;
      };
      const createdProject = buildProject({
        globalModelId: payload.global_model_id,
        globalProviderId: payload.global_provider_id,
        name: payload.name,
        projectId: "project-created",
        projectPath: payload.project_path,
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
        global_model_id?: string;
        global_provider_id?: string;
        name?: string;
        project_path?: string;
      };
      const existingProject = projects.find(
        (project) => project.id === projectId,
      );
      const updatedProject = {
        ...existingProject,
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
  await expect(
    page.getByRole("row", { name: /Research project/ }),
  ).toBeVisible();

  await page.getByLabel("Project Name").fill("Created project");
  await page.getByLabel("Project Path").fill("/repo/created");
  await page.getByLabel("Global Provider").fill("anthropic");
  await page.getByLabel("Global Model").fill("claude-sonnet-4-5");
  await page.getByRole("button", { name: "Create Project" }).click();

  await expect(
    page.getByRole("row", { name: /Created project/ }),
  ).toBeVisible();
  expect(requests.some((request) => request.method === "POST")).toBe(true);

  await page.getByRole("button", { name: "Edit Main project" }).click();
  await page.getByLabel("Project Name").fill("Renamed project");
  await page.getByLabel("Global Provider").fill("openai");
  await page.getByLabel("Global Model").fill("gpt-5.5");
  await page.getByRole("button", { name: "Save Project" }).click();

  await expect(
    page.getByRole("row", { name: /Renamed project/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete Renamed project" }).click();

  await expect(page.getByRole("row", { name: /Renamed project/ })).toHaveCount(
    0,
  );
  expect(requests.some((request) => request.method === "PATCH")).toBe(true);
  expect(requests.some((request) => request.method === "DELETE")).toBe(true);
});

test("separates unfinished Task Pool data from completed history results", async ({
  page,
}) => {
  const requestedDoneFilters: string[] = [];

  await page.route("**/tasks**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const doneFilter = requestUrl.searchParams.get("done");

    requestedDoneFilters.push(doneFilter ?? "missing");

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items:
          doneFilter === "true"
            ? [
                buildTask({
                  done: true,
                  result: "Merged and verified.",
                  spec: "Succeeded history task",
                  status: "resolved",
                  taskId: "task-history-succeeded",
                  updatedAt: "2026-04-19T00:00:04.000Z",
                }),
                buildTask({
                  done: true,
                  result: "Rejected feedback: missing acceptance tests.",
                  spec: "Rejected history task",
                  status: "rejected",
                  taskId: "task-history-rejected",
                  updatedAt: "2026-04-19T00:00:05.000Z",
                }),
              ]
            : [
                buildTask({
                  spec: "Active ready task",
                  taskId: "task-active-ready",
                  updatedAt: "2026-04-19T00:00:01.000Z",
                }),
                buildTask({
                  dependencies: ["task-active-ready"],
                  spec: "Active blocked task",
                  status: "processing",
                  taskId: "task-active-blocked",
                  updatedAt: "2026-04-19T00:00:02.000Z",
                }),
              ],
      }),
    });
  });

  await page.goto("/");

  await expect
    .poll(() => requestedDoneFilters.sort())
    .toEqual(["false", "true"]);
  await expect(
    page.getByText("Task Pool", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("History Resolved")).toBeVisible();
  await expect(page.getByText("History Rejected")).toBeVisible();
  await expect(page.getByText("Task Pool Decision Signals")).toBeVisible();
  await expect(page.getByText("2 active", { exact: true })).toBeVisible();
  await expect(page.getByText("2 closed")).toBeVisible();
  await expect(page.getByText("50%")).toBeVisible();
  await expect(page.getByText("2 signals")).toBeVisible();
  await expect(
    page.getByText(
      "1 active dependency-linked tasks and 1 rejected history items may need Manager/Coordinator attention.",
    ),
  ).toBeVisible();

  await expect(
    page.getByRole("row", { name: /Active ready task/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: /Rejected history task/i }),
  ).toHaveCount(0);
  const evidenceLedger = page.getByRole("region", { name: "Evidence ledger" });
  const recentActiveSection = evidenceLedger.locator('[data-slot="card"]', {
    has: page.getByRole("heading", { name: "Recent Active Tasks" }),
  });

  await expect(
    recentActiveSection.getByRole("button", { name: "Active blocked task" }),
  ).toBeVisible();
  await expect(
    recentActiveSection.getByRole("button", { name: "Rejected history task" }),
  ).toHaveCount(0);
  const completedFeedbackSection = evidenceLedger.locator(
    '[data-slot="card"]',
    {
      has: page.getByRole("heading", { name: "Completed Task Feedback" }),
    },
  );

  await expect(completedFeedbackSection).toBeVisible();
  await expect(
    completedFeedbackSection.getByText("Merged and verified."),
  ).toBeVisible();
  await expect(
    completedFeedbackSection.getByText(
      "Rejected feedback: missing acceptance tests.",
    ),
  ).toBeVisible();
});

test("aggregates rejected feedback signals for Coordinator planning", async ({
  page,
}) => {
  const repeatedStaleSpecFeedback =
    "Spec premise stale: Scheduler Session priority assumptions no longer match origin/main.";

  await page.route("**/tasks**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const doneFilter = requestUrl.searchParams.get("done");

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items:
          doneFilter === "true"
            ? [
                buildTask({
                  done: true,
                  result: repeatedStaleSpecFeedback,
                  spec: "Scheduler Session priority stale spec check",
                  status: "rejected",
                  taskId: "task-scheduler-priority-a",
                  updatedAt: "2026-04-20T00:00:03.000Z",
                }),
                buildTask({
                  done: true,
                  result: repeatedStaleSpecFeedback,
                  spec: "Scheduler Session priority retry stale spec check",
                  status: "rejected",
                  taskId: "task-scheduler-priority-b",
                  updatedAt: "2026-04-21T00:00:03.000Z",
                }),
                buildTask({
                  done: true,
                  result: "Rejected feedback: missing acceptance tests.",
                  spec: "Dashboard rejection sample",
                  status: "rejected",
                  taskId: "task-dashboard-rejected",
                  updatedAt: "2026-04-22T00:00:03.000Z",
                }),
                buildTask({
                  done: true,
                  result: "Merged and verified.",
                  spec: "Succeeded history task",
                  status: "resolved",
                  taskId: "task-history-succeeded",
                  updatedAt: "2026-04-23T00:00:03.000Z",
                }),
              ]
            : [
                buildTask({
                  spec: "Active ready task",
                  taskId: "task-active-ready",
                }),
              ],
      }),
    });
  });

  await page.goto("/");

  const rejectedFeedbackSection = page
    .getByRole("region", { name: "Evidence ledger" })
    .locator('[data-slot="card"]', {
      has: page.getByRole("heading", { name: "Rejected Feedback Signals" }),
    });

  await expect(rejectedFeedbackSection).toBeVisible();
  const schedulerFeedbackCard = rejectedFeedbackSection
    .locator("article")
    .filter({ hasText: repeatedStaleSpecFeedback });

  await expect(
    schedulerFeedbackCard.getByText("Scheduler Session", { exact: true }),
  ).toBeVisible();
  await expect(
    schedulerFeedbackCard.getByText(repeatedStaleSpecFeedback),
  ).toHaveCount(1);
  await expect(schedulerFeedbackCard.getByText("2 tasks")).toBeVisible();
  await expect(
    schedulerFeedbackCard.getByRole("button", {
      name: "Scheduler Session priority stale spec check",
    }),
  ).toBeVisible();
  await expect(
    schedulerFeedbackCard.getByRole("button", {
      name: "Scheduler Session priority retry stale spec check",
    }),
  ).toBeVisible();
  await expect(
    rejectedFeedbackSection.getByText(
      "Rejected feedback: missing acceptance tests.",
    ),
  ).toBeVisible();

  await rejectedFeedbackSection
    .getByRole("combobox", { name: "Reason category" })
    .click();
  await page.getByRole("option", { name: "Scheduler Session" }).click();
  await expect(rejectedFeedbackSection.getByText("2 tasks")).toBeVisible();
  await expect(
    rejectedFeedbackSection.getByText(
      "Rejected feedback: missing acceptance tests.",
    ),
  ).toHaveCount(0);

  await rejectedFeedbackSection
    .getByLabel("Coordinate or task")
    .fill("priority retry");
  await expect(
    rejectedFeedbackSection.getByRole("button", {
      name: "Scheduler Session priority retry stale spec check",
    }),
  ).toBeVisible();
  await expect(
    rejectedFeedbackSection.getByRole("button", {
      name: "Scheduler Session priority stale spec check",
    }),
  ).toBeVisible();

  await rejectedFeedbackSection
    .getByLabel("Coordinate or task")
    .fill("api-only");
  await expect(
    rejectedFeedbackSection.getByText("No rejected feedback matches filters."),
  ).toBeVisible();
});

test("renders the AIM brand mark and favicon entrypoint", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByAltText("AIM icon")).toBeVisible();
  await expect(
    page.getByRole("heading", { exact: true, name: "AIM" }),
  ).toBeVisible();
  await expect(
    page.getByText("Baseline convergence for the AIM Director"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Methodology Hub" }),
  ).toBeVisible();

  await expect(
    page.locator('head link[rel="icon"][href="/favicon.svg"]'),
  ).toHaveCount(1);
});

test("toggles the branded shell between dark and light themes", async ({
  page,
}) => {
  await page.goto("/");

  const themeToggle = page.getByRole("button", {
    name: "Switch to light theme",
  });

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(themeToggle).toBeVisible();

  await themeToggle.click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(
    page.getByRole("button", { name: "Switch to dark theme" }),
  ).toBeVisible();
  await expect(page.locator("body")).toContainText("AIM Navigator");
});

test("places refresh with the global theme controls", async ({ page }) => {
  await page.goto("/");

  const globalControls = page.getByRole("group", { name: "Global controls" });

  await expect(
    globalControls.getByRole("button", { name: "Switch to light theme" }),
  ).toBeVisible();
  await expect(
    globalControls.getByRole("button", { exact: true, name: "Refresh" }),
  ).toBeVisible();
});

test("infers, switches, and persists the dashboard interface language", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      value: "zh-CN",
    });
  });

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "基线收敛驾驶舱" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "切换到英文界面" }),
  ).toBeVisible();
  await expect(page.getByText("方法论枢纽")).toBeVisible();

  await page.getByRole("button", { name: "切换到英文界面" }).click();

  await expect(
    page.getByRole("heading", { name: "Baseline Convergence Cockpit" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Switch to Chinese interface" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => window.localStorage.getItem("aim.web.locale")),
    )
    .toBe("en");

  await page.reload();

  await expect(
    page.getByRole("heading", { name: "Baseline Convergence Cockpit" }),
  ).toBeVisible();
  await expect(page.getByText("Methodology Hub")).toBeVisible();
});

test("toggles task details AIM panel colors with the app theme", async ({
  page,
}) => {
  await page.route("**/tasks**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          buildTask({
            dependencies: ["task-api"],
            spec: "Theme-aware task\n\n## Summary\n\n- keep panels readable",
            taskId: "task-theme",
          }),
        ],
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("row", { name: /Theme-aware task/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const readDetailsStyles = async () =>
    page.evaluate(() => {
      const detailCards = document.querySelectorAll('[data-slot="card"]');
      const surface = detailCards[0];
      const panel = detailCards[1];
      const metadataLabel = document.querySelector("dt");
      const markdown = Array.from(document.querySelectorAll("div")).find(
        (node) => node.textContent?.includes("keep panels readable"),
      );
      const chip = document.querySelector('[data-slot="badge"]');

      if (!surface || !panel || !metadataLabel || !markdown || !chip) {
        throw new Error("Expected task details theme elements to render");
      }

      return {
        chipBackground: getComputedStyle(chip).backgroundColor,
        htmlBackground: getComputedStyle(document.documentElement)
          .getPropertyValue("--background")
          .trim(),
        markdownColor: getComputedStyle(markdown).color,
        metadataColor: getComputedStyle(metadataLabel).color,
        panelBackground: getComputedStyle(panel).backgroundColor,
        surfaceColor: getComputedStyle(surface).color,
      };
    });

  const darkStyles = await readDetailsStyles();
  expect(Object.values(darkStyles).every((value) => value.length > 0)).toBe(
    true,
  );

  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await expect.poll(readDetailsStyles).not.toEqual(darkStyles);
});

test("does not expose direct task creation controls in the director GUI", async ({
  page,
}) => {
  let createRequestCount = 0;

  await page.route("**/tasks**", async (route) => {
    if (route.request().method() === "POST") {
      createRequestCount += 1;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          buildTask({
            spec: "Existing task",
            taskId: "task-existing",
          }),
        ],
      }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("button", { name: /^Create Task$/ })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Task Intake" })).toHaveCount(
    0,
  );

  await page.goto("/#/tasks/new");

  await expect(page).toHaveURL(/\/#\/$/);
  await expect(page.getByLabel("Task Spec")).toHaveCount(0);
  await expect(page.getByLabel("Project Path")).toHaveCount(0);
  await expect.poll(() => createRequestCount).toBe(0);
});

test("renders the task table with core columns", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("columnheader", { name: "Task" })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Status" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Dependencies" }),
  ).toBeVisible();
});

test("filters tasks by free-text input", async ({ page }) => {
  await page.route("**/tasks**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          buildTask({
            spec: "stub task spec",
            taskId: "task-123",
          }),
          buildTask({
            spec: "another background task",
            taskId: "task-456",
          }),
        ],
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Filter Tasks").fill("stub task spec");

  await expect(
    page.getByRole("row", { name: /stub task spec/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: /another background task/i }),
  ).toHaveCount(0);
  await expect(page.getByText("No matching tasks.")).toHaveCount(0);

  await page.getByLabel("Filter Tasks").fill("missing task");

  await expect(page.getByText("No matching tasks.")).toBeVisible();
});

test("filters tasks by text that appears only in later task_spec lines", async ({
  page,
}) => {
  await page.route("**/tasks**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          buildTask({
            spec: "Release checklist\n- follow-up search needle\n- notify team",
            taskId: "task-123",
          }),
          buildTask({
            spec: "Search needle title",
            taskId: "task-456",
          }),
        ],
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Filter Tasks").fill("follow-up search needle");

  await expect(
    page.getByRole("row", { name: /Release checklist/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: /Search needle title/i }),
  ).toHaveCount(0);
  await expect(page.getByText("No matching tasks.")).toHaveCount(0);
});

test("refreshes the dashboard without clearing the current task filter", async ({
  page,
}) => {
  let dashboardRequestCount = 0;

  await page.route("**/tasks**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    dashboardRequestCount += 1;

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items:
          dashboardRequestCount === 1
            ? [
                buildTask({ spec: "needle task", taskId: "task-123" }),
                buildTask({ spec: "background task", taskId: "task-456" }),
              ]
            : [
                buildTask({
                  spec: "needle task refreshed",
                  taskId: "task-123",
                }),
                buildTask({ spec: "background task", taskId: "task-456" }),
              ],
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Filter Tasks").fill("needle");

  await expect(page.getByRole("row", { name: /needle task/i })).toBeVisible();
  await expect(page.getByRole("row", { name: /background task/i })).toHaveCount(
    0,
  );

  await page.getByRole("button", { exact: true, name: "Refresh" }).click();

  await expect.poll(() => dashboardRequestCount).toBe(4);
  await expect(page.getByLabel("Filter Tasks")).toHaveValue("needle");
  await expect(
    page.getByRole("row", { name: /needle task refreshed/i }),
  ).toBeVisible();
  await expect(page.getByRole("row", { name: /background task/i })).toHaveCount(
    0,
  );
});

test("opens the task details page from overview and table", async ({
  page,
}) => {
  await page.goto("/");

  await page
    .getByRole("button", { name: /stub task spec/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/#\/tasks\/task-123$/);
  await expect(
    page.getByText("Contract Status", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Back to Dashboard" }).click();
  await expect(page).toHaveURL(/\/#\/$/);
  await page.getByRole("row", { name: /stub task spec/i }).click();
  await expect(page).toHaveURL(/\/#\/tasks\/task-123$/);
});

test("refreshes a hash task details route without a server rewrite", async ({
  page,
}) => {
  await page.goto("/#/tasks/task-123");

  await expect(page).toHaveURL(/\/#\/tasks\/task-123$/);
  await expect(page.getByText("Task ID: task-123")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "stub task spec" }),
  ).toBeVisible();
});

test("keeps dashboard panels usable when a report panel fails to render and retries it", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const [reactModule, reactDomClientModule, { DashboardPanelBoundary }] =
      await Promise.all([
        import("/node_modules/.vite/deps/react.js"),
        import("/node_modules/.vite/deps/react-dom_client.js"),
        import(
          "/src/features/task-dashboard/components/dashboard-error-boundary.tsx"
        ),
      ]);
    const { createElement } = reactModule.default ?? reactModule;
    const { createRoot } = reactDomClientModule.default ?? reactDomClientModule;
    const rootElement = document.createElement("div");
    let shouldThrow = true;
    const StablePanel = () =>
      createElement(
        "section",
        { "aria-label": "Baseline convergence map" },
        "Baseline convergence map remains available",
      );
    const EvaluationPanel = () => {
      if (shouldThrow) {
        throw new Error("Injected evaluation signal render failure");
      }

      return createElement(
        "section",
        { "aria-label": "Evaluation Signals" },
        "Restored Direction",
      );
    };

    document.body.replaceChildren(rootElement);
    createRoot(rootElement).render(
      createElement(
        "main",
        null,
        createElement(StablePanel),
        createElement(
          DashboardPanelBoundary,
          {
            onRetry: () => {
              shouldThrow = false;
            },
            scope: "Evaluation Signals",
          },
          createElement(EvaluationPanel),
        ),
      ),
    );
  });

  await expect(
    page.getByRole("region", { name: "Baseline convergence map" }),
  ).toBeVisible();
  const failedPanel = page.getByRole("alert").filter({
    hasText: "Evaluation Signals failed to render.",
  });

  await expect(failedPanel).toBeVisible();
  await expect(failedPanel.getByText("Panel unavailable")).toBeVisible();
  await expect(
    failedPanel.getByText(
      "Direct cause: Injected evaluation signal render failure",
    ),
  ).toBeVisible();

  await failedPanel.getByRole("button", { name: "Retry panel" }).click();

  await expect(
    page.getByRole("region", { name: "Evaluation Signals" }),
  ).toBeVisible();
  await expect(page.getByText("Restored Direction")).toBeVisible();
  await expect(page.getByText("Panel unavailable")).toHaveCount(0);
});

test("uses the first task_spec line as the task title while keeping the full body in details", async ({
  page,
}) => {
  await page.route("**/tasks**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          buildTask({
            spec: "Summary title\n- implementation detail\n- rollout detail",
            taskId: "task-summary",
          }),
        ],
      }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("row", { name: /Summary title/i })).toBeVisible();
  await expect(
    page.getByRole("row", { name: /implementation detail/i }),
  ).toHaveCount(0);

  await page.getByRole("row", { name: /Summary title/i }).click();

  await expect(
    page.getByRole("heading", { level: 2, name: "Summary title" }),
  ).toBeVisible();
  await expect(page.getByText("Task Spec", { exact: true })).toBeVisible();
  await expect(page.getByText("implementation detail")).toBeVisible();
  await expect(page.getByText("rollout detail")).toBeVisible();
});

test("renders task spec markdown with GFM tables in task details", async ({
  page,
}) => {
  await page.route("**/tasks**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          buildTask({
            spec: [
              "Release checklist",
              "",
              "| Step | Owner |",
              "| --- | --- |",
              "| Ship | Ops |",
            ].join("\n"),
            taskId: "task-markdown",
          }),
        ],
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("row", { name: /Release checklist/i }).click();

  await expect(
    page.getByRole("heading", { level: 2, name: "Release checklist" }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Ship" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Ops" })).toBeVisible();

  const markdownRegion = page
    .getByRole("table")
    .locator(
      "xpath=ancestor::div[contains(@class, 'text-card-foreground')][1]",
    );
  await expect(markdownRegion).toHaveClass(/(^|\s)prose(\s|$)/);
  await expect(markdownRegion).toHaveClass(/(^|\s)prose-neutral(\s|$)/);
  await expect(markdownRegion).toHaveClass(/(^|\s)dark:prose-invert(\s|$)/);
  await expect(markdownRegion).toHaveClass(/(^|\s)max-w-none(\s|$)/);
});

test("brands task details with grouped metadata and pull request access", async ({
  page,
}) => {
  await page.route("**/tasks**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            ...buildTask({
              dependencies: ["task-ops", "task-release"],
              spec: "Branded task title\n\n## Summary\n\n- clarify ownership",
              status: "processing",
              taskId: "task-brand",
            }),
            pull_request_url: "https://github.com/example/repo/pull/42",
            session_id: "ses-42",
            worktree_path: "/repo/.worktrees/task-brand",
          },
        ],
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("row", { name: /Branded task title/i }).click();

  await expect(page.getByText("Task Overview")).toBeVisible();
  await expect(page.getByText("Execution Metadata")).toBeVisible();
  await expect(page.getByText("Task Relationships")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open Pull Request" }),
  ).toBeVisible();
  await expect(page.getByText("task-ops")).toBeVisible();
  await expect(page.getByText("task-release")).toBeVisible();
});

test("shows present developer closure cues in task details", async ({
  page,
}) => {
  await page.route("**/tasks**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            ...buildTask({
              done: true,
              result: "PR merged, worktree removed, workspace refreshed.",
              spec: "Closure-ready task",
              status: "resolved",
              taskId: "task-closure-ready",
            }),
            pull_request_url: "https://github.com/example/repo/pull/88",
            worktree_path: "/repo/.worktrees/task-closure-ready",
          },
        ],
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("row", { name: /Closure-ready task/i }).click();

  await expect(page.getByText("Developer Closure Cues")).toBeVisible();
  await expect(page.getByText("Pull Request: Present")).toBeVisible();
  await expect(page.getByText("Worktree: Present")).toBeVisible();
  await expect(page.getByText("Result Feedback: Present")).toBeVisible();
  await expect(page.getByText("Done / Status: Complete")).toBeVisible();
  await expect(
    page.getByText("PR merged, worktree removed, workspace refreshed."),
  ).toBeVisible();
  await expect(page.getByText("done=true; status=resolved")).toBeVisible();
});

test("shows missing developer closure cues in task details", async ({
  page,
}) => {
  await page.route("**/tasks**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          buildTask({
            spec: "Closure-missing task",
            status: "processing",
            taskId: "task-closure-missing",
          }),
        ],
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("row", { name: /Closure-missing task/i }).click();

  await expect(page.getByText("Developer Closure Cues")).toBeVisible();
  await expect(page.getByText("Pull Request: Missing")).toBeVisible();
  await expect(page.getByText("No pull_request_url recorded")).toBeVisible();
  await expect(page.getByText("Worktree: Missing")).toBeVisible();
  await expect(page.getByText("No worktree_path recorded")).toBeVisible();
  await expect(page.getByText("Result Feedback: Missing")).toBeVisible();
  await expect(page.getByText("No result feedback recorded")).toBeVisible();
  await expect(page.getByText("Done / Status: Incomplete")).toBeVisible();
  await expect(page.getByText("done=false; status=processing")).toBeVisible();
});

test("does not render a dependency graph for Director review", async ({
  page,
}) => {
  await page.route("**/tasks**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          buildTask({
            spec: "Ready task",
            taskId: "task-123",
          }),
          buildTask({
            dependencies: ["task-123"],
            spec: "Blocked task",
            status: "processing",
            taskId: "task-456",
          }),
        ],
      }),
    });
  });

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Dependency Graph" }),
  ).toHaveCount(0);
  await expect(page.getByTestId("graph-node-task-123")).toHaveCount(0);
  await expect(page.getByTestId("graph-node-task-456")).toHaveCount(0);
});

test("shows a clear error state when the task request fails", async ({
  page,
}) => {
  await page.route("**/tasks**", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "TASK_VALIDATION_ERROR",
        message: "offline",
      }),
    });
  });

  await page.goto("/");

  await expect(
    page.getByText("Task dashboard unavailable: offline"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("shows the underlying parse error when the task request returns HTML", async ({
  page,
}) => {
  await page.route("**/tasks**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html><body>Vite fallback</body></html>",
    });
  });

  await page.goto("/");

  await expect(
    page.getByText(
      /Task dashboard unavailable: (Unexpected token|JSON\.parse: unexpected)/,
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("falls back to the default localhost SERVER_BASE_URL when local storage is empty", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem("aim.serverBaseUrl");
  });

  await page.goto("/");

  await expect(page.getByLabel("SERVER_BASE_URL")).toHaveValue(
    "http://localhost:8192",
  );
});

test("refetches the dashboard after saving a new SERVER_BASE_URL", async ({
  page,
}) => {
  await page.route("**/tasks**", async (route) => {
    const requestUrl = new URL(route.request().url());

    if (requestUrl.pathname === "/api/tasks") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            buildTask({
              spec: "Initial task",
              taskId: "task-initial",
            }),
          ],
        }),
      });
      return;
    }

    if (requestUrl.pathname === "/alt/tasks") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            buildTask({
              spec: "Updated task",
              taskId: "task-updated",
            }),
          ],
        }),
      });
      return;
    }

    await route.abort();
  });

  await page.goto("/");

  await expect(
    page.getByRole("row", { exact: true, name: /Initial task/ }),
  ).toBeVisible();

  await page.getByLabel("SERVER_BASE_URL").fill("/alt");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(
    page.getByRole("row", { exact: true, name: /Updated task/ }),
  ).toBeVisible();
  await expect(page.getByRole("row", { name: /Initial task/ })).toHaveCount(0);
});

test("keeps only active tasks in Recent Active Tasks", async ({ page }) => {
  await page.route("**/tasks**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          buildTask({
            spec: "Ready task",
            taskId: "task-ready",
            updatedAt: "2026-04-19T00:00:01.000Z",
          }),
          buildTask({
            spec: "Running task",
            status: "processing",
            taskId: "task-running",
            updatedAt: "2026-04-19T00:00:02.000Z",
          }),
          buildTask({
            spec: "Blocked task",
            status: "processing",
            taskId: "task-blocked",
            updatedAt: "2026-04-19T00:00:03.000Z",
          }),
          buildTask({
            done: true,
            spec: "Done task",
            status: "resolved",
            taskId: "task-done",
            updatedAt: "2026-04-19T00:00:04.000Z",
          }),
          buildTask({
            done: true,
            spec: "Failed task",
            status: "rejected",
            taskId: "task-failed",
            updatedAt: "2026-04-19T00:00:05.000Z",
          }),
        ],
      }),
    });
  });

  await page.goto("/");

  const recentActiveSection = page
    .getByRole("region", { name: "Evidence ledger" })
    .locator('[data-slot="card"]', {
      has: page.getByRole("heading", { name: "Recent Active Tasks" }),
    });

  await expect(
    recentActiveSection.getByRole("button", {
      exact: true,
      name: "Ready task",
    }),
  ).toBeVisible();
  await expect(
    recentActiveSection.getByRole("button", {
      exact: true,
      name: "Running task",
    }),
  ).toBeVisible();
  await expect(
    recentActiveSection.getByRole("button", {
      exact: true,
      name: "Blocked task",
    }),
  ).toBeVisible();
  await expect(
    recentActiveSection.getByRole("button", { exact: true, name: "Done task" }),
  ).toHaveCount(0);
  await expect(
    recentActiveSection.getByRole("button", {
      exact: true,
      name: "Failed task",
    }),
  ).toHaveCount(0);
});

test("renders a branded decision workspace with readable dark-mode data views", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByText("Baseline convergence for the AIM Director"),
  ).toBeVisible();
  await expect(page.getByText("Status Board")).toBeVisible();
  await expect(page.getByText("Recent Active Tasks")).toBeVisible();
  await expect(page.getByText("Active Unfinished Tasks")).toBeVisible();
  const shellStyles = await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="dashboard-shell"]');
    const tableHeader = document.querySelector(
      '[data-testid="dashboard-table-header"]',
    );

    if (!shell || !tableHeader) {
      throw new Error("Expected readable dark-mode data view elements");
    }

    return [
      getComputedStyle(document.documentElement)
        .getPropertyValue("--background")
        .trim(),
      ...[shell, tableHeader].map(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    ];
  });

  expect(shellStyles.every((value) => value.length > 0)).toBe(true);
});
