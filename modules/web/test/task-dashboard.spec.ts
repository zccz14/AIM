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
  commitSha = "abc1234",
  createdAt = "2026-04-20T09:10:00.000Z",
  dimensionId = "dimension-readme-fit",
  evaluation = "Strong convergence evidence, missing one explicit intervention path.",
  evaluationId = "evaluation-readme-fit-1",
  score = 82,
}: {
  commitSha?: string;
  createdAt?: string;
  dimensionId?: string;
  evaluation?: string;
  evaluationId?: string;
  score?: number;
} = {}) => ({
  id: evaluationId,
  dimension_id: dimensionId,
  project_id: "00000000-0000-4000-8000-000000000010",
  commit_sha: commitSha,
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
  optimizerEnabled = false,
  projectId = "00000000-0000-4000-8000-000000000010",
}: {
  gitOriginUrl?: string;
  globalModelId?: string;
  globalProviderId?: string;
  name?: string;
  optimizerEnabled?: boolean;
  projectId?: string;
} = {}) => ({
  id: projectId,
  name,
  git_origin_url: gitOriginUrl,
  global_provider_id: globalProviderId,
  global_model_id: globalModelId,
  optimizer_enabled: optimizerEnabled,
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

test("shows project optimizer config and runtime observability separately", async ({
  page,
}) => {
  await page.route("**/projects**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [buildProject({ optimizerEnabled: true })],
      }),
    });
  });
  await page.route("**/projects/*/optimizer/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        project_id: "00000000-0000-4000-8000-000000000010",
        optimizer_enabled: true,
        runtime_active: false,
        enabled_triggers: ["task_resolved"],
        recent_event: {
          task_id: "task-resolved",
          triggered_scan: false,
          type: "task_resolved",
        },
        recent_scan_at: "2026-04-27T10:00:00.000Z",
        blocker_summary:
          "Optimizer lane developer_follow_up error: gh failed with token [REDACTED]. Check optimizer logs and fix the lane blocker before expecting new scans.",
      }),
    });
  });

  await page.goto("/#/projects/00000000-0000-4000-8000-000000000010");

  const optimizerRegion = page.getByRole("region", {
    name: "Project optimizer runtime",
  });

  await expect(optimizerRegion).toBeVisible();
  await expect(optimizerRegion.getByText("Config enabled")).toBeVisible();
  await expect(
    optimizerRegion.getByText("Runtime inactive", { exact: true }),
  ).toBeVisible();
  await expect(
    optimizerRegion.getByText("task_resolved", { exact: true }),
  ).toBeVisible();
  await expect(
    optimizerRegion.getByText("2026-04-27T10:00:00.000Z"),
  ).toBeVisible();
  await expect(optimizerRegion.getByText("Check optimizer logs")).toBeVisible();
  await expect(optimizerRegion.getByText("[REDACTED]")).toBeVisible();
  await expect(optimizerRegion.getByText("ghp_1234567890")).toHaveCount(0);
});

test("summarizes when the main target gap is already covered by unfinished tasks", async ({
  page,
}) => {
  await page.route("**/tasks**", async (route) => {
    const doneFilter = new URL(route.request().url()).searchParams.get("done");

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items:
          doneFilter === "true"
            ? []
            : [
                buildTask({
                  spec: "Add explicit accessibility gap path to the Director dashboard",
                  taskId: "task-accessibility-gap",
                }),
              ],
      }),
    });
  });
  await page.route("**/dimensions/*/evaluations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          buildDimensionEvaluation({
            evaluation:
              "Accessibility gap path is missing from the Director dashboard.",
            score: 43,
          }),
        ],
      }),
    });
  });

  await page.goto("/#/projects/00000000-0000-4000-8000-000000000010");

  const cockpit = page.getByRole("region", { name: "Target-gap cockpit" });

  await expect(cockpit).toBeVisible();
  await expect(cockpit.getByText("Main current gap")).toBeVisible();
  await expect(
    cockpit.getByText(
      "Accessibility gap path is missing from the Director dashboard.",
    ),
  ).toBeVisible();
  await expect(cockpit.getByText("Covered by unfinished tasks")).toBeVisible();
  await expect(cockpit.getByText("Wait for Developer")).toBeVisible();
});

test("warns Director when rejected feedback indicates stale or duplicate coverage risk", async ({
  page,
}) => {
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
                  result:
                    "Rejected: stale spec and duplicate coverage overlaps the active task.",
                  spec: "Rejected duplicate dashboard gap task",
                  status: "rejected",
                  taskId: "task-rejected-duplicate",
                }),
              ]
            : [
                buildTask({
                  spec: "Improve dashboard gap coverage",
                  taskId: "task-gap-coverage",
                }),
              ],
      }),
    });
  });

  await page.goto("/#/projects/00000000-0000-4000-8000-000000000010");

  const cockpit = page.getByRole("region", { name: "Target-gap cockpit" });

  await expect(cockpit.getByText("Rejected feedback risk")).toBeVisible();
  await expect(
    cockpit.getByText("Stale or duplicate coverage risk"),
  ).toBeVisible();
  await expect(cockpit.getByText("Ask Coordinator to replan")).toBeVisible();
});

test("exposes the visible dimension evaluation path for the current gap", async ({
  page,
}) => {
  await page.route("**/dimensions/*/evaluations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          buildDimensionEvaluation({
            evaluation:
              "Planning gap path is visible but has no decision summary yet.",
            score: 38,
          }),
        ],
      }),
    });
  });

  await page.goto("/#/projects/00000000-0000-4000-8000-000000000010");

  const cockpit = page.getByRole("region", { name: "Target-gap cockpit" });

  await expect(cockpit.getByText("README Fit", { exact: true })).toBeVisible();
  await expect(cockpit.getByText("38/100", { exact: true })).toBeVisible();
  await expect(
    cockpit.getByRole("link", { name: "Review README Fit gap path" }),
  ).toHaveAttribute("href", "#/dimensions/dimension-readme-fit");
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
  await expect(
    page.getByRole("columnheader", { name: "Git Origin URL" }),
  ).toBeVisible();

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

test("opens an OpenCode sessions list page without drilling into session details", async ({
  page,
}) => {
  const continueRequests: string[] = [];

  await page.route("**/opencode/sessions**", async (route) => {
    const requestUrl = new URL(route.request().url());

    if (route.request().method() === "POST") {
      continueRequests.push(requestUrl.pathname);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          requestUrl.pathname.endsWith("/continue_pending")
            ? {
                counts: { error: 0, pushed: 1, skipped: 2 },
                items: [
                  {
                    reason: null,
                    session_id: "ses_pending_review",
                    status: "pushed",
                  },
                ],
              }
            : {
                reason: null,
                session_id: "ses_pending_review",
                status: "pushed",
              },
        ),
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            session_id: "ses_pending_review",
            state: "pending",
            value: null,
            reason: null,
            continue_prompt: "Continue with required checks follow-up.",
            provider_id: "anthropic",
            model_id: "claude-sonnet-4-5",
            stale: true,
            created_at: "2026-04-27T08:00:00.000Z",
            updated_at: "2026-04-27T09:30:00.000Z",
          },
          {
            session_id: "ses_resolved_delivery",
            state: "resolved",
            value: "PR merged and baseline refreshed.",
            reason: null,
            continue_prompt: null,
            provider_id: null,
            model_id: null,
            stale: false,
            created_at: "2026-04-26T08:00:00.000Z",
            updated_at: "2026-04-26T11:30:00.000Z",
          },
          {
            session_id: "ses_rejected_scope",
            state: "rejected",
            value: null,
            reason: "Spec no longer matches origin/main.",
            continue_prompt: null,
            provider_id: null,
            model_id: null,
            stale: false,
            created_at: "2026-04-25T08:00:00.000Z",
            updated_at: "2026-04-25T09:00:00.000Z",
          },
        ],
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("link", { name: "OpenCode Sessions" }).click();

  await expect(page).toHaveURL(/\/#\/opencode\/sessions$/);
  await expect(
    page.getByRole("heading", { level: 2, name: "OpenCode Sessions" }),
  ).toBeVisible();
  const sessionsRegion = page.getByRole("region", {
    name: "OpenCode sessions",
  });

  await expect(sessionsRegion).toBeVisible();
  await expect(
    sessionsRegion.getByRole("row", { name: /ses_pending_review/ }),
  ).toBeVisible();
  await expect(
    sessionsRegion.getByText("Pending", { exact: true }),
  ).toBeVisible();
  await expect(
    sessionsRegion.getByText("Stale", { exact: true }),
  ).toBeVisible();
  await expect(sessionsRegion.getByText("Continue prompt ready")).toBeVisible();
  await expect(
    sessionsRegion.getByText("anthropic / claude-sonnet-4-5"),
  ).toBeVisible();
  await expect(
    sessionsRegion.getByRole("button", {
      exact: true,
      name: "Continue all pending sessions",
    }),
  ).toBeVisible();
  await expect(
    sessionsRegion.getByRole("button", { exact: true, name: "Continue" }),
  ).toBeVisible();
  await expect(
    sessionsRegion.getByRole("row", { name: /ses_resolved_delivery/ }),
  ).toBeVisible();
  await expect(
    sessionsRegion.getByText("PR merged and baseline refreshed."),
  ).toBeVisible();
  await expect(
    sessionsRegion.getByRole("row", { name: /ses_rejected_scope/ }),
  ).toBeVisible();
  await expect(
    sessionsRegion.getByText("Spec no longer matches origin/main."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Open session/ })).toHaveCount(0);

  await sessionsRegion
    .getByRole("button", { exact: true, name: "Continue" })
    .click();
  await sessionsRegion
    .getByRole("button", {
      exact: true,
      name: "Continue all pending sessions",
    })
    .click();

  await expect
    .poll(() => continueRequests)
    .toEqual([
      "/api/opencode/sessions/ses_pending_review/continue",
      "/api/opencode/sessions/continue_pending",
    ]);
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

test("highlights the latest dimension evaluation and links GitHub commit evidence", async ({
  page,
}) => {
  const dimension = buildDimension();
  const evaluations = [
    buildDimensionEvaluation({
      commitSha: "1111111",
      createdAt: "2026-04-20T09:10:00.000Z",
      dimensionId: dimension.id,
      evaluation: "Earlier evidence still needs Director review.",
      evaluationId: "evaluation-readme-fit-1",
      score: 48,
    }),
    buildDimensionEvaluation({
      commitSha: "2222222",
      createdAt: "2026-04-20T11:20:00.000Z",
      dimensionId: dimension.id,
      evaluation: "Latest evidence clearly identifies the intervention path.",
      evaluationId: "evaluation-readme-fit-2",
      score: 82,
    }),
  ];

  await page.route("**/dimensions", async (route) => {
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

  const latest = page.getByRole("region", { name: "Latest evaluation" });

  await expect(latest).toBeVisible();
  await expect(latest.getByText("82/100", { exact: true })).toBeVisible();
  await expect(
    latest.getByText(
      "Latest evidence clearly identifies the intervention path.",
    ),
  ).toBeVisible();
  await expect(latest.getByRole("link", { name: "2222222" })).toHaveAttribute(
    "href",
    "https://github.com/example/main/commit/2222222",
  );

  const trend = page.getByRole("figure", { name: "README Fit score trend" });

  await expect(
    trend.getByRole("link", { name: "1111111" }).first(),
  ).toHaveAttribute("href", "https://github.com/example/main/commit/1111111");
});

test("renders latest dimension evaluation Markdown with prose styling", async ({
  page,
}) => {
  const dimension = buildDimension();
  const markdownEvaluation =
    "Latest **evidence** identifies the intervention path.\n\n- Preserve Director focus";

  await page.route("**/dimensions", async (route) => {
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
          buildDimensionEvaluation({
            dimensionId: dimension.id,
            evaluation: markdownEvaluation,
          }),
        ],
      }),
    });
  });

  await page.goto(`/#/dimensions/${dimension.id}`);

  const latest = page.getByRole("region", { name: "Latest evaluation" });
  const renderedEvaluation = latest.locator(".prose");

  await expect(renderedEvaluation).toHaveClass(/(^|\s)prose(\s|$)/);
  await expect(renderedEvaluation.locator("strong")).toHaveText("evidence");
  await expect(renderedEvaluation.locator("li")).toHaveText(
    "Preserve Director focus",
  );
});

test("renders the AIM brand mark and global controls without optimizer controls", async ({
  page,
}) => {
  const optimizerRequests: string[] = [];

  await page.route("**/optimizer/**", async (route) => {
    optimizerRequests.push(route.request().url());
    await route.abort();
  });

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
  ).toHaveCount(0);
  expect(
    optimizerRequests.filter(
      (url) => new URL(url).pathname === "/api/optimizer/status",
    ),
  ).toEqual([]);
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
