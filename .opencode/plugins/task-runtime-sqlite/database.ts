import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const INCOMPATIBLE_TASKS_TABLE_ERROR =
  "Existing tasks table schema is incompatible with sqlite task runtime";

const REQUIRED_TASK_COLUMNS = [
  { name: "task_id", type: "TEXT" },
  { name: "task_spec", type: "TEXT" },
  { name: "session_id", type: "TEXT" },
  { name: "worktree_path", type: "TEXT" },
  { name: "pull_request_url", type: "TEXT" },
  { name: "status", type: "TEXT" },
  { name: "done", type: "INTEGER", notNull: true, defaultValue: "0" },
  { name: "updated_at", type: "TEXT" },
] as const;

type TableInfoRow = {
  defaultValue: string | null;
  name: string;
  notNull: boolean;
  type: string;
};

const createTasksTable = (database: DatabaseSync) => {
  database.exec(`
    CREATE TABLE tasks (
      task_id TEXT NOT NULL,
      task_spec TEXT NOT NULL,
      session_id TEXT,
      worktree_path TEXT,
      pull_request_url TEXT,
      status TEXT,
      done INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT
    )
  `);
};

const assertTasksTableSchema = (database: DatabaseSync) => {
  const columns = database
    .prepare(`PRAGMA table_info('tasks')`)
    .all()
    .map((row) => ({
      defaultValue:
        (row as Record<string, unknown>).dflt_value === null
          ? null
          : String((row as Record<string, unknown>).dflt_value),
      name: String((row as Record<string, unknown>).name),
      notNull: Boolean(Number((row as Record<string, unknown>).notnull)),
      type: String((row as Record<string, unknown>).type).toUpperCase(),
    })) satisfies TableInfoRow[];

  if (columns.length === 0) {
    createTasksTable(database);
    return;
  }

  const columnByName = new Map(columns.map((column) => [column.name, column]));

  for (const requirement of REQUIRED_TASK_COLUMNS) {
    const column = columnByName.get(requirement.name);

    if (!column || column.type !== requirement.type) {
      throw new Error(INCOMPATIBLE_TASKS_TABLE_ERROR);
    }

    if (
      requirement.notNull !== undefined &&
      column.notNull !== requirement.notNull
    ) {
      throw new Error(INCOMPATIBLE_TASKS_TABLE_ERROR);
    }

    if (
      requirement.defaultValue !== undefined &&
      column.defaultValue !== requirement.defaultValue
    ) {
      throw new Error(INCOMPATIBLE_TASKS_TABLE_ERROR);
    }
  }
};

export type TaskRecord = {
  task_id: string;
  task_spec: string;
  session_id: string | null;
  worktree_path: string | null;
  pull_request_url: string | null;
  status: string | null;
  done: boolean;
  updated_at: string | null;
};

export type TaskRuntimeDatabase = {
  projectDir: string;
  path: string;
  open(): DatabaseSync;
};

export const getTaskRuntimeDatabasePath = (projectDir: string) =>
  join(projectDir, "aim.sqlite");

export const openTaskRuntimeDatabase = (projectDir: string) => {
  const database = new DatabaseSync(getTaskRuntimeDatabasePath(projectDir));

  try {
    assertTasksTableSchema(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
};

export const createTaskRuntimeDatabase = (
  projectDir: string,
): TaskRuntimeDatabase => ({
  projectDir,
  path: getTaskRuntimeDatabasePath(projectDir),
  open: () => openTaskRuntimeDatabase(projectDir),
});
