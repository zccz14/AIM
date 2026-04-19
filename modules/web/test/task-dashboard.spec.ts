import { expect, test } from "@playwright/test";

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
