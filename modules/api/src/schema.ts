import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";

const schemaSql = readFileSync(
  new URL("./schema.sql", import.meta.url),
  "utf8",
);
const schemaStatements = schemaSql
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);

const execSchemaStatements = (
  database: DatabaseSync,
  predicate: (statement: string) => boolean,
) => {
  for (const statement of schemaStatements) {
    if (predicate(statement)) {
      database.exec(`${statement};`);
    }
  }
};

type TableInfoRow = { name: string };

const tableColumns = (database: DatabaseSync, tableName: string) =>
  new Set(
    (
      database
        .prepare(`PRAGMA table_info(${tableName})`)
        .all() as TableInfoRow[]
    ).map((row) => row.name),
  );

export const migrateSqliteProjectPathSchema = (database: DatabaseSync) => {
  database.exec("PRAGMA foreign_keys = OFF;");
  try {
    const taskColumns = tableColumns(database, "tasks");
    if (
      taskColumns.has("project_path") &&
      taskColumns.has("developer_provider_id") &&
      taskColumns.has("developer_model_id")
    ) {
      const projectIdExpression = taskColumns.has("project_id")
        ? "COALESCE(project_id, project_path)"
        : "project_path";
      database.exec(`
        INSERT OR IGNORE INTO projects (id, name, project_path, global_provider_id, global_model_id, created_at, updated_at)
        SELECT DISTINCT project_path, project_path, project_path, developer_provider_id, developer_model_id, created_at, updated_at
        FROM tasks
        WHERE project_path IS NOT NULL
      `);
      database.exec("ALTER TABLE tasks RENAME TO tasks_legacy_project_path");
      database.exec(`
        CREATE TABLE tasks (
          task_id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          task_spec TEXT NOT NULL,
          project_id TEXT NOT NULL,
          developer_provider_id TEXT NOT NULL,
          developer_model_id TEXT NOT NULL,
          session_id TEXT,
          worktree_path TEXT,
          pull_request_url TEXT,
          dependencies TEXT NOT NULL,
          result TEXT NOT NULL DEFAULT '',
          done INTEGER NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
      `);
      database.exec(`
        INSERT INTO tasks (task_id, title, task_spec, project_id, developer_provider_id, developer_model_id, session_id, worktree_path, pull_request_url, dependencies, result, done, status, created_at, updated_at)
        SELECT task_id, title, task_spec, ${projectIdExpression}, developer_provider_id, developer_model_id, session_id, worktree_path, pull_request_url, dependencies, result, done, status, created_at, updated_at
        FROM tasks_legacy_project_path
      `);
      database.exec("DROP TABLE tasks_legacy_project_path");
    }

    const dimensionColumns = tableColumns(database, "dimensions");
    if (dimensionColumns.has("project_path")) {
      database.exec(`
        INSERT OR IGNORE INTO projects (id, name, project_path, global_provider_id, global_model_id, created_at, updated_at)
        SELECT DISTINCT project_path, project_path, project_path, '', '', created_at, updated_at
        FROM dimensions
        WHERE project_path IS NOT NULL
      `);
      database.exec(
        "ALTER TABLE dimensions RENAME TO dimensions_legacy_project_path",
      );
      database.exec(`
        CREATE TABLE dimensions (
          id TEXT NOT NULL PRIMARY KEY,
          project_id TEXT NOT NULL,
          name TEXT NOT NULL,
          goal TEXT NOT NULL,
          evaluation_method TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
      `);
      database.exec(`
        INSERT INTO dimensions (id, project_id, name, goal, evaluation_method, created_at, updated_at)
        SELECT id, project_path, name, goal, evaluation_method, created_at, updated_at
        FROM dimensions_legacy_project_path
      `);
      database.exec("DROP TABLE dimensions_legacy_project_path");
    }

    const evaluationColumns = tableColumns(database, "dimension_evaluations");
    if (evaluationColumns.has("project_path")) {
      database.exec(`
        INSERT OR IGNORE INTO projects (id, name, project_path, global_provider_id, global_model_id, created_at, updated_at)
        SELECT DISTINCT project_path, project_path, project_path, '', '', created_at, created_at
        FROM dimension_evaluations
        WHERE project_path IS NOT NULL
      `);
      database.exec(
        "ALTER TABLE dimension_evaluations RENAME TO dimension_evaluations_legacy_project_path",
      );
      database.exec(`
        CREATE TABLE dimension_evaluations (
          id TEXT NOT NULL PRIMARY KEY,
          dimension_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          commit_sha TEXT NOT NULL,
          evaluator_model TEXT NOT NULL,
          score INTEGER NOT NULL,
          evaluation TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (dimension_id) REFERENCES dimensions(id) ON DELETE CASCADE
        )
      `);
      database.exec(`
        INSERT INTO dimension_evaluations (id, dimension_id, project_id, commit_sha, evaluator_model, score, evaluation, created_at)
        SELECT id, dimension_id, project_path, commit_sha, evaluator_model, score, evaluation, created_at
        FROM dimension_evaluations_legacy_project_path
      `);
      database.exec("DROP TABLE dimension_evaluations_legacy_project_path");
    }

    const bulkColumns = tableColumns(database, "task_write_bulks");
    if (bulkColumns.has("project_path")) {
      database.exec(`
        INSERT OR IGNORE INTO projects (id, name, project_path, global_provider_id, global_model_id, created_at, updated_at)
        SELECT DISTINCT project_path, project_path, project_path, '', '', created_at, updated_at
        FROM task_write_bulks
        WHERE project_path IS NOT NULL
      `);
      database.exec(
        "ALTER TABLE task_write_bulks RENAME TO task_write_bulks_legacy_project_path",
      );
      database.exec(`
        CREATE TABLE task_write_bulks (
          project_id TEXT NOT NULL,
          bulk_id TEXT NOT NULL,
          content_markdown TEXT NOT NULL,
          entries TEXT NOT NULL,
          baseline_ref TEXT,
          source_metadata TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (project_id, bulk_id),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
      `);
      database.exec(`
        INSERT INTO task_write_bulks (project_id, bulk_id, content_markdown, entries, baseline_ref, source_metadata, created_at, updated_at)
        SELECT project_path, bulk_id, content_markdown, entries, baseline_ref, source_metadata, created_at, updated_at
        FROM task_write_bulks_legacy_project_path
      `);
      database.exec("DROP TABLE task_write_bulks_legacy_project_path");
    }
  } finally {
    database.exec("PRAGMA foreign_keys = ON;");
  }
};

export const applySqliteSchema = (database: DatabaseSync) => {
  execSchemaStatements(database, () => true);
  migrateSqliteProjectPathSchema(database);
};

export const applySqliteTableSchema = (database: DatabaseSync) => {
  execSchemaStatements(database, (statement) =>
    /^CREATE TABLE\b/i.test(statement),
  );
  migrateSqliteProjectPathSchema(database);
};

export const applySqliteIndexSchema = (database: DatabaseSync) => {
  execSchemaStatements(database, (statement) =>
    /^CREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(statement),
  );
};
