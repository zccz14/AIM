import {
  type CreateTaskWriteBulkRequest,
  type TaskWriteBulk,
  taskWriteBulkSchema,
} from "@aim-ai/contract";

import { openTaskDatabase } from "./task-database.js";

type TaskWriteBulkRow = {
  baseline_ref: null | string;
  bulk_id: string;
  content_markdown: string;
  created_at: string;
  entries: string;
  project_path: string;
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

type TaskWriteBulkRepositoryOptions = {
  projectRoot?: string;
};

const taskWriteBulksTableName = "task_write_bulks";

const requiredColumns = [
  { name: "project_path", notnull: 1, pk: 1, type: "TEXT" },
  { name: "bulk_id", notnull: 1, pk: 2, type: "TEXT" },
  { name: "content_markdown", notnull: 1, pk: 0, type: "TEXT" },
  { name: "entries", notnull: 1, pk: 0, type: "TEXT" },
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
  new Error("task_write_bulks schema is incompatible");

const mapTaskWriteBulkRow = (row: TaskWriteBulkRow) =>
  taskWriteBulkSchema.parse({
    project_path: row.project_path,
    bulk_id: row.bulk_id,
    content_markdown: row.content_markdown,
    entries: JSON.parse(row.entries) as unknown,
    baseline_ref: row.baseline_ref,
    source_metadata: JSON.parse(row.source_metadata) as Array<{
      key: string;
      value: string;
    }>,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });

const createTaskWriteBulksTable = (
  database: ReturnType<typeof openTaskDatabase>,
) => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ${taskWriteBulksTableName} (
      project_path TEXT NOT NULL,
      bulk_id TEXT NOT NULL,
      content_markdown TEXT NOT NULL,
      entries TEXT NOT NULL,
      baseline_ref TEXT,
      source_metadata TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_path, bulk_id)
    )
  `);
};

const validateTaskWriteBulksTableSchema = (
  database: ReturnType<typeof openTaskDatabase>,
) => {
  const rows = database
    .prepare(`PRAGMA table_info(${taskWriteBulksTableName})`)
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

const bootstrapTaskWriteBulkDatabase = (projectRoot?: string) => {
  const database = openTaskDatabase(projectRoot);

  createTaskWriteBulksTable(database);
  validateTaskWriteBulksTableSchema(database);

  return database;
};

export const createTaskWriteBulkRepository = (
  options: TaskWriteBulkRepositoryOptions = {},
) => {
  const database = bootstrapTaskWriteBulkDatabase(options.projectRoot);
  const insertTaskWriteBulkStatement = database.prepare(`
    INSERT INTO ${taskWriteBulksTableName} (
      project_path,
      bulk_id,
      content_markdown,
      entries,
      baseline_ref,
      source_metadata,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getTaskWriteBulkStatement = database.prepare(`
    SELECT
      project_path,
      bulk_id,
      content_markdown,
      entries,
      baseline_ref,
      source_metadata,
      created_at,
      updated_at
    FROM ${taskWriteBulksTableName}
    WHERE project_path = ? AND bulk_id = ?
  `);
  const listTaskWriteBulksStatement = database.prepare(`
    SELECT
      project_path,
      bulk_id,
      content_markdown,
      entries,
      baseline_ref,
      source_metadata,
      created_at,
      updated_at
    FROM ${taskWriteBulksTableName}
    WHERE project_path = ?
    ORDER BY created_at ASC, rowid ASC
  `);

  return {
    createTaskWriteBulk(
      input: CreateTaskWriteBulkRequest,
    ): Promise<null | TaskWriteBulk> {
      const timestamp = new Date().toISOString();
      const taskWriteBulk = taskWriteBulkSchema.parse({
        project_path: input.project_path,
        bulk_id: input.bulk_id,
        content_markdown: input.content_markdown,
        entries: input.entries,
        baseline_ref: input.baseline_ref ?? null,
        source_metadata: input.source_metadata ?? [],
        created_at: timestamp,
        updated_at: timestamp,
      });

      try {
        insertTaskWriteBulkStatement.run(
          taskWriteBulk.project_path,
          taskWriteBulk.bulk_id,
          taskWriteBulk.content_markdown,
          JSON.stringify(taskWriteBulk.entries),
          taskWriteBulk.baseline_ref,
          JSON.stringify(taskWriteBulk.source_metadata),
          taskWriteBulk.created_at,
          taskWriteBulk.updated_at,
        );
      } catch (error) {
        if (error instanceof Error && error.message.includes("UNIQUE")) {
          return Promise.resolve(null);
        }

        throw error;
      }

      return Promise.resolve(taskWriteBulk);
    },
    getTaskWriteBulk(
      projectPath: string,
      bulkId: string,
    ): Promise<null | TaskWriteBulk> {
      const row = getTaskWriteBulkStatement.get(projectPath, bulkId) as
        | TaskWriteBulkRow
        | undefined;

      return Promise.resolve(row ? mapTaskWriteBulkRow(row) : null);
    },
    listTaskWriteBulks(projectPath: string): Promise<TaskWriteBulk[]> {
      const rows = listTaskWriteBulksStatement.all(
        projectPath,
      ) as TaskWriteBulkRow[];

      return Promise.resolve(rows.map(mapTaskWriteBulkRow));
    },
  };
};
