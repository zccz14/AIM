import { expect, test } from "@playwright/test";

const buildTask = ({
  dependencies = [],
  done = false,
  spec,
  status = "created",
  taskId,
  updatedAt = "2026-04-19T00:00:00.000Z",
}: {
  dependencies?: string[];
  done?: boolean;
  spec: string;
  status?: string;
  taskId: string;
  updatedAt?: string;
}) => ({
  task_id: taskId,
  task_spec: spec,
  session_id: null,
  worktree_path: null,
  pull_request_url: null,
  dependencies,
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

test("opens the shared task drawer from overview and table", async ({
  page,
}) => {
  await page.goto("/");

  await page
    .getByRole("button", { name: /stub task spec/i })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "Task Details" }),
  ).toBeVisible();
  await expect(page.getByText("Contract Status")).toBeVisible();

  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("row", { name: /stub task spec/i }).click();
  await expect(
    page.getByRole("dialog", { name: "Task Details" }),
  ).toBeVisible();
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

test("opens the shared task drawer from a graph node", async ({ page }) => {
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

  await expect(
    page.getByRole("dialog", { name: "Task Details" }),
  ).toBeVisible();
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
