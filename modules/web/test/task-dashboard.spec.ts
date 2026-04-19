import { expect, test } from "@playwright/test";

const buildTask = ({
  done = false,
  spec,
  status = "created",
  taskId,
  updatedAt = "2026-04-19T00:00:00.000Z",
}: {
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
  dependencies: [],
  done,
  status,
  created_at: "2026-04-19T00:00:00.000Z",
  updated_at: updatedAt,
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("aim.serverBaseUrl", "/api");
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

test("falls back to the default remote SERVER_BASE_URL when local storage is empty", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem("aim.serverBaseUrl");
  });

  await page.goto("/");

  await expect(page.getByLabel("SERVER_BASE_URL")).toHaveValue(
    "https://aim.zccz14.com",
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

  await expect(page.getByText("Initial task")).toBeVisible();

  await page.getByLabel("SERVER_BASE_URL").fill("/alt");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Updated task")).toBeVisible();
  await expect(page.getByText("Initial task")).not.toBeVisible();
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

  await expect(page.getByText("Ready task")).toBeVisible();
  await expect(page.getByText("Running task")).toBeVisible();
  await expect(page.getByText("Blocked task")).toBeVisible();
  await expect(page.getByText("Done task")).not.toBeVisible();
  await expect(page.getByText("Failed task")).not.toBeVisible();
});
