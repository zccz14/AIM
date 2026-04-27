import { randomUUID } from "node:crypto";

import {
  type CreateProjectRequest,
  type CreateTaskRequest,
  type PatchProjectRequest,
  type PatchTaskRequest,
  type Project,
  projectSchema,
  type Task,
  type TaskStatus,
  taskSchema,
} from "@aim-ai/contract";

import { applySqliteIndexSchema, applySqliteTableSchema } from "./schema.js";
import {
  createTaskDatabaseAsyncDispose,
  openTaskDatabase,
} from "./task-database.js";

type TaskRow = {
  created_at: string;
  developer_model_id: string;
  developer_provider_id: string;
  dependencies: string;
  done: number;
  pull_request_url: null | string;
  project_id: string;
  project_path: string;
  result: string;
  session_id: null | string;
  status: TaskStatus;
  task_id: string;
  task_spec: string;
  title: string;
  updated_at: string;
  worktree_path: null | string;
};

type ProjectRow = {
  created_at: string;
  global_model_id: string;
  global_provider_id: string;
  id: string;
  name: string;
  project_path: string;
  updated_at: string;
};

type TableInfoRow = {
  dflt_value: null | string;
  name: string;
  notnull: 0 | 1;
  pk: 0 | 1;
  type: string;
};

type IndexListRow = {
  name: string;
  partial: 0 | 1;
  unique: 0 | 1;
};

const tasksTableName = "tasks";
const projectsTableName = "projects";
const unfinishedSessionIndexName = "tasks_unfinished_session_id_unique";

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
  { name: "title", notnull: 1, pk: 0, type: "TEXT" },
  { name: "task_spec", notnull: 1, pk: 0, type: "TEXT" },
  { name: "project_id", notnull: 1, pk: 0, type: "TEXT" },
  { name: "developer_provider_id", notnull: 1, pk: 0, type: "TEXT" },
  { name: "developer_model_id", notnull: 1, pk: 0, type: "TEXT" },
  { name: "session_id", notnull: 0, pk: 0, type: "TEXT" },
  { name: "worktree_path", notnull: 0, pk: 0, type: "TEXT" },
  { name: "pull_request_url", notnull: 0, pk: 0, type: "TEXT" },
  { name: "dependencies", notnull: 1, pk: 0, type: "TEXT" },
  { name: "result", defaultValue: "''", notnull: 1, pk: 0, type: "TEXT" },
  { name: "done", notnull: 1, pk: 0, type: "INTEGER" },
  { name: "status", notnull: 1, pk: 0, type: "TEXT" },
  { name: "created_at", notnull: 1, pk: 0, type: "TEXT" },
  { name: "updated_at", notnull: 1, pk: 0, type: "TEXT" },
] as const;

const requiredProjectColumns = [
  { name: "id", notnull: 0, pk: 1, type: "TEXT" },
  { name: "name", notnull: 1, pk: 0, type: "TEXT" },
  { name: "project_path", notnull: 1, pk: 0, type: "TEXT" },
  { name: "global_provider_id", notnull: 1, pk: 0, type: "TEXT" },
  { name: "global_model_id", notnull: 1, pk: 0, type: "TEXT" },
  { name: "created_at", notnull: 1, pk: 0, type: "TEXT" },
  { name: "updated_at", notnull: 1, pk: 0, type: "TEXT" },
] as const;

const isDoneStatus = (status: TaskStatus) =>
  status === "resolved" || status === "rejected";

const buildSchemaError = () => new Error("tasks schema is incompatible");

const buildProjectConfigurationError = (projectId: string) =>
  new Error(
    `Project ${projectId} is missing global provider/model configuration`,
  );

type LegacyCreateTaskRequest = CreateTaskRequest & {
  developer_model_id?: string;
  developer_provider_id?: string;
  project_path?: string;
};

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

const hasCompatibleUnfinishedSessionPredicate = (sql: null | string) => {
  if (!sql) {
    return false;
  }

  const normalizedSql = sql
    .toLowerCase()
    .replaceAll(/[`"'()[\]]/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
  const whereClause = normalizedSql.match(/\bwhere\b\s+(.+)$/)?.[1]?.trim();

  if (!whereClause || whereClause.includes(" or ")) {
    return false;
  }

  const normalizedPredicates = whereClause
    .split(/\band\b/)
    .map((predicate) => predicate.trim())
    .filter(Boolean)
    .sort();

  return (
    (normalizedPredicates.length === 2 &&
      normalizedPredicates[0] === "0 = done" &&
      normalizedPredicates[1] === "session_id is not null") ||
    (normalizedPredicates.length === 2 &&
      normalizedPredicates[0] === "done = 0" &&
      normalizedPredicates[1] === "session_id is not null")
  );
};

const mapTaskRow = (row: TaskRow) =>
  taskSchema.parse({
    task_id: row.task_id,
    title: row.title,
    task_spec: row.task_spec,
    project_id: row.project_id,
    project_path: row.project_path,
    developer_provider_id: row.developer_provider_id,
    developer_model_id: row.developer_model_id,
    session_id: row.session_id,
    worktree_path: row.worktree_path,
    pull_request_url: row.pull_request_url,
    dependencies: JSON.parse(row.dependencies) as string[],
    result: row.result,
    done: Boolean(row.done),
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });

const mapProjectRow = (row: ProjectRow) =>
  projectSchema.parse({
    id: row.id,
    name: row.name,
    project_path: row.project_path,
    global_provider_id: row.global_provider_id,
    global_model_id: row.global_model_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });

const validateTasksIndexes = (
  database: ReturnType<typeof openTaskDatabase>,
) => {
  const indexes = database
    .prepare(`PRAGMA index_list(${tasksTableName})`)
    .all() as IndexListRow[];
  const sessionIndex = indexes.find(
    (index) => index.name === unfinishedSessionIndexName,
  );
  const sessionIndexSql = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?")
    .get(unfinishedSessionIndexName) as { sql: null | string } | undefined;
  const sessionIndexColumns = database
    .prepare(`PRAGMA index_info(${unfinishedSessionIndexName})`)
    .all() as Array<{ name: string }>;

  if (
    !sessionIndex ||
    sessionIndex.unique !== 1 ||
    sessionIndex.partial !== 1 ||
    sessionIndexColumns.length !== 1 ||
    sessionIndexColumns[0]?.name !== "session_id" ||
    !hasCompatibleUnfinishedSessionPredicate(sessionIndexSql?.sql ?? null)
  ) {
    throw buildSchemaError();
  }
};

const validateTasksTableSchema = (
  database: ReturnType<typeof openTaskDatabase>,
) => {
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
      ("defaultValue" in expectedColumn &&
        actualColumn.dflt_value !== expectedColumn.defaultValue) ||
      (expectedColumn.name !== "project_id" &&
        expectedColumn.pk === 0 &&
        actualColumn.notnull !== expectedColumn.notnull) ||
      actualColumn.pk !== expectedColumn.pk
    ) {
      throw buildSchemaError();
    }
  }
};

const validateProjectsTableSchema = (
  database: ReturnType<typeof openTaskDatabase>,
) => {
  const rows = database
    .prepare(`PRAGMA table_info(${projectsTableName})`)
    .all() as TableInfoRow[];

  if (rows.length === 0) {
    throw buildSchemaError();
  }

  const columns = new Map(rows.map((row) => [row.name, row]));

  for (const expectedColumn of requiredProjectColumns) {
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

const validateTasksSchema = (database: ReturnType<typeof openTaskDatabase>) => {
  validateTasksIndexes(database);
};

const bootstrapTaskDatabase = (projectRoot?: string) => {
  const database = openTaskDatabase(projectRoot);

  applySqliteTableSchema(database);
  validateProjectsTableSchema(database);
  validateTasksTableSchema(database);
  applySqliteIndexSchema(database);
  validateTasksSchema(database);

  return database;
};

export const createTaskRepository = (options: TaskRepositoryOptions = {}) => {
  const database = bootstrapTaskDatabase(options.projectRoot);
  const asyncDisposeDatabase = createTaskDatabaseAsyncDispose(database);

  const insertTaskStatement = database.prepare(`
    INSERT INTO ${tasksTableName} (
      task_id,
      title,
      task_spec,
      project_id,
      developer_provider_id,
      developer_model_id,
      session_id,
      worktree_path,
      pull_request_url,
      dependencies,
      result,
      done,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getProjectByIdStatement = database.prepare(`
    SELECT
      id,
      name,
      project_path,
      global_provider_id,
      global_model_id,
      created_at,
      updated_at
    FROM ${projectsTableName}
    WHERE id = ?
  `);
  const listProjectsStatement = database.prepare(`
    SELECT
      id,
      name,
      project_path,
      global_provider_id,
      global_model_id,
      created_at,
      updated_at
    FROM ${projectsTableName}
    ORDER BY created_at ASC, id ASC
  `);
  const insertProjectStatement = database.prepare(`
    INSERT INTO ${projectsTableName} (
      id,
      name,
      project_path,
      global_provider_id,
      global_model_id,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const updateProjectStatement = database.prepare(`
    UPDATE ${projectsTableName}
    SET
      name = ?,
      project_path = ?,
      global_provider_id = ?,
      global_model_id = ?,
      updated_at = ?
    WHERE id = ?
  `);
  const deleteProjectStatement = database.prepare(
    `DELETE FROM ${projectsTableName} WHERE id = ?`,
  );
  const listTasksStatement = database.prepare(`
    SELECT
      tasks.task_id,
      tasks.title,
      tasks.task_spec,
      tasks.project_id,
      projects.project_path AS project_path,
      tasks.developer_provider_id,
      tasks.developer_model_id,
      tasks.session_id,
      tasks.worktree_path,
      tasks.pull_request_url,
      tasks.dependencies,
      tasks.result,
      tasks.done,
      tasks.status,
      tasks.created_at,
      tasks.updated_at
    FROM ${tasksTableName} AS tasks
    INNER JOIN ${projectsTableName} AS projects ON projects.id = tasks.project_id
    ORDER BY tasks.created_at ASC, tasks.rowid ASC
  `);
  const getTaskByIdStatement = database.prepare(`
    SELECT
      tasks.task_id,
      tasks.title,
      tasks.task_spec,
      tasks.project_id,
      projects.project_path AS project_path,
      tasks.developer_provider_id,
      tasks.developer_model_id,
      tasks.session_id,
      tasks.worktree_path,
      tasks.pull_request_url,
      tasks.dependencies,
      tasks.result,
      tasks.done,
      tasks.status,
      tasks.created_at,
      tasks.updated_at
    FROM ${tasksTableName} AS tasks
    INNER JOIN ${projectsTableName} AS projects ON projects.id = tasks.project_id
    WHERE tasks.task_id = ?
  `);
  const updateTaskStatement = database.prepare(`
    UPDATE ${tasksTableName}
    SET
      task_spec = ?,
      session_id = ?,
      worktree_path = ?,
      pull_request_url = ?,
      dependencies = ?,
      result = ?,
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
    WHERE task_id = ? AND session_id IS NULL AND done = 0
  `);

  return {
    [Symbol.asyncDispose]: asyncDisposeDatabase,
    getProjectById(projectId: string): Promise<null | ProjectRow> {
      const project = getProjectByIdStatement.get(projectId) as
        | ProjectRow
        | undefined;

      return Promise.resolve(project ?? null);
    },
    listProjects(): Promise<Project[]> {
      const rows = listProjectsStatement.all() as ProjectRow[];

      return Promise.resolve(rows.map(mapProjectRow));
    },
    async createProject(input: CreateProjectRequest): Promise<Project> {
      const timestamp = new Date().toISOString();
      const project = mapProjectRow({
        id: randomUUID(),
        name: input.name,
        project_path: input.project_path,
        global_provider_id: input.global_provider_id,
        global_model_id: input.global_model_id,
        created_at: timestamp,
        updated_at: timestamp,
      });

      insertProjectStatement.run(
        project.id,
        project.name,
        project.project_path,
        project.global_provider_id,
        project.global_model_id,
        project.created_at,
        project.updated_at,
      );

      return project;
    },
    async updateProject(
      projectId: string,
      patch: PatchProjectRequest,
    ): Promise<null | Project> {
      const currentProject = getProjectByIdStatement.get(projectId) as
        | ProjectRow
        | undefined;

      if (!currentProject) {
        return null;
      }

      const updatedProject = mapProjectRow({
        ...currentProject,
        ...patch,
        id: currentProject.id,
        updated_at: new Date().toISOString(),
      });

      updateProjectStatement.run(
        updatedProject.name,
        updatedProject.project_path,
        updatedProject.global_provider_id,
        updatedProject.global_model_id,
        updatedProject.updated_at,
        projectId,
      );

      return updatedProject;
    },
    deleteProject(projectId: string): Promise<boolean> {
      const result = deleteProjectStatement.run(projectId);

      return Promise.resolve(result.changes > 0);
    },
    getFirstProject(): null | ProjectRow {
      const project = database
        .prepare(
          `SELECT id, name, project_path, global_provider_id, global_model_id, created_at, updated_at FROM ${projectsTableName} ORDER BY created_at ASC, id ASC LIMIT 1`,
        )
        .get() as ProjectRow | undefined;

      return project ?? null;
    },
    async createTask(input: CreateTaskRequest): Promise<Task> {
      const timestamp = new Date().toISOString();
      const taskId = randomUUID();
      const legacyInput = input as LegacyCreateTaskRequest;
      const projectId = legacyInput.project_id ?? legacyInput.project_path;

      if (!projectId) {
        throw new Error("Task requires project_id");
      }

      let project = getProjectByIdStatement.get(projectId) as
        | ProjectRow
        | undefined;

      if (!project) {
        if (
          !legacyInput.project_path ||
          !legacyInput.developer_provider_id ||
          !legacyInput.developer_model_id
        ) {
          throw new Error(`Project ${projectId} was not found`);
        }

        insertProjectStatement.run(
          projectId,
          projectId,
          legacyInput.project_path,
          legacyInput.developer_provider_id,
          legacyInput.developer_model_id,
          timestamp,
          timestamp,
        );
        project = getProjectByIdStatement.get(projectId) as ProjectRow;
      }

      if (
        !project.global_provider_id.trim() ||
        !project.global_model_id.trim()
      ) {
        throw buildProjectConfigurationError(projectId);
      }

      const task = mapTaskRow({
        task_id: taskId,
        title: input.title,
        task_spec: input.task_spec,
        project_id: projectId,
        project_path: project.project_path,
        developer_provider_id: project.global_provider_id,
        developer_model_id: project.global_model_id,
        session_id: input.session_id ?? null,
        worktree_path: input.worktree_path ?? null,
        pull_request_url: input.pull_request_url ?? null,
        dependencies: JSON.stringify(input.dependencies ?? []),
        result: input.result ?? "",
        done: Number(isDoneStatus(input.status ?? "processing")),
        status: input.status ?? "processing",
        created_at: timestamp,
        updated_at: timestamp,
      });

      insertTaskStatement.run(
        task.task_id,
        task.title,
        task.task_spec,
        task.project_id,
        task.developer_provider_id,
        task.developer_model_id,
        task.session_id,
        task.worktree_path,
        task.pull_request_url,
        JSON.stringify(task.dependencies),
        task.result,
        Number(task.done),
        task.status,
        task.created_at,
        task.updated_at,
      );

      return task;
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
            tasks.task_id,
            tasks.title,
            tasks.task_spec,
            tasks.project_id,
            projects.project_path AS project_path,
            tasks.developer_provider_id,
            tasks.developer_model_id,
            tasks.session_id,
            tasks.worktree_path,
            tasks.pull_request_url,
            tasks.dependencies,
            tasks.result,
            tasks.done,
            tasks.status,
            tasks.created_at,
            tasks.updated_at
          FROM ${tasksTableName} AS tasks
          INNER JOIN ${projectsTableName} AS projects ON projects.id = tasks.project_id
          WHERE ${whereClauses.join(" AND ")}
          ORDER BY tasks.created_at ASC, tasks.rowid ASC
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
        updatedTask.result,
        Number(updatedTask.done),
        updatedTask.status,
        updatedTask.updated_at,
        taskId,
      );

      return updatedTask;
    },
    resolveTask(taskId: string, result: string): Promise<null | Task> {
      return this.updateTask(taskId, { result, status: "resolved" });
    },
    rejectTask(taskId: string, result: string): Promise<null | Task> {
      return this.updateTask(taskId, { result, status: "rejected" });
    },
    deleteTask(taskId: string): Promise<boolean> {
      const result = deleteTaskStatement.run(taskId);

      return Promise.resolve(result.changes > 0);
    },
  };
};
