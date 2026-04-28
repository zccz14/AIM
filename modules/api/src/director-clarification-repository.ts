import { randomUUID } from "node:crypto";

import {
  type CreateDirectorClarificationRequest,
  type DirectorClarification,
  directorClarificationSchema,
} from "@aim-ai/contract";

import { applySqliteSchema } from "./schema.js";
import {
  createTaskDatabaseAsyncDispose,
  openTaskDatabase,
} from "./task-database.js";

type DirectorClarificationRow = {
  created_at: string;
  dimension_id: string | null;
  id: string;
  kind: string;
  message: string;
  project_id: string;
  status: string;
  updated_at: string;
};

type DimensionIdentityRow = {
  id: string;
  project_id: string;
};

type TableInfoRow = {
  name: string;
  notnull: 0 | 1;
  pk: 0 | 1;
  type: string;
};

type DirectorClarificationRepositoryOptions = {
  projectRoot?: string;
};

const directorClarificationsTableName = "director_clarifications";

const directorClarificationColumns = [
  { name: "id", notnull: 1, pk: 1, type: "TEXT" },
  { name: "project_id", notnull: 1, pk: 0, type: "TEXT" },
  { name: "dimension_id", notnull: 0, pk: 0, type: "TEXT" },
  { name: "kind", notnull: 1, pk: 0, type: "TEXT" },
  { name: "message", notnull: 1, pk: 0, type: "TEXT" },
  { name: "status", notnull: 1, pk: 0, type: "TEXT" },
  { name: "created_at", notnull: 1, pk: 0, type: "TEXT" },
  { name: "updated_at", notnull: 1, pk: 0, type: "TEXT" },
] as const;

const normalizeColumnType = (type: string) => {
  const normalizedType = type.trim().toUpperCase();

  if (normalizedType === "TEXT" || normalizedType.startsWith("VARCHAR")) {
    return "TEXT";
  }

  return normalizedType;
};

const validateTableSchema = (
  database: ReturnType<typeof openTaskDatabase>,
  tableName: string,
  requiredColumns: readonly {
    name: string;
    notnull: 0 | 1;
    pk: 0 | 1;
    type: string;
  }[],
) => {
  const rows = database
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as TableInfoRow[];

  if (rows.length === 0) {
    throw new Error("director clarifications schema is incompatible");
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
      throw new Error("director clarifications schema is incompatible");
    }
  }
};

const mapDirectorClarificationRow = (row: DirectorClarificationRow) =>
  directorClarificationSchema.parse({
    id: row.id,
    project_id: row.project_id,
    dimension_id: row.dimension_id,
    kind: row.kind,
    message: row.message,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });

const bootstrapDirectorClarificationDatabase = (projectRoot?: string) => {
  const database = openTaskDatabase(projectRoot);

  database.exec("PRAGMA foreign_keys = ON");
  applySqliteSchema(database);
  validateTableSchema(
    database,
    directorClarificationsTableName,
    directorClarificationColumns,
  );

  return database;
};

export const createDirectorClarificationRepository = (
  options: DirectorClarificationRepositoryOptions = {},
) => {
  const database = bootstrapDirectorClarificationDatabase(options.projectRoot);
  const asyncDisposeDatabase = createTaskDatabaseAsyncDispose(database);
  const insertDirectorClarificationStatement = database.prepare(`
    INSERT INTO ${directorClarificationsTableName} (
      id,
      project_id,
      dimension_id,
      kind,
      message,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const listDirectorClarificationsStatement = database.prepare(`
    SELECT id, project_id, dimension_id, kind, message, status, created_at, updated_at
    FROM ${directorClarificationsTableName}
    WHERE project_id = ?
    ORDER BY created_at ASC, rowid ASC
  `);
  const getProjectByIdStatement = database.prepare(`
    SELECT id
    FROM projects
    WHERE id = ?
  `);
  const getDimensionByIdStatement = database.prepare(`
    SELECT id, project_id
    FROM dimensions
    WHERE id = ?
  `);

  return {
    [Symbol.asyncDispose]: asyncDisposeDatabase,
    createDirectorClarification(
      input: CreateDirectorClarificationRequest,
    ): Promise<DirectorClarification> {
      const timestamp = new Date().toISOString();
      const directorClarification = directorClarificationSchema.parse({
        id: randomUUID(),
        project_id: input.project_id,
        dimension_id: input.dimension_id ?? null,
        kind: input.kind,
        message: input.message,
        status: "open",
        created_at: timestamp,
        updated_at: timestamp,
      });

      insertDirectorClarificationStatement.run(
        directorClarification.id,
        directorClarification.project_id,
        directorClarification.dimension_id,
        directorClarification.kind,
        directorClarification.message,
        directorClarification.status,
        directorClarification.created_at,
        directorClarification.updated_at,
      );

      return Promise.resolve(directorClarification);
    },
    getDimensionIdentity(
      dimensionId: string,
    ): Promise<DimensionIdentityRow | null> {
      const row = getDimensionByIdStatement.get(dimensionId) as
        | DimensionIdentityRow
        | undefined;

      return Promise.resolve(row ?? null);
    },
    hasProject(projectId: string): Promise<boolean> {
      const row = getProjectByIdStatement.get(projectId) as
        | { id: string }
        | undefined;

      return Promise.resolve(Boolean(row));
    },
    listDirectorClarifications(
      projectId: string,
    ): Promise<DirectorClarification[]> {
      const rows = listDirectorClarificationsStatement.all(
        projectId,
      ) as DirectorClarificationRow[];

      return Promise.resolve(rows.map(mapDirectorClarificationRow));
    },
  };
};
