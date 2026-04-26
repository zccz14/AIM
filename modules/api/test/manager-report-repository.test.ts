import { access, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";
import { managerReportSchema } from "../../contract/src/index.js";

import { createManagerReportRepository } from "../src/manager-report-repository.js";

type TableInfoRow = {
  name: string;
  notnull: 0 | 1;
  pk: 0 | 1;
  type: string;
};

const tempRoot = join(process.cwd(), ".tmp", "modules-api-manager-reports");

const createProjectRoot = async (name: string) => {
  const projectRoot = join(tempRoot, name);

  await rm(projectRoot, { force: true, recursive: true });
  await mkdir(projectRoot, { recursive: true });

  return projectRoot;
};

afterEach(async () => {
  delete process.env.AIM_PROJECT_ROOT;
  await rm(tempRoot, { force: true, recursive: true });
});

describe("manager report repository", () => {
  it("creates aim.sqlite and the manager_reports table", async () => {
    const projectRoot = await createProjectRoot(
      "creates-manager-reports-table",
    );
    const databasePath = join(projectRoot, "aim.sqlite");

    await expect(access(databasePath)).rejects.toThrow();

    const repository = createManagerReportRepository({ projectRoot });

    await repository.listManagerReports("/repo/main");

    await expect(access(databasePath)).resolves.toBeUndefined();

    const database = new DatabaseSync(databasePath);
    const columns = database
      .prepare("PRAGMA table_info(manager_reports)")
      .all() as TableInfoRow[];
    database.close();

    expect(columns.map((column) => column.name)).toEqual([
      "project_path",
      "report_id",
      "content_markdown",
      "baseline_ref",
      "source_metadata",
      "created_at",
      "updated_at",
    ]);
    expect(
      columns.find((column) => column.name === "project_path"),
    ).toMatchObject({
      notnull: 1,
      pk: 1,
      type: "TEXT",
    });
    expect(columns.find((column) => column.name === "report_id")).toMatchObject(
      {
        notnull: 1,
        pk: 2,
        type: "TEXT",
      },
    );
  });

  it("closes its database when an await using scope exits", async () => {
    const projectRoot = await createProjectRoot("await-using-closes-db");
    let repository:
      | ReturnType<typeof createManagerReportRepository>
      | undefined;

    await (async () => {
      await using scopedRepository = createManagerReportRepository({
        projectRoot,
      });

      repository = scopedRepository;
      await scopedRepository.listManagerReports("/repo/main");
    })();

    await expect(async () => {
      await repository?.listManagerReports("/repo/main");
    }).rejects.toThrow(/closed|finalized|open/i);
  });

  it("creates, reads, and lists reports by project path and report id", async () => {
    const projectRoot = await createProjectRoot("crud");
    const repository = createManagerReportRepository({ projectRoot });

    const firstReport = await repository.createManagerReport({
      project_path: "/repo/main",
      report_id: "baseline-1",
      content_markdown: "# Manager Report\n\nShip API persistence.",
      baseline_ref: "origin/main@abc123",
      source_metadata: [
        { key: "director", value: "readme" },
        { key: "task_pool", value: "2026-04-25" },
      ],
    });
    const secondReport = await repository.createManagerReport({
      project_path: "/repo/main",
      report_id: "baseline-2",
      content_markdown: "# Manager Report\n\nNext pass.",
    });
    await repository.createManagerReport({
      project_path: "/repo/other",
      report_id: "baseline-1",
      content_markdown: "# Manager Report\n\nOther project.",
    });

    expect(managerReportSchema.safeParse(firstReport).success).toBe(true);
    expect(firstReport).toMatchObject({
      baseline_ref: "origin/main@abc123",
      content_markdown: "# Manager Report\n\nShip API persistence.",
      project_path: "/repo/main",
      report_id: "baseline-1",
      source_metadata: [
        { key: "director", value: "readme" },
        { key: "task_pool", value: "2026-04-25" },
      ],
    });
    await expect(
      repository.getManagerReport("/repo/main", "baseline-1"),
    ).resolves.toEqual(firstReport);
    await expect(repository.listManagerReports("/repo/main")).resolves.toEqual([
      firstReport,
      secondReport,
    ]);
  });

  it("rejects duplicate report ids within the same project", async () => {
    const projectRoot = await createProjectRoot("duplicates");
    const repository = createManagerReportRepository({ projectRoot });

    await repository.createManagerReport({
      project_path: "/repo/main",
      report_id: "baseline-1",
      content_markdown: "# Manager Report",
    });

    await expect(
      repository.createManagerReport({
        project_path: "/repo/main",
        report_id: "baseline-1",
        content_markdown: "# Manager Report\n\nDuplicate.",
      }),
    ).resolves.toBeNull();
  });
});
