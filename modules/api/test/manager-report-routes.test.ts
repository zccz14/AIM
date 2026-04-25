import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import * as contractModule from "../../contract/src/index.js";
import { createApp } from "../src/app.js";

const routesTempRoot = join(
  process.cwd(),
  ".tmp",
  "modules-api-manager-report-routes",
);

let previousProjectRoot: string | undefined;

const useProjectRoot = async (name: string) => {
  previousProjectRoot = process.env.AIM_PROJECT_ROOT;

  const projectRoot = join(routesTempRoot, name);

  await rm(projectRoot, { force: true, recursive: true });
  await mkdir(projectRoot, { recursive: true });

  process.env.AIM_PROJECT_ROOT = projectRoot;
};

const createReportPath = (reportId: string, projectPath: string) =>
  `${contractModule.managerReportByIdPath.replace(
    "{reportId}",
    reportId,
  )}?project_path=${encodeURIComponent(projectPath)}`;

afterEach(async () => {
  if (previousProjectRoot === undefined) {
    delete process.env.AIM_PROJECT_ROOT;
  } else {
    process.env.AIM_PROJECT_ROOT = previousProjectRoot;
  }

  previousProjectRoot = undefined;

  await rm(routesTempRoot, { force: true, recursive: true });
});

describe("manager report routes", () => {
  it("creates, lists, and reads manager reports through the API", async () => {
    await useProjectRoot("crud");

    const app = createApp();
    const createResponse = await app.request(
      contractModule.managerReportsPath,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          project_path: "/repo/main",
          report_id: "baseline-1",
          content_markdown: "# Manager Report\n\nPersist through SQLite.",
          baseline_ref: "origin/main@abc123",
          source_metadata: [{ key: "readme", value: "README.md" }],
        }),
      },
    );

    expect(createResponse.status).toBe(201);

    const createdReport = await createResponse.json();

    expect(
      contractModule.managerReportSchema.safeParse(createdReport).success,
    ).toBe(true);
    expect(createdReport).toMatchObject({
      baseline_ref: "origin/main@abc123",
      project_path: "/repo/main",
      report_id: "baseline-1",
      source_metadata: [{ key: "readme", value: "README.md" }],
    });

    const listResponse = await app.request(
      `${contractModule.managerReportsPath}?project_path=${encodeURIComponent(
        "/repo/main",
      )}`,
    );

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual({
      items: [createdReport],
    });

    const getResponse = await app.request(
      createReportPath("baseline-1", "/repo/main"),
    );

    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toEqual(createdReport);
  });

  it("rejects invalid payloads and duplicate project report ids", async () => {
    await useProjectRoot("validation");

    const app = createApp();
    const invalidResponse = await app.request(
      contractModule.managerReportsPath,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          project_path: "/repo/main",
          report_id: "baseline-1",
        }),
      },
    );

    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toMatchObject({
      code: "MANAGER_REPORT_VALIDATION_ERROR",
    });

    const payload = {
      project_path: "/repo/main",
      report_id: "baseline-1",
      content_markdown: "# Manager Report",
    };

    expect(
      await app.request(contractModule.managerReportsPath, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      }),
    ).toHaveProperty("status", 201);

    const duplicateResponse = await app.request(
      contractModule.managerReportsPath,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    expect(duplicateResponse.status).toBe(409);
    await expect(duplicateResponse.json()).resolves.toMatchObject({
      code: "MANAGER_REPORT_CONFLICT",
    });
  });

  it("requires project_path when listing or reading reports", async () => {
    await useProjectRoot("requires-project-path");

    const app = createApp();

    const listResponse = await app.request(contractModule.managerReportsPath);
    const getResponse = await app.request(
      contractModule.managerReportByIdPath.replace("{reportId}", "baseline-1"),
    );

    expect(listResponse.status).toBe(400);
    expect(getResponse.status).toBe(400);
    await expect(listResponse.json()).resolves.toMatchObject({
      code: "MANAGER_REPORT_VALIDATION_ERROR",
    });
    await expect(getResponse.json()).resolves.toMatchObject({
      code: "MANAGER_REPORT_VALIDATION_ERROR",
    });
  });
});
