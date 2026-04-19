import { expect, test } from "@playwright/test";

test("boots the dashboard app with Mantine and query providers", async () => {
  const { readFile } = await import("node:fs/promises");
  const mainSource = await readFile(
    `${process.cwd()}/modules/web/src/main.tsx`,
    "utf8",
  );
  const appSource = await readFile(
    `${process.cwd()}/modules/web/src/app.tsx`,
    "utf8",
  );

  expect(mainSource).toContain("@mantine/core/styles.css");
  expect(mainSource).toContain("<MantineProvider>");
  expect(mainSource).toContain("<QueryClientProvider client={webQueryClient}>");
  expect(appSource).toContain(
    "./features/task-dashboard/components/dashboard-page.js",
  );
  expect(appSource).not.toContain("useHealthQuery");
  expect(appSource).not.toContain("CZ-Stack Web");
});
