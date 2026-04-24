import { expect, test } from "@playwright/test";

const buildTask = ({
  dependencies = [],
  done = false,
  result = "",
  spec,
  status = "created",
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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("aim.serverBaseUrl", "/api");
  });

  await page.route("**/tasks", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          buildTask({
            spec: "stub task spec",
            taskId: "task-123",
          }),
          buildTask({
            dependencies: ["task-123"],
            spec: "blocked task spec",
            status: "waiting_assumptions",
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
});

test("renders the overview landing view", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Task Dashboard" }),
  ).toBeVisible();
  await expect(page.getByText("Total Tasks")).toBeVisible();
  await expect(page.getByText("Status Board")).toBeVisible();
  await expect(page.getByText("Recent Activity")).toBeVisible();
  await expect(page.getByText("Recent Active Tasks")).toBeVisible();
});

test("renders the AIM brand mark and favicon entrypoint", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByAltText("AIM icon")).toBeVisible();
  await expect(page.getByRole("heading", { name: "AIM" })).toBeVisible();
  await expect(
    page.getByText("Mission control for autonomous builds"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Task Dashboard" }),
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
  await page.route("**/tasks", async (route) => {
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
  await page.route("**/tasks", async (route) => {
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

  await page.route("**/tasks", async (route) => {
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

  await page.getByRole("button", { name: "Refresh" }).click();

  await expect.poll(() => dashboardRequestCount).toBe(2);
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
  await expect(page).toHaveURL(/\/tasks\/task-123$/);
  await expect(
    page.getByText("Contract Status", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Back to Dashboard" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("row", { name: /stub task spec/i }).click();
  await expect(page).toHaveURL(/\/tasks\/task-123$/);
});

test("opens and closes the create task page from the dashboard header", async ({
  page,
}) => {
  await page.goto("/");

  const headerCreateTaskButton = page.getByRole("button", {
    name: "Create Task",
  });

  await headerCreateTaskButton.click();

  await expect(page).toHaveURL(/\/tasks\/new$/);
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
  await expect(page).toHaveURL(/\/$/);

  await headerCreateTaskButton.click();
  await expect(page.getByLabel("Task Spec")).toHaveValue("");
  await expect(page.getByLabel("Project Path")).toHaveValue("");
});

test("submits title, task_spec, project_path, and selected developer model to the task API", async ({
  page,
}) => {
  let createRequestBodyText: null | string = null;

  await page.route("**/tasks", async (route) => {
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
  await expect(page).toHaveURL(/\/tasks\/new$/);
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

  await page.route("**/tasks", async (route) => {
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
  await expect(page).toHaveURL(/\/tasks\/new$/);
  await page.getByLabel("Title").fill("Ship create flow");
  await page.getByLabel("Task Spec").fill("Ship create flow");
  await page.getByLabel("Project Path").fill("/repo/dashboard");
  await page.getByRole("button", { name: "Create Task" }).click();

  await expect(page.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Back to Dashboard" }),
  ).toBeDisabled();
  await expect(page).toHaveURL(/\/tasks\/new$/);

  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/tasks\/new$/);

  await page.mouse.click(8, 8);
  await expect(page).toHaveURL(/\/tasks\/new$/);

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
  await page.route("**/tasks", async (route) => {
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

  await page.route("**/tasks", async (route) => {
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

  await expect(page).toHaveURL(/\/tasks\/task-created$/);
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
  await expect.poll(() => listRequestCount).toBe(2);
});

test("opens created task details from the create response when the dashboard refresh fails", async ({
  page,
}) => {
  let listRequestCount = 0;

  await page.route("**/tasks", async (route) => {
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

  await expect(page).toHaveURL(/\/tasks\/task-created$/);
  await expect(page.getByText("Task ID: task-created")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Fallback task title" }),
  ).toBeVisible();
  await expect(page.getByText("Task Spec", { exact: true })).toBeVisible();
  await expect(
    page.getByText("still visible after refresh failure"),
  ).toBeVisible();
  await expect(page.getByText("Project Path: /repo/dashboard")).toBeVisible();
  await expect.poll(() => listRequestCount).toBe(2);
});

test("uses the first task_spec line as the task title while keeping the full body in details", async ({
  page,
}) => {
  await page.route("**/tasks", async (route) => {
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
  await page.route("**/tasks", async (route) => {
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
  await page.route("**/tasks", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            ...buildTask({
              dependencies: ["task-ops", "task-release"],
              spec: "Branded task title\n\n## Summary\n\n- clarify ownership",
              status: "running",
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

test("renders the dependency graph with status-colored nodes", async ({
  page,
}) => {
  await page.route("**/tasks", async (route) => {
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
            status: "waiting_assumptions",
            taskId: "task-456",
          }),
        ],
      }),
    });
  });

  await page.goto("/");

  await expect(page.getByText("Dependency Graph")).toBeVisible();
  await expect(page.getByTestId("graph-node-task-123")).toContainText("Ready");
  await expect(page.getByTestId("graph-node-task-123")).toHaveCSS(
    "border-color",
    "rgb(34, 139, 230)",
  );
  await expect(page.getByTestId("graph-node-task-456")).toContainText(
    "Blocked",
  );
  await expect(page.getByTestId("graph-node-task-456")).toHaveCSS(
    "border-color",
    "rgb(240, 140, 0)",
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
  await page.route("**/tasks", async (route) => {
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
  await page.route("**/tasks", async (route) => {
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
  await page.route("**/tasks", async (route) => {
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
            status: "waiting_assumptions",
            taskId: "task-456",
          }),
        ],
      }),
    });
  });

  await page.goto("/");
  await page.getByTestId("graph-node-task-123").click();

  await expect(page).toHaveURL(/\/tasks\/task-123$/);
  await expect(page.getByText("Task ID: task-123")).toBeVisible();
});

test("shows a clear error state when the task request fails", async ({
  page,
}) => {
  await page.route("**/tasks", async (route) => {
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
  await page.route("**/tasks", async (route) => {
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
    page.getByRole("button", { exact: true, name: "Initial task" }),
  ).toBeVisible();

  await page.getByLabel("SERVER_BASE_URL").fill("/alt");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(
    page.getByRole("button", { exact: true, name: "Updated task" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { exact: true, name: "Initial task" }),
  ).toHaveCount(0);
});

test("keeps only active tasks in Recent Active Tasks", async ({ page }) => {
  await page.route("**/tasks", async (route) => {
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
            status: "running",
            taskId: "task-running",
            updatedAt: "2026-04-19T00:00:02.000Z",
          }),
          buildTask({
            spec: "Blocked task",
            status: "waiting_assumptions",
            taskId: "task-blocked",
            updatedAt: "2026-04-19T00:00:03.000Z",
          }),
          buildTask({
            done: true,
            spec: "Done task",
            status: "succeeded",
            taskId: "task-done",
            updatedAt: "2026-04-19T00:00:04.000Z",
          }),
          buildTask({
            done: true,
            spec: "Failed task",
            status: "failed",
            taskId: "task-failed",
            updatedAt: "2026-04-19T00:00:05.000Z",
          }),
        ],
      }),
    });
  });

  await page.goto("/");

  await expect(
    page.getByRole("button", { exact: true, name: "Ready task" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { exact: true, name: "Running task" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { exact: true, name: "Blocked task" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { exact: true, name: "Done task" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { exact: true, name: "Failed task" }),
  ).toHaveCount(0);
});

test("renders a branded decision workspace with readable dark-mode data views", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByText("Mission control for autonomous builds"),
  ).toBeVisible();
  await expect(page.getByText("Status Board")).toBeVisible();
  await expect(page.getByText("Recent Active Tasks")).toBeVisible();
  await expect(page.getByText("Dependency Graph")).toBeVisible();
  await expect(page.getByTestId("dashboard-shell")).toHaveCSS(
    "background-color",
    "rgb(7, 17, 31)",
  );
  await expect(page.getByTestId("dashboard-table-header")).toHaveCSS(
    "background-color",
    "rgba(15, 23, 42, 0.96)",
  );
  await expect(page.getByTestId("graph-node-task-123")).toHaveCSS(
    "background-color",
    "rgba(15, 23, 42, 0.96)",
  );
});
