import {
  type CreateManagerReportRequest,
  type ManagerReport,
  managerReportSchema,
} from "@aim-ai/contract";

import { applySqliteSchema } from "./schema.js";
import { openTaskDatabase } from "./task-database.js";

type ManagerReportRow = {
  baseline_ref: null | string;
  content_markdown: string;
  created_at: string;
  project_path: string;
  report_id: string;
  source_metadata: string;
  updated_at: string;
};

type TableInfoRow = {
  dflt_value: null | string;
  name: string;
  notnull: 0 | 1;
  pk: 0 | 1;
  type: string;
};

type ManagerReportRepositoryOptions = {
  projectRoot?: string;
};

const managerReportsTableName = "manager_reports";

const requiredColumns = [
  { name: "project_path", notnull: 1, pk: 1, type: "TEXT" },
  { name: "report_id", notnull: 1, pk: 2, type: "TEXT" },
  { name: "content_markdown", notnull: 1, pk: 0, type: "TEXT" },
  { name: "baseline_ref", notnull: 0, pk: 0, type: "TEXT" },
  { name: "source_metadata", notnull: 1, pk: 0, type: "TEXT" },
  { name: "created_at", notnull: 1, pk: 0, type: "TEXT" },
  { name: "updated_at", notnull: 1, pk: 0, type: "TEXT" },
] as const;

const normalizeColumnType = (type: string) => {
  const normalizedType = type.trim().toUpperCase();

  if (normalizedType === "TEXT" || normalizedType.startsWith("VARCHAR")) {
    return "TEXT";
  }

  if (normalizedType === "DATETIME") {
    return "TEXT";
  }

  return normalizedType;
};

const buildSchemaError = () =>
  new Error("manager_reports schema is incompatible");

const mapManagerReportRow = (row: ManagerReportRow) =>
  managerReportSchema.parse({
    project_path: row.project_path,
    report_id: row.report_id,
    content_markdown: row.content_markdown,
    baseline_ref: row.baseline_ref,
    source_metadata: JSON.parse(row.source_metadata) as Array<{
      key: string;
      value: string;
    }>,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });

const validateManagerReportsTableSchema = (
  database: ReturnType<typeof openTaskDatabase>,
) => {
  const rows = database
    .prepare(`PRAGMA table_info(${managerReportsTableName})`)
    .all() as TableInfoRow[];

  if (rows.length === 0) {
    throw buildSchemaError();
  }

  const columns = new Map(rows.map((row) => [row.name, row]));

  for (const expectedColumn of requiredColumns) {
    const actualColumn = columns.get(expectedColumn.name);

    if (
      !actualColumn ||
      normalizeColumnType(actualColumn.type) !== expectedColumn.type ||
      (expectedColumn.pk === 0 &&
        actualColumn.notnull !== expectedColumn.notnull) ||
      actualColumn.pk !== expectedColumn.pk
    ) {
      throw buildSchemaError();
    }
  }
};

const bootstrapManagerReportDatabase = (projectRoot?: string) => {
  const database = openTaskDatabase(projectRoot);

  applySqliteSchema(database);
  validateManagerReportsTableSchema(database);

  return database;
};

export const createManagerReportRepository = (
  options: ManagerReportRepositoryOptions = {},
) => {
  const database = bootstrapManagerReportDatabase(options.projectRoot);
  const insertManagerReportStatement = database.prepare(`
    INSERT INTO ${managerReportsTableName} (
      project_path,
      report_id,
      content_markdown,
      baseline_ref,
      source_metadata,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const getManagerReportStatement = database.prepare(`
    SELECT
      project_path,
      report_id,
      content_markdown,
      baseline_ref,
      source_metadata,
      created_at,
      updated_at
    FROM ${managerReportsTableName}
    WHERE project_path = ? AND report_id = ?
  `);
  const listManagerReportsStatement = database.prepare(`
    SELECT
      project_path,
      report_id,
      content_markdown,
      baseline_ref,
      source_metadata,
      created_at,
      updated_at
    FROM ${managerReportsTableName}
    WHERE project_path = ?
    ORDER BY created_at ASC, rowid ASC
  `);

  return {
    createManagerReport(
      input: CreateManagerReportRequest,
    ): Promise<null | ManagerReport> {
      const timestamp = new Date().toISOString();
      const managerReport = managerReportSchema.parse({
        project_path: input.project_path,
        report_id: input.report_id,
        content_markdown: input.content_markdown,
        baseline_ref: input.baseline_ref ?? null,
        source_metadata: input.source_metadata ?? [],
        created_at: timestamp,
        updated_at: timestamp,
      });

      try {
        insertManagerReportStatement.run(
          managerReport.project_path,
          managerReport.report_id,
          managerReport.content_markdown,
          managerReport.baseline_ref,
          JSON.stringify(managerReport.source_metadata),
          managerReport.created_at,
          managerReport.updated_at,
        );
      } catch (error) {
        if (error instanceof Error && error.message.includes("UNIQUE")) {
          return Promise.resolve(null);
        }

        throw error;
      }

      return Promise.resolve(managerReport);
    },
    getManagerReport(
      projectPath: string,
      reportId: string,
    ): Promise<null | ManagerReport> {
      const row = getManagerReportStatement.get(projectPath, reportId) as
        | ManagerReportRow
        | undefined;

      return Promise.resolve(row ? mapManagerReportRow(row) : null);
    },
    listManagerReports(projectPath: string): Promise<ManagerReport[]> {
      const rows = listManagerReportsStatement.all(
        projectPath,
      ) as ManagerReportRow[];

      return Promise.resolve(rows.map(mapManagerReportRow));
    },
  };
};
