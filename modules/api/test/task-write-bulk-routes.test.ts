import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import * as contractModule from "../../contract/src/index.js";
import { createApp } from "../src/app.js";

const routesTempRoot = join(
  process.cwd(),
  ".tmp",
  "modules-api-task-write-bulk-routes",
);

let previousProjectRoot: string | undefined;

const useProjectRoot = async (name: string) => {
  previousProjectRoot = process.env.AIM_PROJECT_ROOT;

  const projectRoot = join(routesTempRoot, name);

  await rm(projectRoot, { force: true, recursive: true });
  await mkdir(projectRoot, { recursive: true });

  process.env.AIM_PROJECT_ROOT = projectRoot;
};

const createBulkPath = (bulkId: string, projectPath: string) =>
  `${contractModule.taskWriteBulkByIdPath.replace(
    "{bulkId}",
    bulkId,
  )}?project_path=${encodeURIComponent(projectPath)}`;

const createEntry = {
  id: "create-contract-doc",
  action: "Create" as const,
  depends_on: [],
  reason: "Manager Report shows missing approval handoff persistence.",
  source: "Manager gap",
  create: {
    candidate_task_spec: "# Persist Task Write Bulk\n\n## Assumptions\n...",
    project_path: "/repo/main",
    dependencies: [],
    verification_route:
      "批准后先经 aim-verify-task-spec 独立校验，通过后再进入 aim-create-tasks。",
  },
  delete: null,
};

afterEach(async () => {
  if (previousProjectRoot === undefined) {
    delete process.env.AIM_PROJECT_ROOT;
  } else {
    process.env.AIM_PROJECT_ROOT = previousProjectRoot;
  }

  previousProjectRoot = undefined;

  await rm(routesTempRoot, { force: true, recursive: true });
});

describe("task write bulk routes", () => {
  it("creates, lists, and reads task write bulks through the API", async () => {
    await useProjectRoot("crud");

    const app = createApp();
    const createResponse = await app.request(
      contractModule.taskWriteBulksPath,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          project_path: "/repo/main",
          bulk_id: "bulk-1",
          content_markdown: "# Task Write Bulk\n\n- id: create-contract-doc",
          entries: [createEntry],
          baseline_ref: "origin/main@abc123",
          source_metadata: [{ key: "manager_report", value: "baseline-1" }],
        }),
      },
    );

    expect(createResponse.status).toBe(201);

    const createdBulk = await createResponse.json();

    expect(
      contractModule.taskWriteBulkSchema.safeParse(createdBulk).success,
    ).toBe(true);
    expect(createdBulk).toMatchObject({
      baseline_ref: "origin/main@abc123",
      bulk_id: "bulk-1",
      entries: [createEntry],
      project_path: "/repo/main",
      source_metadata: [{ key: "manager_report", value: "baseline-1" }],
    });

    const listResponse = await app.request(
      `${contractModule.taskWriteBulksPath}?project_path=${encodeURIComponent(
        "/repo/main",
      )}`,
    );

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual({
      items: [createdBulk],
    });

    const getResponse = await app.request(
      createBulkPath("bulk-1", "/repo/main"),
    );

    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toEqual(createdBulk);
  });

  it("rejects invalid payloads and duplicate project bulk ids", async () => {
    await useProjectRoot("validation");

    const app = createApp();
    const invalidResponse = await app.request(
      contractModule.taskWriteBulksPath,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          project_path: "/repo/main",
          bulk_id: "bulk-1",
        }),
      },
    );

    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toMatchObject({
      code: "TASK_WRITE_BULK_VALIDATION_ERROR",
    });

    const payload = {
      project_path: "/repo/main",
      bulk_id: "bulk-1",
      content_markdown: "# Task Write Bulk",
      entries: [createEntry],
    };

    expect(
      await app.request(contractModule.taskWriteBulksPath, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      }),
    ).toHaveProperty("status", 201);

    const duplicateResponse = await app.request(
      contractModule.taskWriteBulksPath,
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
      code: "TASK_WRITE_BULK_CONFLICT",
    });
  });

  it("requires project_path when listing or reading bulks", async () => {
    await useProjectRoot("requires-project-path");

    const app = createApp();

    const listResponse = await app.request(contractModule.taskWriteBulksPath);
    const getResponse = await app.request(
      contractModule.taskWriteBulkByIdPath.replace("{bulkId}", "bulk-1"),
    );

    expect(listResponse.status).toBe(400);
    expect(getResponse.status).toBe(400);
    await expect(listResponse.json()).resolves.toMatchObject({
      code: "TASK_WRITE_BULK_VALIDATION_ERROR",
    });
    await expect(getResponse.json()).resolves.toMatchObject({
      code: "TASK_WRITE_BULK_VALIDATION_ERROR",
    });
  });
});
