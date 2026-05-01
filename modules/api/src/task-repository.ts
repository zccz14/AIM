import { randomUUID } from "node:crypto";

import {
  type CreateProjectRequest,
  type CreateTaskBatchRequest,
  type CreateTaskRequest,
  type PatchProjectRequest,
  type PatchTaskRequest,
  type Project,
  projectSchema,
  type Task,
  type TaskBatchResponse,
  type TaskStatus,
  taskSchema,
} from "@aim-ai/contract";

import { applySqliteIndexSchema, applySqliteTableSchema } from "./schema.js";
import { normalizeSqliteDateTime } from "./sqlite-date-time.js";
import {
  createTaskDatabaseAsyncDispose,
  openTaskDatabase,
} from "./task-database.js";

type TaskRow = {
  created_at: string;
  dependencies: string;
  global_model_id: string;
  global_provider_id: string;
  pull_request_url: null | string;
  git_origin_url: string;
  project_id: string;
  result: string;
  session_id: null | string;
  session_state: null | TaskStatus;
  source_metadata: string;
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
  git_origin_url: string;
  id: string;
  name: string;
  optimizer_enabled: number;
  token_budget_limit: null | number;
  token_warning_threshold: null | number;
  cost_warning_threshold: null | number;
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
const taskSessionIndexName = "tasks_session_id_unique";

type ListTaskFilters = {
  done?: boolean;
  project_id?: string;
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
  { name: "session_id", notnull: 0, pk: 0, type: "TEXT" },
  { name: "worktree_path", notnull: 0, pk: 0, type: "TEXT" },
  { name: "pull_request_url", notnull: 0, pk: 0, type: "TEXT" },
  { name: "dependencies", notnull: 1, pk: 0, type: "TEXT" },
  { name: "result", defaultValue: "''", notnull: 1, pk: 0, type: "TEXT" },
  {
    name: "source_metadata",
    defaultValue: "'{}'",
    notnull: 1,
    pk: 0,
    type: "TEXT",
  },
  { name: "created_at", notnull: 1, pk: 0, type: "TEXT" },
  { name: "updated_at", notnull: 1, pk: 0, type: "TEXT" },
] as const;

const requiredProjectColumns = [
  { name: "id", notnull: 0, pk: 1, type: "TEXT" },
  { name: "name", notnull: 1, pk: 0, type: "TEXT" },
  { name: "git_origin_url", notnull: 1, pk: 0, type: "TEXT" },
  { name: "global_provider_id", notnull: 1, pk: 0, type: "TEXT" },
  { name: "global_model_id", notnull: 1, pk: 0, type: "TEXT" },
  { name: "optimizer_enabled", notnull: 1, pk: 0, type: "INTEGER" },
  { name: "token_budget_limit", notnull: 0, pk: 0, type: "REAL" },
  { name: "token_warning_threshold", notnull: 0, pk: 0, type: "REAL" },
  { name: "cost_warning_threshold", notnull: 0, pk: 0, type: "REAL" },
  { name: "created_at", notnull: 1, pk: 0, type: "TEXT" },
  { name: "updated_at", notnull: 1, pk: 0, type: "TEXT" },
] as const;

const isDoneStatus = (status: TaskStatus) =>
  status === "resolved" || status === "rejected";

const deriveTaskStatus = (row: Pick<TaskRow, "session_state">): TaskStatus =>
  row.session_state ?? "pending";

const buildSchemaError = () => new Error("tasks schema is incompatible");

const buildProjectConfigurationError = (projectId: string) =>
  new Error(
    `Project ${projectId} is missing global provider/model configuration`,
  );

const getStringSourceMetadataField = (
  sourceMetadata: Record<string, unknown>,
  field: string,
) => {
  const value = sourceMetadata[field];

  return typeof value === "string" && value.trim().length > 0 ? value : null;
};

const getTaskCoverageKey = (task: Pick<Task, "source_metadata" | "title">) => {
  const dimensionId = getStringSourceMetadataField(
    task.source_metadata,
    "dimension_id",
  );
  const dimensionEvaluationId = getStringSourceMetadataField(
    task.source_metadata,
    "dimension_evaluation_id",
  );

  if (!dimensionId || !dimensionEvaluationId) {
    return null;
  }

  return {
    dimensionEvaluationId,
    dimensionId,
    key: `${task.title}\u0000${dimensionId}\u0000${dimensionEvaluationId}`,
    title: task.title,
  };
};

const buildDuplicateCoverageError = (
  coverage: NonNullable<ReturnType<typeof getTaskCoverageKey>>,
) =>
  new Error(
    `Task batch create duplicates unfinished Task Pool coverage for title "${coverage.title}", dimension_id "${coverage.dimensionId}", dimension_evaluation_id "${coverage.dimensionEvaluationId}"`,
  );

const normalizeColumnType = (type: string) => {
  const normalizedType = type.trim().toUpperCase();

  if (normalizedType === "TEXT" || normalizedType.startsWith("VARCHAR")) {
    return "TEXT";
  }

  if (normalizedType === "INTEGER" || normalizedType === "INT") {
    return "INTEGER";
  }

  if (normalizedType === "REAL" || normalizedType === "DOUBLE") {
    return "REAL";
  }

  if (normalizedType === "DATETIME") {
    return "TEXT";
  }

  return normalizedType;
};

const hasCompatibleSessionPredicate = (sql: null | string) => {
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
    normalizedPredicates.length === 1 &&
    normalizedPredicates[0] === "session_id is not null"
  );
};

const mapTaskRow = (row: TaskRow) => {
  const status = deriveTaskStatus(row);

  return taskSchema.parse({
    task_id: row.task_id,
    title: row.title,
    task_spec: row.task_spec,
    project_id: row.project_id,
    git_origin_url: row.git_origin_url,
    global_provider_id: row.global_provider_id,
    global_model_id: row.global_model_id,
    session_id: row.session_id,
    worktree_path: row.worktree_path,
    pull_request_url: row.pull_request_url,
    dependencies: JSON.parse(row.dependencies) as string[],
    result: row.result,
    source_metadata: JSON.parse(row.source_metadata) as Record<string, unknown>,
    source_baseline_freshness: {
      status: "unknown",
      source_commit: null,
      current_commit: null,
      summary:
        "Task source baseline metadata is missing latest_origin_main_commit",
    },
    opencode_session: null,
    done: isDoneStatus(status),
    status,
    created_at: normalizeSqliteDateTime(row.created_at),
    updated_at: normalizeSqliteDateTime(row.updated_at),
  });
};

const mapProjectRow = (row: ProjectRow) =>
  projectSchema.parse({
    id: row.id,
    name: row.name,
    git_origin_url: row.git_origin_url,
    global_provider_id: row.global_provider_id,
    global_model_id: row.global_model_id,
    optimizer_enabled: Boolean(row.optimizer_enabled),
    token_budget_limit: row.token_budget_limit,
    token_warning_threshold: row.token_warning_threshold,
    cost_warning_threshold: row.cost_warning_threshold,
    created_at: normalizeSqliteDateTime(row.created_at),
    updated_at: normalizeSqliteDateTime(row.updated_at),
  });

const validateTasksIndexes = (
  database: ReturnType<typeof openTaskDatabase>,
) => {
  const indexes = database
    .prepare(`PRAGMA index_list(${tasksTableName})`)
    .all() as IndexListRow[];
  const sessionIndex = indexes.find(
    (index) => index.name === taskSessionIndexName,
  );
  const sessionIndexSql = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?")
    .get(taskSessionIndexName) as { sql: null | string } | undefined;
  const sessionIndexColumns = database
    .prepare(`PRAGMA index_info(${taskSessionIndexName})`)
    .all() as Array<{ name: string }>;

  if (
    !sessionIndex ||
    sessionIndex.unique !== 1 ||
    sessionIndex.partial !== 1 ||
    sessionIndexColumns.length !== 1 ||
    sessionIndexColumns[0]?.name !== "session_id" ||
    !hasCompatibleSessionPredicate(sessionIndexSql?.sql ?? null)
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

const ensureTasksSourceMetadataColumn = (
  database: ReturnType<typeof openTaskDatabase>,
) => {
  const rows = database
    .prepare(`PRAGMA table_info(${tasksTableName})`)
    .all() as TableInfoRow[];

  if (!rows.some((row) => row.name === "source_metadata")) {
    database.exec(
      `ALTER TABLE ${tasksTableName} ADD COLUMN source_metadata TEXT NOT NULL DEFAULT '{}'`,
    );
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
  ensureTasksSourceMetadataColumn(database);
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
      session_id,
      worktree_path,
      pull_request_url,
      dependencies,
      result,
      source_metadata,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getProjectByIdStatement = database.prepare(`
    SELECT
      id,
      name,
      git_origin_url,
      global_provider_id,
      global_model_id,
      optimizer_enabled,
      token_budget_limit,
      token_warning_threshold,
      cost_warning_threshold,
      created_at,
      updated_at
    FROM ${projectsTableName}
    WHERE id = ?
  `);
  const listProjectsStatement = database.prepare(`
    SELECT
      id,
      name,
      git_origin_url,
      global_provider_id,
      global_model_id,
      optimizer_enabled,
      token_budget_limit,
      token_warning_threshold,
      cost_warning_threshold,
      created_at,
      updated_at
    FROM ${projectsTableName}
    ORDER BY created_at ASC, id ASC
  `);
  const insertProjectStatement = database.prepare(`
    INSERT INTO ${projectsTableName} (
      id,
      name,
      git_origin_url,
      global_provider_id,
      global_model_id,
      optimizer_enabled,
      token_budget_limit,
      token_warning_threshold,
      cost_warning_threshold,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateProjectStatement = database.prepare(`
    UPDATE ${projectsTableName}
    SET
      name = ?,
      git_origin_url = ?,
      global_provider_id = ?,
      global_model_id = ?,
      optimizer_enabled = ?,
      token_budget_limit = ?,
      token_warning_threshold = ?,
      cost_warning_threshold = ?,
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
      projects.git_origin_url AS git_origin_url,
      projects.global_provider_id AS global_provider_id,
      projects.global_model_id AS global_model_id,
      tasks.session_id,
      tasks.worktree_path,
      tasks.pull_request_url,
      tasks.dependencies,
      tasks.result,
      tasks.source_metadata,
      NULL AS session_state,
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
      projects.git_origin_url AS git_origin_url,
      projects.global_provider_id AS global_provider_id,
      projects.global_model_id AS global_model_id,
      tasks.session_id,
      tasks.worktree_path,
      tasks.pull_request_url,
      tasks.dependencies,
      tasks.result,
      tasks.source_metadata,
      NULL AS session_state,
      tasks.created_at,
      tasks.updated_at
    FROM ${tasksTableName} AS tasks
    INNER JOIN ${projectsTableName} AS projects ON projects.id = tasks.project_id
    WHERE tasks.task_id = ?
  `);
  const getTaskByIdWithSessionStateStatement = database.prepare(`
    SELECT
      tasks.task_id,
      tasks.title,
      tasks.task_spec,
      tasks.project_id,
      projects.git_origin_url AS git_origin_url,
      projects.global_provider_id AS global_provider_id,
      projects.global_model_id AS global_model_id,
      tasks.session_id,
      tasks.worktree_path,
      tasks.pull_request_url,
      tasks.dependencies,
      tasks.result,
      tasks.source_metadata,
      opencode_sessions.state AS session_state,
      tasks.created_at,
      tasks.updated_at
    FROM ${tasksTableName} AS tasks
    INNER JOIN ${projectsTableName} AS projects ON projects.id = tasks.project_id
    LEFT JOIN opencode_sessions ON opencode_sessions.session_id = tasks.session_id
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
      source_metadata = ?,
      updated_at = ?
    WHERE task_id = ?
  `);
  const deleteTaskStatement = database.prepare(
    `DELETE FROM ${tasksTableName} WHERE task_id = ?`,
  );
  const listUnfinishedTasksByProjectStatement = database.prepare(`
    SELECT
      tasks.task_id,
      tasks.title,
      tasks.task_spec,
      tasks.project_id,
      projects.git_origin_url AS git_origin_url,
      projects.global_provider_id AS global_provider_id,
      projects.global_model_id AS global_model_id,
      tasks.session_id,
      tasks.worktree_path,
      tasks.pull_request_url,
      tasks.dependencies,
      tasks.result,
      tasks.source_metadata,
      opencode_sessions.state AS session_state,
      tasks.created_at,
      tasks.updated_at
    FROM ${tasksTableName} AS tasks
    INNER JOIN ${projectsTableName} AS projects ON projects.id = tasks.project_id
    LEFT JOIN opencode_sessions ON opencode_sessions.session_id = tasks.session_id
    WHERE tasks.project_id = ? AND (opencode_sessions.state IS NULL OR opencode_sessions.state = 'pending')
    ORDER BY tasks.created_at ASC, tasks.rowid ASC
  `);
  const assignSessionIfUnassignedStatement = database.prepare(`
    UPDATE ${tasksTableName}
    SET session_id = ?, updated_at = ?
    WHERE task_id = ? AND session_id IS NULL
  `);

  return {
    [Symbol.asyncDispose]: asyncDisposeDatabase,
    getProjectById(projectId: string): Promise<null | Project> {
      const project = getProjectByIdStatement.get(projectId) as
        | ProjectRow
        | undefined;

      return Promise.resolve(project ? mapProjectRow(project) : null);
    },
    listProjects(): Project[] {
      const rows = listProjectsStatement.all() as ProjectRow[];

      return rows.map(mapProjectRow);
    },
    async createProject(input: CreateProjectRequest): Promise<Project> {
      const timestamp = new Date().toISOString();
      const project = mapProjectRow({
        id: randomUUID(),
        name: input.name,
        git_origin_url: input.git_origin_url,
        global_provider_id: input.global_provider_id,
        global_model_id: input.global_model_id,
        optimizer_enabled: Number(input.optimizer_enabled ?? false),
        token_budget_limit: input.token_budget_limit ?? null,
        token_warning_threshold: input.token_warning_threshold ?? null,
        cost_warning_threshold: input.cost_warning_threshold ?? null,
        created_at: timestamp,
        updated_at: timestamp,
      });

      insertProjectStatement.run(
        project.id,
        project.name,
        project.git_origin_url,
        project.global_provider_id,
        project.global_model_id,
        Number(project.optimizer_enabled),
        project.token_budget_limit,
        project.token_warning_threshold,
        project.cost_warning_threshold,
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
        optimizer_enabled: Number(
          patch.optimizer_enabled ?? Boolean(currentProject.optimizer_enabled),
        ),
        token_warning_threshold:
          patch.token_warning_threshold === undefined
            ? currentProject.token_warning_threshold
            : patch.token_warning_threshold,
        token_budget_limit:
          patch.token_budget_limit === undefined
            ? currentProject.token_budget_limit
            : patch.token_budget_limit,
        cost_warning_threshold:
          patch.cost_warning_threshold === undefined
            ? currentProject.cost_warning_threshold
            : patch.cost_warning_threshold,
        updated_at: new Date().toISOString(),
      });

      updateProjectStatement.run(
        updatedProject.name,
        updatedProject.git_origin_url,
        updatedProject.global_provider_id,
        updatedProject.global_model_id,
        Number(updatedProject.optimizer_enabled),
        updatedProject.token_budget_limit,
        updatedProject.token_warning_threshold,
        updatedProject.cost_warning_threshold,
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
          `SELECT id, name, git_origin_url, global_provider_id, global_model_id, optimizer_enabled, token_budget_limit, token_warning_threshold, cost_warning_threshold, created_at, updated_at FROM ${projectsTableName} ORDER BY created_at ASC, id ASC LIMIT 1`,
        )
        .get() as ProjectRow | undefined;

      return project ?? null;
    },
    async createTask(input: CreateTaskRequest): Promise<Task> {
      const timestamp = new Date().toISOString();
      const taskId = randomUUID();
      const projectId = input.project_id;

      if (!projectId) {
        throw new Error("Task requires project_id");
      }

      const project = getProjectByIdStatement.get(projectId) as
        | ProjectRow
        | undefined;

      if (!project) {
        throw new Error(`Project ${projectId} was not found`);
      }

      if (
        !project.global_provider_id.trim() ||
        !project.global_model_id.trim()
      ) {
        throw buildProjectConfigurationError(project.id);
      }

      const task = mapTaskRow({
        task_id: taskId,
        title: input.title,
        task_spec: input.task_spec,
        project_id: project.id,
        git_origin_url: project.git_origin_url,
        global_provider_id: project.global_provider_id,
        global_model_id: project.global_model_id,
        session_id: input.session_id ?? null,
        worktree_path: input.worktree_path ?? null,
        pull_request_url: input.pull_request_url ?? null,
        dependencies: JSON.stringify(input.dependencies ?? []),
        result: input.result ?? "",
        source_metadata: JSON.stringify({}),
        session_state: null,
        created_at: timestamp,
        updated_at: timestamp,
      });

      insertTaskStatement.run(
        task.task_id,
        task.title,
        task.task_spec,
        task.project_id,
        task.session_id,
        task.worktree_path,
        task.pull_request_url,
        JSON.stringify(task.dependencies),
        task.result,
        JSON.stringify(task.source_metadata),
        task.created_at,
        task.updated_at,
      );

      return (await this.getTaskById(task.task_id)) ?? task;
    },
    async createTaskBatch(
      input: CreateTaskBatchRequest,
    ): Promise<TaskBatchResponse> {
      const project = getProjectByIdStatement.get(input.project_id) as
        | ProjectRow
        | undefined;

      if (!project) {
        throw new Error(`Project ${input.project_id} was not found`);
      }

      const coveredKeys = new Set(
        (
          listUnfinishedTasksByProjectStatement.all(
            input.project_id,
          ) as TaskRow[]
        )
          .map((row) => getTaskCoverageKey(mapTaskRow(row)))
          .filter((coverage) => coverage !== null)
          .map((coverage) => coverage.key),
      );

      for (const operation of input.operations) {
        if (operation.type !== "create") {
          continue;
        }

        const coverage = getTaskCoverageKey({
          source_metadata: operation.task.source_metadata ?? {},
          title: operation.task.title,
        });

        if (!coverage) {
          continue;
        }

        if (coveredKeys.has(coverage.key)) {
          throw buildDuplicateCoverageError(coverage);
        }

        coveredKeys.add(coverage.key);
      }

      const results: TaskBatchResponse["results"] = [];

      database.exec("BEGIN");
      try {
        for (const operation of input.operations) {
          if (operation.type === "create") {
            const timestamp = new Date().toISOString();
            const sourceMetadata = JSON.stringify(
              operation.task.source_metadata ?? {},
            );
            const task = mapTaskRow({
              task_id: operation.task.task_id,
              title: operation.task.title,
              task_spec: operation.task.spec,
              project_id: project.id,
              git_origin_url: project.git_origin_url,
              global_provider_id: project.global_provider_id,
              global_model_id: project.global_model_id,
              session_id: operation.task.session_id ?? null,
              worktree_path: operation.task.worktree_path ?? null,
              pull_request_url: operation.task.pull_request_url ?? null,
              dependencies: JSON.stringify(operation.task.dependencies ?? []),
              result: operation.task.result ?? "",
              source_metadata: sourceMetadata,
              session_state: null,
              created_at: timestamp,
              updated_at: timestamp,
            });

            insertTaskStatement.run(
              task.task_id,
              task.title,
              task.task_spec,
              task.project_id,
              task.session_id,
              task.worktree_path,
              task.pull_request_url,
              JSON.stringify(task.dependencies),
              task.result,
              sourceMetadata,
              task.created_at,
              task.updated_at,
            );
            results.push({ task_id: task.task_id, type: "create" });

            continue;
          }

          const currentTask = getTaskByIdWithSessionStateStatement.get(
            operation.task_id,
          ) as TaskRow | undefined;

          if (!currentTask) {
            throw new Error(
              `Task batch cannot delete nonexistent task ${operation.task_id}`,
            );
          }

          const task = mapTaskRow(currentTask);

          if (task.project_id !== input.project_id) {
            throw new Error("Task batch cannot cross project_id");
          }

          if (isDoneStatus(task.status)) {
            throw new Error("Task batch cannot delete terminal tasks");
          }

          deleteTaskStatement.run(operation.task_id);
          results.push({ task_id: operation.task_id, type: "delete" });
        }

        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }

      return { results };
    },
    getTaskById(taskId: string): Promise<null | Task> {
      const row = getTaskByIdStatement.get(taskId) as TaskRow | undefined;

      return Promise.resolve(row ? mapTaskRow(row) : null);
    },
    listTasks(filters: ListTaskFilters = {}): Promise<Task[]> {
      if (
        filters.done === undefined &&
        filters.project_id === undefined &&
        filters.session_id === undefined &&
        filters.status === undefined
      ) {
        const rows = listTasksStatement.all() as TaskRow[];

        return Promise.resolve(rows.map(mapTaskRow));
      }

      if (filters.done === undefined && filters.status === undefined) {
        const whereClauses: string[] = [];
        const parameters: Array<number | string> = [];

        if (filters.project_id !== undefined) {
          whereClauses.push("tasks.project_id = ?");
          parameters.push(filters.project_id);
        }

        if (filters.session_id !== undefined) {
          whereClauses.push("tasks.session_id = ?");
          parameters.push(filters.session_id);
        }

        const rows = database
          .prepare(`
            SELECT
              tasks.task_id,
              tasks.title,
              tasks.task_spec,
              tasks.project_id,
              projects.git_origin_url AS git_origin_url,
              projects.global_provider_id AS global_provider_id,
              projects.global_model_id AS global_model_id,
              tasks.session_id,
              tasks.worktree_path,
              tasks.pull_request_url,
              tasks.dependencies,
              tasks.result,
              tasks.source_metadata,
              NULL AS session_state,
              tasks.created_at,
              tasks.updated_at
            FROM ${tasksTableName} AS tasks
            INNER JOIN ${projectsTableName} AS projects ON projects.id = tasks.project_id
            WHERE ${whereClauses.join(" AND ")}
            ORDER BY tasks.created_at ASC, tasks.rowid ASC
          `)
          .all(...parameters) as TaskRow[];

        return Promise.resolve(rows.map(mapTaskRow));
      }

      const whereClauses: string[] = [];
      const parameters: Array<number | string> = [];

      if (filters.status !== undefined) {
        whereClauses.push("COALESCE(opencode_sessions.state, 'pending') = ?");
        parameters.push(filters.status);
      }

      if (filters.done !== undefined) {
        whereClauses.push(
          filters.done
            ? "opencode_sessions.state IN ('resolved', 'rejected')"
            : "(opencode_sessions.state IS NULL OR opencode_sessions.state = 'pending')",
        );
      }

      if (filters.project_id !== undefined) {
        whereClauses.push("tasks.project_id = ?");
        parameters.push(filters.project_id);
      }

      if (filters.session_id !== undefined) {
        whereClauses.push("tasks.session_id = ?");
        parameters.push(filters.session_id);
      }

      const rows = database
        .prepare(`
          SELECT
            tasks.task_id,
            tasks.title,
            tasks.task_spec,
            tasks.project_id,
            projects.git_origin_url AS git_origin_url,
            projects.global_provider_id AS global_provider_id,
            projects.global_model_id AS global_model_id,
            tasks.session_id,
            tasks.worktree_path,
            tasks.pull_request_url,
            tasks.dependencies,
            tasks.result,
            tasks.source_metadata,
            opencode_sessions.state AS session_state,
            tasks.created_at,
            tasks.updated_at
          FROM ${tasksTableName} AS tasks
          INNER JOIN ${projectsTableName} AS projects ON projects.id = tasks.project_id
          LEFT JOIN opencode_sessions ON opencode_sessions.session_id = tasks.session_id
          WHERE ${whereClauses.join(" AND ")}
          ORDER BY tasks.created_at ASC, tasks.rowid ASC
        `)
        .all(...parameters) as TaskRow[];

      return Promise.resolve(rows.map(mapTaskRow));
    },
    listUnfinishedTasks(): Promise<Task[]> {
      return this.listTasks({ done: false });
    },
    async listRejectedTasksByProject(projectId: string): Promise<Task[]> {
      return this.listTasks({ project_id: projectId, status: "rejected" });
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
      const currentTaskRow = getTaskByIdStatement.get(taskId) as
        | TaskRow
        | undefined;

      if (!currentTaskRow) {
        return null;
      }

      const currentTask = mapTaskRow(currentTaskRow);

      const updatedTask = taskSchema.parse({
        ...currentTask,
        ...patch,
        task_id: currentTask.task_id,
        updated_at: new Date().toISOString(),
      });

      updateTaskStatement.run(
        updatedTask.task_spec,
        updatedTask.session_id,
        updatedTask.worktree_path,
        updatedTask.pull_request_url,
        JSON.stringify(updatedTask.dependencies),
        updatedTask.result,
        currentTaskRow.source_metadata,
        updatedTask.updated_at,
        taskId,
      );

      return this.getTaskById(taskId);
    },
    deleteTask(taskId: string): Promise<boolean> {
      const result = deleteTaskStatement.run(taskId);

      return Promise.resolve(result.changes > 0);
    },
  };
};
