import { expect, test } from "@playwright/test";

const getImportSpecifiers = (source: string) =>
  [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(
    ([, specifier]) => specifier,
  );

test.describe("web app", () => {
  test("wraps the app with QueryClientProvider", async () => {
    const { readFile } = await import("node:fs/promises");
    const mainSource = await readFile(
      `${process.cwd()}/modules/web/src/main.tsx`,
      "utf8",
    );

    expect(mainSource).toContain("@tanstack/react-query");
    expect(mainSource).toContain("./lib/query-client.js");
    expect(mainSource).toContain(
      "<QueryClientProvider client={webQueryClient}>",
    );
  });

  test("keeps the web client as a contract-client fetch pass-through", async () => {
    const { readFile } = await import("node:fs/promises");
    const apiClientSource = await readFile(
      `${process.cwd()}/modules/web/src/lib/api-client.ts`,
      "utf8",
    );
    const importSpecifiers = getImportSpecifiers(apiClientSource);

    expect(importSpecifiers).toContain("@cz-stack/contract");
    expect(
      importSpecifiers.some((specifier) =>
        specifier.includes("contract/generated"),
      ),
    ).toBe(false);
    expect(
      importSpecifiers.every(
        (specifier) =>
          specifier === "@cz-stack/contract" || specifier.startsWith("."),
      ),
    ).toBe(true);
    expect(
      importSpecifiers.some((specifier) => specifier.includes("react-query")),
    ).toBe(false);
    expect(apiClientSource).toContain("return createContractClient({");
    expect(apiClientSource).toContain("fetch: (input, init) =>");
    expect(apiClientSource).not.toContain("createContractClient({ baseUrl:");
    expect(apiClientSource).not.toContain("@tanstack/react-query");
    expect(apiClientSource).not.toContain("ContractClientError");
    expect(apiClientSource).not.toContain("WebHealthResult");
    expect(apiClientSource).not.toContain("HealthResponse");
    expect(apiClientSource).not.toContain("HealthError");
    expect(apiClientSource).not.toContain("getHealth()");
  });

  test("merges Request init overrides before rewriting request URLs", async () => {
    const { readFile } = await import("node:fs/promises");
    const apiClientSource = await readFile(
      `${process.cwd()}/modules/web/src/lib/api-client.ts`,
      "utf8",
    );

    expect(apiClientSource).not.toContain("new Request(resolvedUrl, input)");
    expect(apiClientSource).toContain(
      "new Request(resolvedUrl, new Request(input, init))",
    );
  });

  test("keeps health query definitions feature-local", async () => {
    const { readFile } = await import("node:fs/promises");
    const appSource = await readFile(
      `${process.cwd()}/modules/web/src/app.tsx`,
      "utf8",
    );
    const queriesSource = await readFile(
      `${process.cwd()}/modules/web/src/features/health/queries.ts`,
      "utf8",
    );
    const useHealthQuerySource = await readFile(
      `${process.cwd()}/modules/web/src/features/health/use-health-query.ts`,
      "utf8",
    );

    expect(appSource).toContain("./features/health/use-health-query.js");
    expect(appSource).toContain("./features/health/queries.js");
    expect(appSource).not.toContain("./lib/api-client.js");
    expect(appSource).not.toContain("ContractClientError");
    expect(queriesSource).toContain("../../lib/api-client.js");
    expect(queriesSource).toContain("ContractClientError");
    expect(useHealthQuerySource).toContain("./queries.js");
    expect(useHealthQuerySource).not.toContain("../../lib/api-client.js");
    expect(useHealthQuerySource).not.toContain("ContractClientError");
  });

  test("renders health state from the feature query hook", async () => {
    const { readFile } = await import("node:fs/promises");
    const appSource = await readFile(
      `${process.cwd()}/modules/web/src/app.tsx`,
      "utf8",
    );

    expect(appSource).toContain("useHealthQuery");
    expect(appSource).not.toContain("useEffect(");
    expect(appSource).not.toContain("useState(");
    expect(appSource).not.toContain("createWebApiClient()");
    expect(appSource).toContain("let healthContent = null");
    expect(appSource).toContain("if (healthQuery.isPending)");
    expect(appSource).toContain("else if (healthQuery.isError)");
    expect(appSource).toContain("else if (healthQuery.isSuccess)");
  });

  test("keeps the migrated health page on one-shot query behavior", async () => {
    const { readFile } = await import("node:fs/promises");
    const queriesSource = await readFile(
      `${process.cwd()}/modules/web/src/features/health/queries.ts`,
      "utf8",
    );
    const queryClientSource = await readFile(
      `${process.cwd()}/modules/web/src/lib/query-client.ts`,
      "utf8",
    );

    expect(queriesSource).toContain("refetchOnWindowFocus: false");
    expect(queriesSource).toContain("refetchOnReconnect: false");
    expect(queryClientSource).not.toContain("refetchOnWindowFocus");
    expect(queryClientSource).not.toContain("refetchOnReconnect");
  });

  test("loads the health status from the contract-driven client via the /api prefix", async ({
    page,
  }) => {
    const requests: string[] = [];

    await page.route("**/api/health", async (route) => {
      requests.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok" }),
      });
    });

    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "CZ-Stack Web" }),
    ).toBeVisible();
    await expect(page.getByText("API health: ok")).toBeVisible();
    expect(requests.length).toBeGreaterThan(0);
    expect(
      requests.every((requestUrl) => requestUrl.endsWith("/api/health")),
    ).toBe(true);
  });

  test("shows the shared error state when the /api-prefixed health request fails", async ({
    page,
  }) => {
    const requests: string[] = [];

    await page.route("**/api/health", async (route) => {
      requests.push(route.request().url());
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: "UNAVAILABLE", message: "offline" }),
      });
    });

    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "CZ-Stack Web" }),
    ).toBeVisible();
    await expect(page.getByText("API unavailable: offline")).toBeVisible();
    expect(requests.length).toBeGreaterThan(0);
    expect(
      requests.every((requestUrl) => requestUrl.endsWith("/api/health")),
    ).toBe(true);
  });
});
