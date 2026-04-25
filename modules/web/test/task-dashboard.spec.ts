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

const buildManagerReport = ({
  baselineRef = "origin/main",
  contentMarkdown = "# Direction\n\nKeep convergence calm and evidence-led.",
  createdAt = "2026-04-19T00:00:06.000Z",
  projectPath = "/repo/dashboard",
  reportId = "manager-report-1",
  updatedAt = createdAt,
}: {
  baselineRef?: string | null;
  contentMarkdown?: string;
  createdAt?: string;
  projectPath?: string;
  reportId?: string;
  updatedAt?: string;
} = {}) => ({
  project_path: projectPath,
  report_id: reportId,
  content_markdown: contentMarkdown,
  baseline_ref: baselineRef,
  source_metadata: [],
  created_at: createdAt,
  updated_at: updatedAt,
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

  await page.route("**/task_write_bulks**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.route("**/manager_reports**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [buildManagerReport()],
      }),
    });
  });
});

test("renders the overview landing view", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Methodology Hub" }),
  ).toBeVisible();
  await expect(
    page.locator(".summary-grid").getByText("Task Pool"),
  ).toBeVisible();
  await expect(page.getByText("Status Board")).toBeVisible();
  await expect(page.getByText("Task Pool Decision Signals")).toBeVisible();
  await expect(page.getByText("Completed Result Activity")).toBeVisible();
  await expect(page.getByText("Recent Active Tasks")).toBeVisible();
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
  ).toBeVisible();
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
    page.locator(".summary-grid").getByText("Task Pool"),
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
  await expect(page.getByTestId("graph-node-task-active-ready")).toBeVisible();
  await expect(
    page.getByTestId("graph-node-task-history-succeeded"),
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
    .locator(".rejected-feedback-card")
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
    .getByLabel("Reason category")
    .selectOption("scheduler_session");
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
  await expect(page.getByRole("heading", { name: "AIM" })).toBeVisible();
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
      const surface = document.querySelector(".aim-surface");
      const panel = document.querySelector(".aim-task-panel");
      const metadataLabel = document.querySelector(".aim-task-meta-row dt");
      const markdown = document.querySelector(".aim-task-markdown");
      const chip = document.querySelector(".aim-task-chip");

      if (!surface || !panel || !metadataLabel || !markdown || !chip) {
        throw new Error("Expected task details theme elements to render");
      }

      return {
        chipBackground: getComputedStyle(chip).backgroundColor,
        markdownColor: getComputedStyle(markdown).color,
        metadataColor: getComputedStyle(metadataLabel).color,
        panelBackground: getComputedStyle(panel).backgroundColor,
        surfaceColor: getComputedStyle(surface).color,
      };
    });

  const darkStyles = await readDetailsStyles();
  expect(
    Object.values(darkStyles).every((value) => value.includes("oklch")),
  ).toBe(true);

  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await expect.poll(readDetailsStyles).not.toEqual(darkStyles);
});

test("toggles create task AIM form colors with the app theme", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Task" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const readCreateStyles = async () =>
    page.evaluate(() => {
      const surface = document.querySelector(".aim-surface");
      const input = document.querySelector("#create-task-project-path");
      const select = document.querySelector("#create-task-developer-model");
      const helper = document.querySelector(".aim-task-form-footer .aim-muted");

      if (!surface || !input || !select || !helper) {
        throw new Error("Expected create task theme elements to render");
      }

      return {
        helperColor: getComputedStyle(helper).color,
        inputBackground: getComputedStyle(input).backgroundColor,
        inputColor: getComputedStyle(input).color,
        selectBackground: getComputedStyle(select).backgroundColor,
        surfaceColor: getComputedStyle(surface).color,
      };
    });

  const darkStyles = await readCreateStyles();
  expect(
    Object.values(darkStyles).every((value) => value.includes("oklch")),
  ).toBe(true);

  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await expect.poll(readCreateStyles).not.toEqual(darkStyles);
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

test("lists Manager Reports from the visible task project paths", async ({
  page,
}) => {
  const requestedProjectPaths: string[] = [];

  await page.route("**/manager_reports**", async (route) => {
    const requestUrl = new URL(route.request().url());

    requestedProjectPaths.push(
      requestUrl.searchParams.get("project_path") ?? "",
    );

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          buildManagerReport({
            baselineRef: "origin/main@manager",
            contentMarkdown:
              "# Manager Direction\n\nCoordinate the next slice.",
            reportId: "manager-report-visible",
          }),
        ],
      }),
    });
  });

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Manager Reports" }),
  ).toBeVisible();
  await expect(page.getByText("manager-report-visible")).toBeVisible();
  await expect(page.getByText("origin/main@manager")).toBeVisible();
  expect(requestedProjectPaths).toEqual(["/repo/dashboard"]);
});

test("opens a read-only Manager Report detail reader", async ({ page }) => {
  await page.route("**/manager_reports**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          buildManagerReport({
            baselineRef: "origin/main@handoff",
            contentMarkdown:
              "# Handoff Direction\n\n- Preserve quiet evidence density.\n- Avoid task writes.",
            createdAt: "2026-04-19T00:00:07.000Z",
            reportId: "manager-report-detail",
          }),
        ],
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Read Report" }).click();

  await expect(page).toHaveURL(
    /\/#\/manager-reports\/%2Frepo%2Fdashboard\/manager-report-detail$/,
  );
  await expect(
    page.getByRole("heading", { level: 2, name: "manager-report-detail" }),
  ).toBeVisible();
  await expect(
    page.getByText("Baseline Ref: origin/main@handoff"),
  ).toBeVisible();
  await expect(
    page.getByText("Created At: 2026-04-19T00:00:07.000Z"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Handoff Direction" }),
  ).toBeVisible();
  await expect(page.getByText("Avoid task writes.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /create manager report/i }),
  ).toHaveCount(0);
});

test("opens and closes the create task page from the dashboard header", async ({
  page,
}) => {
  await page.goto("/");

  const headerCreateTaskButton = page.getByRole("button", {
    name: "Create Task",
  });

  await headerCreateTaskButton.click();

  await expect(page).toHaveURL(/\/#\/tasks\/new$/);
  await expect(
    page.getByRole("heading", { name: "Create Task" }),
  ).toBeVisible();
  await expect(page.getByLabel("Task Spec")).toBeVisible();
  await expect(page.getByLabel("Project Path")).toBeVisible();

  await page.getByLabel("Task Spec").fill("Draft task spec");
  await expect(
    page.getByRole("button", { name: "Create Task" }),
  ).toBeDisabled();
  await page.getByLabel("Project Path").fill("/repo/dashboard");

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/#\/$/);

  await headerCreateTaskButton.click();
  await expect(page.getByLabel("Task Spec")).toHaveValue("");
  await expect(page.getByLabel("Project Path")).toHaveValue("");
});

test("submits title, task_spec, project_path, and selected developer model to the task API", async ({
  page,
}) => {
  let createRequestBodyText: null | string = null;

  await page.route("**/tasks**", async (route) => {
    if (route.request().method() === "POST") {
      createRequestBodyText = route.request().postData();

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(
          buildTask({
            spec: "Ship create flow",
            taskId: "task-created",
          }),
        ),
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Create Task" }).click();
  await expect(page).toHaveURL(/\/#\/tasks\/new$/);
  await page.getByLabel("Title").fill("Ship create flow");
  await page.getByLabel("Task Spec").fill("Ship create flow");
  await page.getByLabel("Project Path").fill("/repo/dashboard");
  await page.getByLabel("Developer Model").selectOption("openai::gpt-5.5");
  await page.getByRole("button", { name: "Create Task" }).click();

  await expect
    .poll(() => createRequestBodyText)
    .toEqual(
      JSON.stringify({
        title: "Ship create flow",
        task_spec: "Ship create flow",
        project_path: "/repo/dashboard",
        developer_provider_id: "openai",
        developer_model_id: "gpt-5.5",
      }),
    );
});

test("uses a saved developer model preference only when it is still available", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "aim.createTaskDeveloperModel",
      JSON.stringify({ providerId: "openai", modelId: "gpt-5.5" }),
    );
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Create Task" }).click();

  await expect(page.getByLabel("Developer Model")).toHaveValue(
    "openai::gpt-5.5",
  );
});

test("shows a local create error when the task API rejects the request", async ({
  page,
}) => {
  let finishCreateRequest: null | (() => Promise<void>) = null;

  await page.route("**/tasks**", async (route) => {
    if (route.request().method() === "POST") {
      await new Promise<void>((resolve) => {
        finishCreateRequest = async () => {
          await route.fulfill({
            status: 422,
            contentType: "application/json",
            body: JSON.stringify({
              code: "TASK_VALIDATION_ERROR",
              message: "task_spec cannot be blank",
            }),
          });
          resolve();
        };
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Create Task" }).click();
  await expect(page).toHaveURL(/\/#\/tasks\/new$/);
  await page.getByLabel("Title").fill("Ship create flow");
  await page.getByLabel("Task Spec").fill("Ship create flow");
  await page.getByLabel("Project Path").fill("/repo/dashboard");
  await page.getByRole("button", { name: "Create Task" }).click();

  await expect(page.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Back to Dashboard" }),
  ).toBeDisabled();
  await expect(page).toHaveURL(/\/#\/tasks\/new$/);

  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/#\/tasks\/new$/);

  await page.mouse.click(8, 8);
  await expect(page).toHaveURL(/\/#\/tasks\/new$/);

  if (finishCreateRequest === null) {
    throw new Error("Expected the create request to be pending");
  }

  await finishCreateRequest();

  await expect(
    page.getByText("Task creation failed: task_spec cannot be blank"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Create Task" }),
  ).toBeVisible();
});

test("brands the create flow with guidance and a dedicated feedback panel", async ({
  page,
}) => {
  await page.route("**/tasks**", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          code: "TASK_VALIDATION_ERROR",
          message: "task_spec cannot be blank",
        }),
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Create Task" }).click();

  await expect(page.getByText("Task Brief")).toBeVisible();
  await expect(page.getByText("Workspace Target")).toBeVisible();
  await expect(page.getByText("Submission Checklist")).toBeVisible();

  await page.getByLabel("Title").fill("Ship create flow");
  await page.getByLabel("Task Spec").fill("Ship create flow");
  await page.getByLabel("Project Path").fill("/repo/dashboard");
  await page.getByRole("button", { name: "Create Task" }).click();

  await expect(page.getByText("Request Blocked")).toBeVisible();
  await expect(
    page.getByText("Task creation failed: task_spec cannot be blank"),
  ).toBeVisible();
});

test("navigates from create page to task details after refresh", async ({
  page,
}) => {
  let listRequestCount = 0;

  await page.route("**/tasks**", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(
          buildTask({
            spec: "Create release checklist\n- draft notes\n- notify team",
            taskId: "task-created",
          }),
        ),
      });
      return;
    }

    listRequestCount += 1;

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items:
          listRequestCount === 1
            ? [
                buildTask({
                  spec: "Existing task",
                  taskId: "task-existing",
                }),
              ]
            : [
                buildTask({
                  spec: "Existing task",
                  taskId: "task-existing",
                }),
                buildTask({
                  spec: "Create release checklist\n- draft notes\n- notify team",
                  taskId: "task-created",
                }),
              ],
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Create Task" }).click();
  await page.getByLabel("Title").fill("Create release checklist");
  await page
    .getByLabel("Task Spec")
    .fill("Create release checklist\n- draft notes\n- notify team");
  await page.getByLabel("Project Path").fill("/repo/dashboard");
  await page.getByRole("button", { name: "Create Task" }).click();

  await expect(page).toHaveURL(/\/#\/tasks\/task-created$/);
  await expect(page.getByText("Task ID: task-created")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Create release checklist" }),
  ).toBeVisible();
  await expect(page.getByText("Task Spec", { exact: true })).toBeVisible();
  await expect(page.getByText("draft notes")).toBeVisible();
  await expect(page.getByText("notify team")).toBeVisible();
  await expect(page.getByText("Project Path: /repo/dashboard")).toBeVisible();
  await page.getByRole("button", { name: "Back to Dashboard" }).click();
  await expect(
    page.getByRole("row", { name: /Create release checklist/i }),
  ).toBeVisible();
  await expect.poll(() => listRequestCount).toBe(4);
});

test("opens created task details from the create response when the dashboard refresh fails", async ({
  page,
}) => {
  let listRequestCount = 0;

  await page.route("**/tasks**", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(
          buildTask({
            spec: "Fallback task title\n- still visible after refresh failure",
            taskId: "task-created",
          }),
        ),
      });
      return;
    }

    listRequestCount += 1;

    if (listRequestCount === 1) {
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
      return;
    }

    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "TASK_VALIDATION_ERROR",
        message: "refresh unavailable",
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Create Task" }).click();
  await page.getByLabel("Title").fill("Fallback task title");
  await page
    .getByLabel("Task Spec")
    .fill("Fallback task title\n- still visible after refresh failure");
  await page.getByLabel("Project Path").fill("/repo/dashboard");
  await page.getByRole("button", { name: "Create Task" }).click();

  await expect(page).toHaveURL(/\/#\/tasks\/task-created$/);
  await expect(page.getByText("Task ID: task-created")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Fallback task title" }),
  ).toBeVisible();
  await expect(page.getByText("Task Spec", { exact: true })).toBeVisible();
  await expect(
    page.getByText("still visible after refresh failure"),
  ).toBeVisible();
  await expect(page.getByText("Project Path: /repo/dashboard")).toBeVisible();
  await expect.poll(() => listRequestCount).toBe(4);
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

test("renders the dependency graph with status-colored nodes", async ({
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

  await expect(page.getByText("Dependency Graph")).toBeVisible();
  await expect(page.getByTestId("graph-node-task-123")).toContainText(
    "Processing",
  );
  await expect(page.getByTestId("graph-node-task-123")).toHaveCSS(
    "border-color",
    "oklch(0.77 0.12 85)",
  );
  await expect(page.getByTestId("graph-node-task-456")).toContainText(
    "Processing",
  );
  await expect(page.getByTestId("graph-node-task-456")).toHaveCSS(
    "border-color",
    "oklch(0.77 0.12 85)",
  );
  await expect(page.getByTestId("rf__edge-task-123-task-456")).toHaveCount(1);
  await expect(page.getByLabel("Edge from task-123 to task-456")).toHaveCount(
    1,
  );
  await expect(page.getByLabel("Edge from task-456 to task-123")).toHaveCount(
    0,
  );
});

test("lays out prerequisites to the left of dependents", async ({ page }) => {
  await page.route("**/tasks**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          buildTask({
            dependencies: ["task-123"],
            spec: "Dependent task",
            taskId: "task-456",
          }),
          buildTask({
            spec: "Prerequisite task",
            taskId: "task-123",
          }),
        ],
      }),
    });
  });

  await page.goto("/");

  const prerequisiteNode = page.getByTestId("graph-node-task-123");
  const dependentNode = page.getByTestId("graph-node-task-456");

  const prerequisiteBox = await prerequisiteNode.boundingBox();
  const dependentBox = await dependentNode.boundingBox();

  if (prerequisiteBox === null || dependentBox === null) {
    throw new Error("Expected graph nodes to have visible bounding boxes");
  }

  expect(prerequisiteBox.x).toBeLessThan(dependentBox.x);
});

test("lays out branching dependencies by depth across multiple columns", async ({
  page,
}) => {
  await page.route("**/tasks**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          buildTask({
            dependencies: ["task-456", "task-789"],
            spec: "Release task",
            taskId: "task-999",
          }),
          buildTask({
            dependencies: ["task-123"],
            spec: "Backend task",
            taskId: "task-456",
          }),
          buildTask({
            spec: "Root task",
            taskId: "task-123",
          }),
          buildTask({
            dependencies: ["task-123"],
            spec: "Frontend task",
            taskId: "task-789",
          }),
        ],
      }),
    });
  });

  await page.goto("/");

  const rootBox = await page.getByTestId("graph-node-task-123").boundingBox();
  const backendBox = await page
    .getByTestId("graph-node-task-456")
    .boundingBox();
  const frontendBox = await page
    .getByTestId("graph-node-task-789")
    .boundingBox();
  const releaseBox = await page
    .getByTestId("graph-node-task-999")
    .boundingBox();

  if (
    rootBox === null ||
    backendBox === null ||
    frontendBox === null ||
    releaseBox === null
  ) {
    throw new Error("Expected graph nodes to have visible bounding boxes");
  }

  expect(rootBox.x).toBeLessThan(backendBox.x);
  expect(rootBox.x).toBeLessThan(frontendBox.x);
  expect(backendBox.x).toBeLessThan(releaseBox.x);
  expect(frontendBox.x).toBeLessThan(releaseBox.x);
});

test("opens the task details page from a graph node", async ({ page }) => {
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
  await page.getByTestId("graph-node-task-123").click();

  await expect(page).toHaveURL(/\/#\/tasks\/task-123$/);
  await expect(page.getByText("Task ID: task-123")).toBeVisible();
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
  await expect(page.getByText("Dependency Graph")).toBeVisible();
  const shellStyles = await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="dashboard-shell"]');
    const tableHeader = document.querySelector(
      '[data-testid="dashboard-table-header"]',
    );
    const graphNode = document.querySelector(
      '[data-testid="graph-node-task-123"]',
    );

    if (!shell || !tableHeader || !graphNode) {
      throw new Error("Expected readable dark-mode data view elements");
    }

    return [shell, tableHeader, graphNode].map(
      (element) => getComputedStyle(element).backgroundColor,
    );
  });

  expect(shellStyles.every((value) => value.includes("oklch"))).toBe(true);
});
