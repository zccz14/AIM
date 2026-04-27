import { access, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";
import { taskWriteBulkSchema } from "../../contract/src/index.js";

import { createTaskWriteBulkRepository } from "../src/task-write-bulk-repository.js";

type TableInfoRow = {
  name: string;
  notnull: 0 | 1;
  pk: 0 | 1;
  type: string;
};

const tempRoot = join(process.cwd(), ".tmp", "modules-api-task-write-bulks");

const createProjectRoot = async (name: string) => {
  const projectRoot = join(tempRoot, name);

  await rm(projectRoot, { force: true, recursive: true });
  await mkdir(projectRoot, { recursive: true });

  return projectRoot;
};

const createEntry = {
  id: "create-contract-doc",
  action: "Create" as const,
  depends_on: [],
  reason: "Dimension evaluation shows missing approval handoff persistence.",
  source: "Dimension evaluation gap",
  create: {
    candidate_task_spec: "# Persist Task Write Bulk\n\n## Assumptions\n...",
    project_path: "/repo/main",
    dependencies: ["task-a"],
    verification_route:
      "批准后先经 aim-verify-task-spec 独立校验，通过后再进入 aim-create-tasks。",
  },
  delete: null,
};

const deleteEntry = {
  id: "delete-obsolete-task",
  action: "Delete" as const,
  depends_on: ["create-contract-doc"],
  reason: "Existing unfinished task is superseded by a clearer candidate.",
  source: "Task Pool conflict",
  create: null,
  delete: {
    target_task_id: "00000000-0000-0000-0000-000000000000",
    delete_reason: "旧 Task 目标与当前维度评估方向冲突。",
    replacement: "create-contract-doc",
  },
};

afterEach(async () => {
  delete process.env.AIM_PROJECT_ROOT;
  await rm(tempRoot, { force: true, recursive: true });
});

describe("task write bulk repository", () => {
  it("creates aim.sqlite and the task_write_bulks table", async () => {
    const projectRoot = await createProjectRoot("creates-table");
    const databasePath = join(projectRoot, "aim.sqlite");

    await expect(access(databasePath)).rejects.toThrow();

    const repository = createTaskWriteBulkRepository({ projectRoot });

    await repository.listTaskWriteBulks("/repo/main");

    await expect(access(databasePath)).resolves.toBeUndefined();

    const database = new DatabaseSync(databasePath);
    const columns = database
      .prepare("PRAGMA table_info(task_write_bulks)")
      .all() as TableInfoRow[];
    database.close();

    expect(columns.map((column) => column.name)).toEqual([
      "project_id",
      "bulk_id",
      "content_markdown",
      "entries",
      "baseline_ref",
      "source_metadata",
      "created_at",
      "updated_at",
    ]);
    expect(
      columns.find((column) => column.name === "project_id"),
    ).toMatchObject({
      notnull: 1,
      pk: 1,
      type: "TEXT",
    });
    expect(columns.find((column) => column.name === "bulk_id")).toMatchObject({
      notnull: 1,
      pk: 2,
      type: "TEXT",
    });
  });

  it("closes its database when an await using scope exits", async () => {
    const projectRoot = await createProjectRoot("await-using-closes-db");
    let repository:
      | ReturnType<typeof createTaskWriteBulkRepository>
      | undefined;

    await (async () => {
      await using scopedRepository = createTaskWriteBulkRepository({
        projectRoot,
      });

      repository = scopedRepository;
      await scopedRepository.listTaskWriteBulks("/repo/main");
    })();

    await expect(async () => {
      await repository?.listTaskWriteBulks("/repo/main");
    }).rejects.toThrow(/closed|finalized|open/i);
  });

  it("creates, reads, and lists bulks by project path and bulk id", async () => {
    const projectRoot = await createProjectRoot("crud");
    const repository = createTaskWriteBulkRepository({ projectRoot });

    const firstBulk = await repository.createTaskWriteBulk({
      project_path: "/repo/main",
      bulk_id: "bulk-1",
      content_markdown: "# Task Write Bulk\n\n- id: create-contract-doc",
      entries: [createEntry, deleteEntry],
      baseline_ref: "origin/main@abc123",
      source_metadata: [{ key: "dimension_evaluation", value: "eval-1" }],
    });
    const secondBulk = await repository.createTaskWriteBulk({
      project_path: "/repo/main",
      bulk_id: "bulk-2",
      content_markdown: "# Task Write Bulk\n\n- id: create-next",
      entries: [createEntry],
    });
    await repository.createTaskWriteBulk({
      project_path: "/repo/other",
      bulk_id: "bulk-1",
      content_markdown: "# Task Write Bulk\n\nOther project.",
      entries: [createEntry],
    });

    expect(taskWriteBulkSchema.safeParse(firstBulk).success).toBe(true);
    expect(firstBulk).toMatchObject({
      baseline_ref: "origin/main@abc123",
      bulk_id: "bulk-1",
      content_markdown: "# Task Write Bulk\n\n- id: create-contract-doc",
      project_path: "/repo/main",
      source_metadata: [{ key: "dimension_evaluation", value: "eval-1" }],
      entries: [createEntry, deleteEntry],
    });
    await expect(
      repository.getTaskWriteBulk("/repo/main", "bulk-1"),
    ).resolves.toEqual(firstBulk);
    await expect(repository.listTaskWriteBulks("/repo/main")).resolves.toEqual([
      firstBulk,
      secondBulk,
    ]);
  });

  it("rejects duplicate bulk ids within the same project", async () => {
    const projectRoot = await createProjectRoot("duplicates");
    const repository = createTaskWriteBulkRepository({ projectRoot });

    await repository.createTaskWriteBulk({
      project_path: "/repo/main",
      bulk_id: "bulk-1",
      content_markdown: "# Task Write Bulk",
      entries: [createEntry],
    });

    await expect(
      repository.createTaskWriteBulk({
        project_path: "/repo/main",
        bulk_id: "bulk-1",
        content_markdown: "# Task Write Bulk\n\nDuplicate.",
        entries: [createEntry],
      }),
    ).resolves.toBeNull();
  });
});
