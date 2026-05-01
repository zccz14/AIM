import { randomUUID } from "node:crypto";
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

const dimensionEvaluationUniqueIndexName =
  "dimension_evaluations_project_commit_dimension_unique";
const openCodeSessionTokenColumns = [
  "input_tokens",
  "cached_tokens",
  "cache_write_tokens",
  "output_tokens",
  "reasoning_tokens",
] as const;

const createCurrentOpenCodeSessionsTableSql = `
  CREATE TABLE opencode_sessions (
    session_id TEXT PRIMARY KEY,
    title TEXT,
    project_id TEXT NOT NULL,
    continue_prompt TEXT,
    provider_id TEXT,
    model_id TEXT,
    state TEXT NOT NULL,
    value TEXT,
    reason TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    cached_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    reasoning_tokens INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (state IN ('pending', 'rejected', 'resolved')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  )
`;

type TableInfoRow = { name: string };

type TableColumnInfoRow = {
  name: string;
  notnull: number;
};

type ForeignKeyListRow = {
  from: string;
  on_delete: string;
  table: string;
  to: string;
};

type ProjectIdentityRow = {
  id: string;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const tableColumns = (database: DatabaseSync, tableName: string) =>
  new Set(
    (
      database
        .prepare(`PRAGMA table_info(${tableName})`)
        .all() as TableInfoRow[]
    ).map((row) => row.name),
  );

const tableColumnInfo = (database: DatabaseSync, tableName: string) =>
  database
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as TableColumnInfoRow[];

const isTableColumnNotNull = (
  database: DatabaseSync,
  tableName: string,
  columnName: string,
) =>
  tableColumnInfo(database, tableName).some(
    (column) => column.name === columnName && column.notnull === 1,
  );

const createCurrentTasksTableSql = `
  CREATE TABLE tasks (
    task_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    task_spec TEXT NOT NULL,
    project_id TEXT NOT NULL,
    session_id TEXT,
    worktree_path TEXT,
    pull_request_url TEXT,
    dependencies TEXT NOT NULL,
    result TEXT NOT NULL DEFAULT '',
    source_metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES opencode_sessions(session_id) ON DELETE SET NULL
  )
`;

const migrateTasksWithoutDeveloperModelColumns = (database: DatabaseSync) => {
  const taskColumns = tableColumns(database, "tasks");

  if (
    !taskColumns.has("developer_provider_id") &&
    !taskColumns.has("developer_model_id")
  ) {
    return;
  }

  const sourceMetadataExpression = taskColumns.has("source_metadata")
    ? "source_metadata"
    : "'{}'";
  database.exec("ALTER TABLE tasks RENAME TO tasks_legacy_developer_model");
  database.exec(createCurrentTasksTableSql);
  database.exec(`
    INSERT INTO tasks (task_id, title, task_spec, project_id, session_id, worktree_path, pull_request_url, dependencies, result, source_metadata, created_at, updated_at)
    SELECT task_id, title, task_spec, project_id, session_id, worktree_path, pull_request_url, dependencies, result, ${sourceMetadataExpression}, created_at, updated_at
    FROM tasks_legacy_developer_model
  `);
  database.exec("DROP TABLE tasks_legacy_developer_model");
};

const migrateTasksWithoutPersistedLifecycleColumns = (
  database: DatabaseSync,
) => {
  const taskColumns = tableColumns(database, "tasks");

  if (!taskColumns.has("done") && !taskColumns.has("status")) {
    return;
  }

  for (const requiredColumn of [
    "task_id",
    "title",
    "task_spec",
    "project_id",
    "session_id",
    "worktree_path",
    "pull_request_url",
    "dependencies",
    "result",
    "created_at",
    "updated_at",
  ]) {
    if (!taskColumns.has(requiredColumn)) {
      return;
    }
  }

  const sourceMetadataExpression = taskColumns.has("source_metadata")
    ? "source_metadata"
    : "'{}'";
  database.exec("ALTER TABLE tasks RENAME TO tasks_legacy_lifecycle");
  database.exec(createCurrentTasksTableSql);
  database.exec(`
    INSERT INTO tasks (task_id, title, task_spec, project_id, session_id, worktree_path, pull_request_url, dependencies, result, source_metadata, created_at, updated_at)
    SELECT task_id, title, task_spec, project_id, session_id, worktree_path, pull_request_url, dependencies, result, ${sourceMetadataExpression}, created_at, updated_at
    FROM tasks_legacy_lifecycle
  `);
  database.exec("DROP TABLE tasks_legacy_lifecycle");
};

const taskSessionForeignKeyReferencesOpenCodeSessions = (
  database: DatabaseSync,
) => {
  const foreignKeys = database
    .prepare("PRAGMA foreign_key_list(tasks)")
    .all() as ForeignKeyListRow[];

  return foreignKeys.some(
    (foreignKey) =>
      foreignKey.from === "session_id" &&
      foreignKey.table === "opencode_sessions" &&
      foreignKey.to === "session_id" &&
      foreignKey.on_delete.toUpperCase() === "SET NULL",
  );
};

const openCodeSessionProjectForeignKeyReferencesProjects = (
  database: DatabaseSync,
) => {
  const foreignKeys = database
    .prepare("PRAGMA foreign_key_list(opencode_sessions)")
    .all() as ForeignKeyListRow[];

  return foreignKeys.some(
    (foreignKey) =>
      foreignKey.from === "project_id" &&
      foreignKey.table === "projects" &&
      foreignKey.to === "id" &&
      foreignKey.on_delete.toUpperCase() === "CASCADE",
  );
};

const migrateOpenCodeSessionsToDocumentedSchema = (database: DatabaseSync) => {
  const columns = tableColumns(database, "opencode_sessions");

  if (!columns.has("session_id")) {
    return;
  }

  const hasDocumentedColumns = [
    "title",
    "project_id",
    "continue_prompt",
    "provider_id",
    "model_id",
    "state",
    "value",
    "reason",
    "created_at",
    "updated_at",
    ...openCodeSessionTokenColumns,
  ].every((column) => columns.has(column));

  if (
    hasDocumentedColumns &&
    isTableColumnNotNull(database, "opencode_sessions", "project_id") &&
    openCodeSessionProjectForeignKeyReferencesProjects(database)
  ) {
    return;
  }

  const expression = (column: string, fallback: string) =>
    columns.has(column)
      ? `opencode_sessions_legacy_documented_schema.${column}`
      : fallback;

  database.exec(
    "ALTER TABLE opencode_sessions RENAME TO opencode_sessions_legacy_documented_schema",
  );
  database.exec(createCurrentOpenCodeSessionsTableSql);

  if (columns.has("project_id")) {
    database.exec(`
      INSERT INTO opencode_sessions (session_id, title, project_id, continue_prompt, provider_id, model_id, state, value, reason, input_tokens, cached_tokens, cache_write_tokens, output_tokens, reasoning_tokens, created_at, updated_at)
      SELECT opencode_sessions_legacy_documented_schema.session_id, ${expression("title", "NULL")}, opencode_sessions_legacy_documented_schema.project_id, ${expression("continue_prompt", "NULL")}, ${expression("provider_id", "NULL")}, ${expression("model_id", "NULL")}, opencode_sessions_legacy_documented_schema.state, ${expression("value", "NULL")}, ${expression("reason", "NULL")}, ${expression("input_tokens", "0")}, ${expression("cached_tokens", "0")}, ${expression("cache_write_tokens", "0")}, ${expression("output_tokens", "0")}, ${expression("reasoning_tokens", "0")}, opencode_sessions_legacy_documented_schema.created_at, opencode_sessions_legacy_documented_schema.updated_at
      FROM opencode_sessions_legacy_documented_schema
      INNER JOIN projects ON projects.id = opencode_sessions_legacy_documented_schema.project_id
    `);
  }

  database.exec("DROP TABLE opencode_sessions_legacy_documented_schema");
};

const migrateTasksWithoutOpenCodeSessionForeignKey = (
  database: DatabaseSync,
) => {
  const taskColumns = tableColumns(database, "tasks");

  if (
    !taskColumns.has("task_id") ||
    !taskColumns.has("title") ||
    !taskColumns.has("task_spec") ||
    !taskColumns.has("project_id") ||
    !taskColumns.has("session_id") ||
    !taskColumns.has("worktree_path") ||
    !taskColumns.has("pull_request_url") ||
    !taskColumns.has("dependencies") ||
    !taskColumns.has("result") ||
    !taskColumns.has("created_at") ||
    !taskColumns.has("updated_at") ||
    taskSessionForeignKeyReferencesOpenCodeSessions(database)
  ) {
    return;
  }

  const sourceMetadataExpression = taskColumns.has("source_metadata")
    ? "source_metadata"
    : "'{}'";
  database.exec("ALTER TABLE tasks RENAME TO tasks_legacy_session_fk");
  database.exec(createCurrentTasksTableSql);
  database.exec(`
    INSERT INTO tasks (task_id, title, task_spec, project_id, session_id, worktree_path, pull_request_url, dependencies, result, source_metadata, created_at, updated_at)
    SELECT task_id, title, task_spec, project_id, session_id, worktree_path, pull_request_url, dependencies, result, ${sourceMetadataExpression}, created_at, updated_at
    FROM tasks_legacy_session_fk
  `);
  database.exec("DROP TABLE tasks_legacy_session_fk");
};

const rewriteProjectIdsToUuids = (database: DatabaseSync) => {
  const projectColumns = tableColumns(database, "projects");

  if (!projectColumns.has("id")) {
    return;
  }

  const legacyProjects = (
    database.prepare("SELECT id FROM projects").all() as ProjectIdentityRow[]
  ).filter((project) => !uuidPattern.test(project.id));

  for (const project of legacyProjects) {
    const nextProjectId = randomUUID();

    for (const tableName of [
      "tasks",
      "dimensions",
      "dimension_evaluations",
      "director_clarifications",
      "manager_states",
      "coordinator_states",
      "opencode_sessions",
    ]) {
      const columns = tableColumns(database, tableName);

      if (columns.has("project_id")) {
        database
          .prepare(
            `UPDATE ${tableName} SET project_id = ? WHERE project_id = ?`,
          )
          .run(nextProjectId, project.id);
      }
    }

    database
      .prepare("UPDATE projects SET id = ? WHERE id = ?")
      .run(nextProjectId, project.id);
  }
};

const deleteDuplicateDimensionEvaluations = (database: DatabaseSync) => {
  const columns = tableColumns(database, "dimension_evaluations");

  if (
    !columns.has("project_id") ||
    !columns.has("commit_sha") ||
    !columns.has("dimension_id")
  ) {
    return;
  }

  database.exec(`
    DELETE FROM dimension_evaluations
    WHERE rowid NOT IN (
      SELECT MIN(rowid)
      FROM dimension_evaluations
      GROUP BY project_id, commit_sha, dimension_id
    )
  `);
};

const applyDimensionEvaluationUniqueIndex = (database: DatabaseSync) => {
  deleteDuplicateDimensionEvaluations(database);
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${dimensionEvaluationUniqueIndexName}
    ON dimension_evaluations (project_id, commit_sha, dimension_id)
  `);
};

export const migrateSqliteProjectPathSchema = (database: DatabaseSync) => {
  database.exec("PRAGMA foreign_keys = OFF;");
  database.exec("PRAGMA legacy_alter_table = ON;");
  try {
    const initialProjectColumns = tableColumns(database, "projects");
    if (initialProjectColumns.has("project_path")) {
      database.exec(
        "ALTER TABLE projects RENAME TO projects_legacy_project_path",
      );
      database.exec(`
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          git_origin_url TEXT NOT NULL UNIQUE,
          global_provider_id TEXT NOT NULL,
          global_model_id TEXT NOT NULL,
          optimizer_enabled INTEGER NOT NULL DEFAULT 0,
          token_budget_limit REAL,
          token_warning_threshold REAL,
          cost_warning_threshold REAL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      database.exec(`
        INSERT OR IGNORE INTO projects (id, name, git_origin_url, global_provider_id, global_model_id, optimizer_enabled, token_budget_limit, token_warning_threshold, cost_warning_threshold, created_at, updated_at)
        SELECT id, name, project_path, global_provider_id, global_model_id, 0, NULL, NULL, NULL, created_at, updated_at
        FROM projects_legacy_project_path
      `);
      database.exec("DROP TABLE projects_legacy_project_path");
    }

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
        INSERT OR IGNORE INTO projects (id, name, git_origin_url, global_provider_id, global_model_id, created_at, updated_at)
        SELECT DISTINCT project_path, project_path, project_path, developer_provider_id, developer_model_id, created_at, updated_at
        FROM tasks
        WHERE project_path IS NOT NULL
      `);
      database.exec("ALTER TABLE tasks RENAME TO tasks_legacy_project_path");
      database.exec(createCurrentTasksTableSql);
      database.exec(`
        INSERT INTO tasks (task_id, title, task_spec, project_id, session_id, worktree_path, pull_request_url, dependencies, result, source_metadata, created_at, updated_at)
        SELECT task_id, title, task_spec, ${projectIdExpression}, session_id, worktree_path, pull_request_url, dependencies, result, '{}', created_at, updated_at
        FROM tasks_legacy_project_path
      `);
      database.exec("DROP TABLE tasks_legacy_project_path");
    }

    const dimensionColumns = tableColumns(database, "dimensions");
    if (dimensionColumns.has("project_path")) {
      database.exec(`
        INSERT OR IGNORE INTO projects (id, name, git_origin_url, global_provider_id, global_model_id, created_at, updated_at)
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
        INSERT OR IGNORE INTO projects (id, name, git_origin_url, global_provider_id, global_model_id, created_at, updated_at)
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

    database.exec("DROP TABLE IF EXISTS task_write_bulks");

    const projectColumns = tableColumns(database, "projects");
    if (!projectColumns.has("optimizer_enabled")) {
      database.exec(
        "ALTER TABLE projects ADD COLUMN optimizer_enabled INTEGER NOT NULL DEFAULT 0",
      );
    }
    if (!projectColumns.has("token_warning_threshold")) {
      database.exec(
        "ALTER TABLE projects ADD COLUMN token_warning_threshold REAL",
      );
    }
    if (!projectColumns.has("token_budget_limit")) {
      database.exec("ALTER TABLE projects ADD COLUMN token_budget_limit REAL");
    }
    if (!projectColumns.has("cost_warning_threshold")) {
      database.exec(
        "ALTER TABLE projects ADD COLUMN cost_warning_threshold REAL",
      );
    }

    migrateTasksWithoutDeveloperModelColumns(database);
    migrateTasksWithoutPersistedLifecycleColumns(database);
    migrateTasksWithoutOpenCodeSessionForeignKey(database);
    migrateOpenCodeSessionsToDocumentedSchema(database);

    rewriteProjectIdsToUuids(database);
  } finally {
    database.exec("PRAGMA legacy_alter_table = OFF;");
    database.exec("PRAGMA foreign_keys = ON;");
  }
};

export const applySqliteSchema = (database: DatabaseSync) => {
  execSchemaStatements(
    database,
    (statement) => !statement.includes(dimensionEvaluationUniqueIndexName),
  );
  migrateSqliteProjectPathSchema(database);
  applyDimensionEvaluationUniqueIndex(database);
};

export const applySqliteTableSchema = (database: DatabaseSync) => {
  execSchemaStatements(database, (statement) =>
    /^CREATE TABLE\b/i.test(statement),
  );
  migrateSqliteProjectPathSchema(database);
};

export const applySqliteIndexSchema = (database: DatabaseSync) => {
  database.exec("DROP INDEX IF EXISTS tasks_unfinished_session_id_unique;");
  database.exec("DROP INDEX IF EXISTS tasks_session_id_unique;");
  execSchemaStatements(
    database,
    (statement) =>
      /^CREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(statement) &&
      !statement.includes(dimensionEvaluationUniqueIndexName),
  );
  applyDimensionEvaluationUniqueIndex(database);
};
