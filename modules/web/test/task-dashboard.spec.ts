import { expect, type Page, test } from "@playwright/test";

const currentBaselineCommitSha = "10c965007a9682b212c6531f148a30f98cad3d2c";

const buildTask = ({
  dependencies = [],
  done = false,
  gitOriginUrl = "https://github.com/example/main.git",
  projectId = "00000000-0000-4000-8000-000000000010",
  result = "",
  sourceBaselineFreshness = {
    current_commit: "abc1234",
    source_commit: "abc1234",
    status: "current",
    summary: "Task source baseline matches current origin/main abc1234",
  },
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
  sourceBaselineFreshness?: {
    current_commit: string | null;
    source_commit: string | null;
    status: "current" | "stale" | "unknown";
    summary: string;
  };
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
  global_provider_id: "anthropic",
  global_model_id: "claude-sonnet-4-5",
  session_id: null,
  worktree_path: null,
  pull_request_url: null,
  dependencies,
  result,
  source_metadata: {},
  source_baseline_freshness: sourceBaselineFreshness,
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

const buildDirectorClarification = ({
  clarificationId = "clarification-1",
  createdAt = "2026-04-28T10:00:00.000Z",
  dimensionId = null,
  kind = "clarification",
  message = "Clarify whether the README fit gap should be prioritized.",
  projectId = "00000000-0000-4000-8000-000000000010",
  status = "open",
}: {
  clarificationId?: string;
  createdAt?: string;
  dimensionId?: string | null;
  kind?: "clarification" | "adjustment";
  message?: string;
  projectId?: string;
  status?: "open" | "addressed" | "dismissed";
} = {}) => ({
  id: clarificationId,
  project_id: projectId,
  dimension_id: dimensionId,
  kind,
  message,
  status,
  created_at: createdAt,
  updated_at: createdAt,
});

const routeProjectOptimizerStatus = async (
  page: Page,
  currentBaseline: string | null,
) => {
  await page.route("**/api/projects/*/optimizer/status", async (route) => {
    const projectId =
      new URL(route.request().url()).pathname.split("/").at(3) ??
      "00000000-0000-4000-8000-000000000010";

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        project_id: projectId,
        optimizer_enabled: true,
        runtime_active: true,
        blocker_summary: null,
        current_baseline_commit_sha: currentBaseline,
      }),
    });
  });
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("aim.serverBaseUrl", "/api");
    window.localStorage.setItem("aim.web.locale", "en");
  });

  await page.route("**/api/tasks**", async (route) => {
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

  await page.route("**/api/projects**", async (route) => {
    if (new URL(route.request().url()).pathname.includes("/director/")) {
      await route.fallback();
      return;
    }

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

  await page.route(
    "**/api/projects/*/director/clarifications",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            buildDirectorClarification({
              message: "Clarify whether target-gap coverage needs a replan.",
            }),
          ],
        }),
      });
    },
  );

  await page.route("**/api/dimensions**", async (route) => {
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

  await page.route("**/api/dimensions/*/evaluations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [buildDimensionEvaluation()] }),
    });
  });

  await page.route("**/api/task_write_bulks**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.route("**/api/opencode/sessions**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            session_id: "ses_pending_review",
            state: "pending",
            value: "Waiting on required checks.",
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
  await expect(
    page.getByText("Pending 1 / Resolved 1 / Rejected 1"),
  ).toBeVisible();
  await expect(page.getByText("OpenCode Pending")).toHaveCount(0);
  await expect(page.getByText("OpenCode Resolved")).toHaveCount(0);
  await expect(page.getByText("OpenCode Rejected")).toHaveCount(0);

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

test("submits a project Director clarification and shows recent request status", async ({
  page,
}) => {
  const requests: unknown[] = [];
  let clarifications = [
    buildDirectorClarification({
      clarificationId: "clarification-existing",
      message: "Clarify whether target-gap coverage needs a replan.",
    }),
  ];

  await page.route(
    "**/api/projects/*/director/clarifications",
    async (route) => {
      if (route.request().method() === "POST") {
        const payload = JSON.parse(route.request().postData() ?? "{}") as {
          dimension_id?: string | null;
          kind: "clarification" | "adjustment";
          message: string;
          project_id: string;
        };

        requests.push(payload);
        const createdClarification = buildDirectorClarification({
          clarificationId: "clarification-created",
          createdAt: "2026-04-28T11:00:00.000Z",
          dimensionId: payload.dimension_id ?? null,
          kind: payload.kind,
          message: payload.message,
          projectId: payload.project_id,
        });
        clarifications = [createdClarification, ...clarifications];

        await route.fulfill({
          contentType: "application/json",
          status: 201,
          body: JSON.stringify(createdClarification),
        });
        return;
      }

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ items: clarifications }),
      });
    },
  );

  await page.goto("/#/projects/00000000-0000-4000-8000-000000000010");

  const panel = page.getByRole("region", {
    name: "Director clarification requests",
  });

  await expect(panel).toBeVisible();
  await expect(
    panel.getByText("Clarify whether target-gap coverage needs a replan."),
  ).toBeVisible();
  await expect(panel.getByText("open", { exact: true }).first()).toBeVisible();
  await panel.getByLabel("Request type").selectOption("adjustment");
  await panel
    .getByLabel("Request message")
    .fill("Adjust the next scan toward baseline freshness evidence.");
  await panel.getByRole("button", { name: "Send request" }).click();

  await expect(panel.getByText("Request recorded")).toBeVisible();
  await expect(
    panel.getByText("Adjust the next scan toward baseline freshness evidence."),
  ).toBeVisible();
  await expect
    .poll(() => requests)
    .toEqual([
      {
        project_id: "00000000-0000-4000-8000-000000000010",
        dimension_id: null,
        kind: "adjustment",
        message: "Adjust the next scan toward baseline freshness evidence.",
      },
    ]);
});

test("shows actionable API errors and keeps the Director clarification panel mobile safe", async ({
  page,
}) => {
  await page.setViewportSize({ height: 800, width: 390 });
  await page.route(
    "**/api/projects/*/director/clarifications",
    async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          contentType: "application/json",
          status: 503,
          body: JSON.stringify({
            code: "DIRECTOR_CLARIFICATION_VALIDATION_ERROR",
            message: "Director clarification store is temporarily unavailable.",
          }),
        });
        return;
      }

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ items: [] }),
      });
    },
  );

  await page.goto("/#/projects/00000000-0000-4000-8000-000000000010");

  const panel = page.getByRole("region", {
    name: "Director clarification requests",
  });

  await expect(panel).toBeVisible();
  await expect(
    panel.getByText("No recent Director clarification requests"),
  ).toBeVisible();
  await panel
    .getByLabel("Request message")
    .fill("Clarify the rejected feedback recovery path.");
  await panel.getByRole("button", { name: "Send request" }).click();

  await expect(
    panel.getByText("Clarification request failed", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText("Director clarification store is temporarily unavailable."),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});

test("shows task source baseline freshness for current, stale, and missing metadata", async ({
  page,
}) => {
  await page.route("**/api/tasks**", async (route) => {
    const doneFilter = new URL(route.request().url()).searchParams.get("done");

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items:
          doneFilter === "true"
            ? []
            : [
                buildTask({
                  spec: "Current source baseline task",
                  taskId: "task-current-source",
                }),
                buildTask({
                  sourceBaselineFreshness: {
                    current_commit: "fc284b9aa5ff780228c625011d4714f9e6771622",
                    source_commit: "45eeecbf2a0c2d33dd9dd4896fc8dd6d6b9ded13",
                    status: "stale",
                    summary:
                      "Task source baseline 45eeecbf2a0c2d33dd9dd4896fc8dd6d6b9ded13 differs from current origin/main fc284b9aa5ff780228c625011d4714f9e6771622",
                  },
                  spec: "Stale source baseline task",
                  taskId: "task-stale-source",
                }),
                buildTask({
                  sourceBaselineFreshness: {
                    current_commit: "fc284b9aa5ff780228c625011d4714f9e6771622",
                    source_commit: null,
                    status: "unknown",
                    summary:
                      "Task source baseline metadata is missing latest_origin_main_commit",
                  },
                  spec: "Missing source baseline task",
                  taskId: "task-missing-source",
                }),
              ],
      }),
    });
  });

  await page.goto("/#/tasks/task-current-source");
  await expect(page.getByText("Source Baseline: current")).toBeVisible();

  await page.goto("/#/tasks/task-stale-source");
  await expect(page.getByText("Source Baseline: stale")).toBeVisible();
  await expect(
    page.getByText(
      "Task source baseline 45eeecbf2a0c2d33dd9dd4896fc8dd6d6b9ded13 differs from current origin/main fc284b9aa5ff780228c625011d4714f9e6771622",
    ),
  ).toBeVisible();

  await page.goto("/#/tasks/task-missing-source");
  await expect(page.getByText("Source Baseline: unknown")).toBeVisible();
  await expect(
    page.getByText(
      "Task source baseline metadata is missing latest_origin_main_commit",
    ),
  ).toBeVisible();
});

test("shows project optimizer config and runtime observability separately", async ({
  page,
}) => {
  await page.route("**/api/projects**", async (route) => {
    if (new URL(route.request().url()).pathname.includes("/director/")) {
      await route.fallback();
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [buildProject({ optimizerEnabled: true })],
      }),
    });
  });
  await page.route("**/api/projects/*/optimizer/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        project_id: "00000000-0000-4000-8000-000000000010",
        optimizer_enabled: true,
        runtime_active: false,
        blocker_summary:
          "Optimizer lane developer_follow_up error: gh failed with token [REDACTED]. Check optimizer logs and fix the lane blocker before expecting new scans.",
        recent_events: [
          {
            event: "failure",
            lane_name: "developer",
            summary:
              "Developer lane failed for task task-lane-history: gh failed. Fix the task session blocker and retry assignment.",
            task_id: "task-lane-history",
            timestamp: "2026-04-29T10:00:00.000Z",
          },
          {
            event: "idle",
            lane_name: "coordinator",
            summary:
              "Coordinator lane idle: coordinator session already active.",
            timestamp: "2026-04-29T09:59:00.000Z",
          },
        ],
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
  await expect(optimizerRegion.getByText("Triggers")).toHaveCount(0);
  await expect(optimizerRegion.getByText("Recent event")).toHaveCount(0);
  await expect(optimizerRegion.getByText("Recent scan")).toHaveCount(0);
  await expect(optimizerRegion.getByText("Recent lane events")).toBeVisible();
  await expect(optimizerRegion.getByText("developer failure")).toBeVisible();
  await expect(optimizerRegion.getByText("coordinator idle")).toBeVisible();
  await expect(
    optimizerRegion.getByText("Fix the task session blocker"),
  ).toBeVisible();
  await expect(
    optimizerRegion.getByText("task-lane-history", { exact: true }),
  ).toBeVisible();
  await expect(optimizerRegion.getByText("Check optimizer logs")).toBeVisible();
  await expect(optimizerRegion.getByText("[REDACTED]")).toBeVisible();
  await expect(optimizerRegion.getByText("ghp_1234567890")).toHaveCount(0);
});

test("summarizes when the main target gap is already covered by unfinished tasks", async ({
  page,
}) => {
  await page.route("**/api/tasks**", async (route) => {
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
  await page.route("**/api/dimensions/*/evaluations", async (route) => {
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
  await page.route("**/api/tasks**", async (route) => {
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
  await page.route("**/api/dimensions/*/evaluations", async (route) => {
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

test("labels a dimension evaluation as current when it matches the baseline", async ({
  page,
}) => {
  await routeProjectOptimizerStatus(page, currentBaselineCommitSha);
  await page.route("**/api/dimensions/*/evaluations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          buildDimensionEvaluation({ commitSha: currentBaselineCommitSha }),
        ],
      }),
    });
  });

  await page.goto("/");

  const report = page.getByRole("region", { name: "AIM Dimension report" });

  await expect(report.getByText("Current baseline evaluated")).toBeVisible();
  await expect(
    report.getByText("Evaluation commit: 10c965007a96"),
  ).toBeVisible();

  await page.getByRole("button", { name: "README Fit" }).click();

  const freshness = page.getByRole("region", {
    name: "Current baseline evaluated",
  });

  await expect(freshness).toBeVisible();
  await expect(
    freshness.getByText(
      "Latest evaluation matches the current origin/main baseline.",
    ),
  ).toBeVisible();
  await expect(
    freshness.getByRole("link", { name: currentBaselineCommitSha }).first(),
  ).toHaveAttribute(
    "href",
    `https://github.com/example/main/commit/${currentBaselineCommitSha}`,
  );
});

test("labels a dimension evaluation as stale when it is behind the baseline", async ({
  page,
}) => {
  await routeProjectOptimizerStatus(page, currentBaselineCommitSha);
  await page.route("**/api/dimensions/*/evaluations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [buildDimensionEvaluation({ commitSha: "abc1234" })],
      }),
    });
  });

  await page.goto("/#/dimensions/dimension-readme-fit");

  const freshness = page.getByRole("region", {
    name: "Stale baseline evaluation",
  });

  await expect(freshness).toBeVisible();
  await expect(
    freshness.getByText("10c965007a9682b212c6531f148a30f98cad3d2c"),
  ).toBeVisible();
  await expect(freshness.getByText("abc1234")).toBeVisible();
  await expect(
    freshness.getByText("should be treated as historical signal only"),
  ).toBeVisible();

  const trend = page.getByRole("figure", { name: "README Fit score trend" });

  await expect(
    trend.getByRole("link", { name: "abc1234" }).first(),
  ).toHaveAttribute("href", "https://github.com/example/main/commit/abc1234");
});

test("labels a dimension as missing when the current baseline has no evaluation", async ({
  page,
}) => {
  await routeProjectOptimizerStatus(page, currentBaselineCommitSha);
  await page.route("**/api/dimensions/*/evaluations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.goto("/#/dimensions/dimension-readme-fit");

  const freshness = page.getByRole("region", {
    name: "No current baseline evaluation",
  });

  await expect(freshness).toBeVisible();
  await expect(freshness.getByText(currentBaselineCommitSha)).toBeVisible();
  await expect(freshness.getByText("Evaluation commit: None")).toBeVisible();
  await expect(
    freshness.getByText("this dimension has no evaluation for it yet"),
  ).toBeVisible();
});

test("labels dimension freshness as unknown when the baseline is unavailable", async ({
  page,
}) => {
  await routeProjectOptimizerStatus(page, null);
  await page.route("**/api/dimensions/*/evaluations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [buildDimensionEvaluation({ commitSha: "abc1234" })],
      }),
    });
  });

  await page.goto("/#/dimensions/dimension-readme-fit");

  const freshness = page.getByRole("region", { name: "Unknown baseline" });

  await expect(freshness).toBeVisible();
  await expect(freshness.getByText("Current baseline: None")).toBeVisible();
  await expect(freshness.getByText("abc1234")).toBeVisible();
  await expect(
    freshness.getByText("evaluation freshness cannot be classified"),
  ).toBeVisible();
});

test("keeps project management available on the Projects page", async ({
  page,
}) => {
  let projects = [buildProject()];
  const requests: string[] = [];

  await page.route("**/api/projects**", async (route) => {
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
  const longContinuePrompt = [
    "Continue with required checks follow-up.",
    "Review the required check timeline before deciding whether to wait or intervene.",
    "Preserve the exact token prompt-tail-8f92c7 when the field is expanded.",
  ].join("\n");
  const longValue = [
    "Waiting on required checks.",
    "The latest run is still pending on the platform queue.",
    "Preserve the exact token value-tail-4b7a21 when the field is expanded.",
  ].join("\n");
  const longReason = [
    "Spec no longer matches origin/main.",
    "The task references an obsolete dashboard route after the latest baseline refresh.",
    "Preserve the exact token reason-tail-93fd10 when the field is expanded.",
  ].join("\n");

  await page.route("**/api/opencode/sessions**", async (route) => {
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
            value: longValue,
            reason: null,
            continue_prompt: longContinuePrompt,
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
            reason: longReason,
            continue_prompt: null,
            provider_id: null,
            model_id: null,
            stale: false,
            created_at: "2026-04-25T08:00:00.000Z",
            updated_at: "2026-04-25T09:00:00.000Z",
          },
          {
            session_id: "ses_prompt_only",
            state: "resolved",
            value: null,
            reason: null,
            continue_prompt: "Continue the prompt-only session.",
            provider_id: "anthropic",
            model_id: "claude-opus-4-5",
            stale: false,
            created_at: "2026-04-24T08:00:00.000Z",
            updated_at: "2026-04-24T09:00:00.000Z",
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
    sessionsRegion.getByText("Pending 1 / Resolved 2 / Rejected 1", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    sessionsRegion.getByText("Pending Sessions", { exact: true }),
  ).toHaveCount(0);
  await expect(
    sessionsRegion.getByText("Resolved Sessions", { exact: true }),
  ).toHaveCount(0);
  await expect(
    sessionsRegion.getByText("Rejected Sessions", { exact: true }),
  ).toHaveCount(0);
  const pendingReviewRow = sessionsRegion.getByRole("row", {
    name: /ses_pending_review/,
  });
  await expect(pendingReviewRow).toBeVisible();
  await expect(
    sessionsRegion.getByText("Pending", { exact: true }),
  ).toBeVisible();
  await expect(
    sessionsRegion.getByText("Stale", { exact: true }),
  ).toBeVisible();
  await expect(
    pendingReviewRow.getByText("Continue prompt ready"),
  ).toBeVisible();
  await expect(
    sessionsRegion.getByText("Continue with required checks follow-up."),
  ).toBeVisible();
  await expect(sessionsRegion.getByText("prompt-tail-8f92c7")).toBeHidden();
  await expect(
    sessionsRegion.getByText("Waiting on required checks."),
  ).toBeVisible();
  await expect(sessionsRegion.getByText("value-tail-4b7a21")).toBeHidden();
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
    sessionsRegion.getByRole("button", { name: /PR merged and baseline/ }),
  ).toHaveCount(0);
  await expect(
    sessionsRegion.getByRole("row", { name: /ses_rejected_scope/ }),
  ).toBeVisible();
  await expect(
    sessionsRegion.getByText("Spec no longer matches origin/main."),
  ).toBeVisible();
  await expect(sessionsRegion.getByText("reason-tail-93fd10")).toBeHidden();
  const promptOnlyRow = sessionsRegion.getByRole("row", {
    name: /ses_prompt_only/,
  });
  await expect(promptOnlyRow).toBeVisible();
  await expect(
    promptOnlyRow.getByText("Continue the prompt-only session."),
  ).toBeVisible();
  await expect(promptOnlyRow.getByText("None", { exact: true })).toHaveCount(0);
  await sessionsRegion.getByRole("button", { name: /Continue prompt/ }).click();
  await expect(sessionsRegion.getByText("prompt-tail-8f92c7")).toBeVisible();
  await sessionsRegion.getByRole("button", { name: /Value/ }).click();
  await expect(sessionsRegion.getByText("value-tail-4b7a21")).toBeVisible();
  await sessionsRegion.getByRole("button", { name: /Reason/ }).click();
  await expect(sessionsRegion.getByText("reason-tail-93fd10")).toBeVisible();
  await sessionsRegion.getByRole("button", { name: /Reason/ }).click();
  await expect(sessionsRegion.getByText("reason-tail-93fd10")).toBeHidden();
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

  await page.route("**/api/dimensions**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [dimension] }),
    });
  });

  await page.route("**/api/dimensions/*/evaluations", async (route) => {
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

  await page.route("**/api/dimensions", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [dimension] }),
    });
  });

  await page.route("**/api/dimensions/*/evaluations", async (route) => {
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

  await page.route("**/api/dimensions", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [dimension] }),
    });
  });

  await page.route("**/api/dimensions/*/evaluations", async (route) => {
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

  await page.route("**/api/optimizer/**", async (route) => {
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
