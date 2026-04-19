import { randomUUID } from "node:crypto";

import {
  type CreateTaskRequest,
  type PatchTaskRequest,
  type Task,
  type TaskStatus,
  taskSchema,
} from "@aim-ai/contract";

import { openTaskDatabase } from "./task-database.js";

type TaskRow = {
  created_at: string;
  dependencies: string;
  done: number;
  pull_request_url: null | string;
  session_id: null | string;
  status: TaskStatus;
  task_id: string;
  task_spec: string;
  updated_at: string;
  worktree_path: null | string;
};

type TableInfoRow = {
  name: string;
  notnull: 0 | 1;
  pk: 0 | 1;
  type: string;
};

const tasksTableName = "tasks";

type ListTaskFilters = {
  done?: boolean;
  session_id?: string;
  status?: TaskStatus;
};

type TaskRepositoryOptions = {
  projectRoot?: string;
};

const requiredColumns = [
  { name: "task_id", notnull: 0, pk: 1, type: "TEXT" },
  { name: "task_spec", notnull: 1, pk: 0, type: "TEXT" },
  { name: "session_id", notnull: 0, pk: 0, type: "TEXT" },
  { name: "worktree_path", notnull: 0, pk: 0, type: "TEXT" },
  { name: "pull_request_url", notnull: 0, pk: 0, type: "TEXT" },
  { name: "dependencies", notnull: 1, pk: 0, type: "TEXT" },
  { name: "done", notnull: 1, pk: 0, type: "INTEGER" },
  { name: "status", notnull: 1, pk: 0, type: "TEXT" },
  { name: "created_at", notnull: 1, pk: 0, type: "TEXT" },
  { name: "updated_at", notnull: 1, pk: 0, type: "TEXT" },
] as const;

const isDoneStatus = (status: TaskStatus) =>
  status === "succeeded" || status === "failed";

const buildSchemaError = () => new Error("tasks schema is incompatible");

const normalizeColumnType = (type: string) => {
  const normalizedType = type.trim().toUpperCase();

  if (normalizedType === "TEXT" || normalizedType.startsWith("VARCHAR")) {
    return "TEXT";
  }

  if (normalizedType === "INTEGER" || normalizedType === "INT") {
    return "INTEGER";
  }

  if (normalizedType === "DATETIME") {
    return "TEXT";
  }

  return normalizedType;
};

const mapTaskRow = (row: TaskRow) =>
  taskSchema.parse({
    task_id: row.task_id,
    task_spec: row.task_spec,
    session_id: row.session_id,
    worktree_path: row.worktree_path,
    pull_request_url: row.pull_request_url,
    dependencies: JSON.parse(row.dependencies) as string[],
    done: Boolean(row.done),
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });

const createTasksTable = (database: ReturnType<typeof openTaskDatabase>) => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ${tasksTableName} (
      task_id TEXT PRIMARY KEY,
      task_spec TEXT NOT NULL,
      session_id TEXT,
      worktree_path TEXT,
      pull_request_url TEXT,
      dependencies TEXT NOT NULL,
      done INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
};

const validateTasksSchema = (database: ReturnType<typeof openTaskDatabase>) => {
  const rows = database
    .prepare(`PRAGMA table_info(${tasksTableName})`)
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

const bootstrapTaskDatabase = (projectRoot?: string) => {
  const database = openTaskDatabase(projectRoot);

  createTasksTable(database);
  validateTasksSchema(database);

  return database;
};

export const createTaskRepository = (options: TaskRepositoryOptions = {}) => {
  const database = bootstrapTaskDatabase(options.projectRoot);

  const insertTaskStatement = database.prepare(`
    INSERT INTO ${tasksTableName} (
      task_id,
      task_spec,
      session_id,
      worktree_path,
      pull_request_url,
      dependencies,
      done,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const listTasksStatement = database.prepare(`
    SELECT
      task_id,
      task_spec,
      session_id,
      worktree_path,
      pull_request_url,
      dependencies,
      done,
      status,
      created_at,
      updated_at
    FROM ${tasksTableName}
    ORDER BY created_at ASC, rowid ASC
  `);
  const getTaskByIdStatement = database.prepare(`
    SELECT
      task_id,
      task_spec,
      session_id,
      worktree_path,
      pull_request_url,
      dependencies,
      done,
      status,
      created_at,
      updated_at
    FROM ${tasksTableName}
    WHERE task_id = ?
  `);
  const updateTaskStatement = database.prepare(`
    UPDATE ${tasksTableName}
    SET
      task_spec = ?,
      session_id = ?,
      worktree_path = ?,
      pull_request_url = ?,
      dependencies = ?,
      done = ?,
      status = ?,
      updated_at = ?
    WHERE task_id = ?
  `);
  const deleteTaskStatement = database.prepare(
    `DELETE FROM ${tasksTableName} WHERE task_id = ?`,
  );
  const assignSessionIfUnassignedStatement = database.prepare(`
    UPDATE ${tasksTableName}
    SET session_id = ?, updated_at = ?
    WHERE task_id = ? AND session_id IS NULL
  `);

  return {
    createTask(input: CreateTaskRequest): Promise<Task> {
      const timestamp = new Date().toISOString();
      const taskId = randomUUID();
      const task = mapTaskRow({
        task_id: taskId,
        task_spec: input.task_spec,
        session_id: input.session_id ?? null,
        worktree_path: input.worktree_path ?? null,
        pull_request_url: input.pull_request_url ?? null,
        dependencies: JSON.stringify(input.dependencies ?? []),
        done: Number(isDoneStatus(input.status ?? "created")),
        status: input.status ?? "created",
        created_at: timestamp,
        updated_at: timestamp,
      });

      insertTaskStatement.run(
        task.task_id,
        task.task_spec,
        task.session_id,
        task.worktree_path,
        task.pull_request_url,
        JSON.stringify(task.dependencies),
        Number(task.done),
        task.status,
        task.created_at,
        task.updated_at,
      );

      return Promise.resolve(task);
    },
    getTaskById(taskId: string): Promise<null | Task> {
      const row = getTaskByIdStatement.get(taskId) as TaskRow | undefined;

      return Promise.resolve(row ? mapTaskRow(row) : null);
    },
    listTasks(filters: ListTaskFilters = {}): Promise<Task[]> {
      if (
        filters.done === undefined &&
        filters.session_id === undefined &&
        filters.status === undefined
      ) {
        const rows = listTasksStatement.all() as TaskRow[];

        return Promise.resolve(rows.map(mapTaskRow));
      }

      const whereClauses: string[] = [];
      const parameters: Array<number | string> = [];

      if (filters.status !== undefined) {
        whereClauses.push("status = ?");
        parameters.push(filters.status);
      }

      if (filters.done !== undefined) {
        whereClauses.push("done = ?");
        parameters.push(Number(filters.done));
      }

      if (filters.session_id !== undefined) {
        whereClauses.push("session_id = ?");
        parameters.push(filters.session_id);
      }

      const rows = database
        .prepare(`
          SELECT
            task_id,
            task_spec,
            session_id,
            worktree_path,
            pull_request_url,
            dependencies,
            done,
            status,
            created_at,
            updated_at
          FROM ${tasksTableName}
          WHERE ${whereClauses.join(" AND ")}
          ORDER BY created_at ASC, rowid ASC
        `)
        .all(...parameters) as TaskRow[];

      return Promise.resolve(rows.map(mapTaskRow));
    },
    listUnfinishedTasks(): Promise<Task[]> {
      return this.listTasks({ done: false });
    },
    async assignSessionIfUnassigned(
      taskId: string,
      sessionId: string,
    ): Promise<null | Task> {
      assignSessionIfUnassignedStatement.run(
        sessionId,
        new Date().toISOString(),
        taskId,
      );

      return this.getTaskById(taskId);
    },
    async updateTask(
      taskId: string,
      patch: PatchTaskRequest,
    ): Promise<null | Task> {
      const currentTask = await this.getTaskById(taskId);

      if (!currentTask) {
        return null;
      }

      const nextStatus = patch.status ?? currentTask.status;
      const updatedTask = taskSchema.parse({
        ...currentTask,
        ...patch,
        task_id: currentTask.task_id,
        done: isDoneStatus(nextStatus),
        status: nextStatus,
        updated_at: new Date().toISOString(),
      });

      updateTaskStatement.run(
        updatedTask.task_spec,
        updatedTask.session_id,
        updatedTask.worktree_path,
        updatedTask.pull_request_url,
        JSON.stringify(updatedTask.dependencies),
        Number(updatedTask.done),
        updatedTask.status,
        updatedTask.updated_at,
        taskId,
      );

      return updatedTask;
    },
    deleteTask(taskId: string): Promise<boolean> {
      const result = deleteTaskStatement.run(taskId);

      return Promise.resolve(result.changes > 0);
    },
  };
};
