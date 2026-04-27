import { randomUUID } from "node:crypto";

import {
  type CreateDimensionEvaluationRequest,
  type CreateDimensionRequest,
  type Dimension,
  type DimensionEvaluation,
  dimensionEvaluationSchema,
  dimensionSchema,
  type PatchDimensionRequest,
} from "@aim-ai/contract";

import { applySqliteSchema } from "./schema.js";
import {
  createTaskDatabaseAsyncDispose,
  openTaskDatabase,
} from "./task-database.js";

type DimensionRow = {
  created_at: string;
  evaluation_method: string;
  goal: string;
  id: string;
  name: string;
  project_id: string;
  project_path: string;
  updated_at: string;
};

type DimensionEvaluationRow = {
  commit_sha: string;
  dimension_id: string;
  created_at: string;
  evaluation: string;
  evaluator_model: string;
  id: string;
  project_id: string;
  project_path: string;
  score: number;
};

type TableInfoRow = {
  name: string;
  notnull: 0 | 1;
  pk: 0 | 1;
  type: string;
};

type DimensionRepositoryOptions = {
  projectRoot?: string;
};

const dimensionsTableName = "dimensions";
const dimensionEvaluationsTableName = "dimension_evaluations";
const projectsTableName = "projects";

const dimensionColumns = [
  { name: "id", notnull: 1, pk: 1, type: "TEXT" },
  { name: "project_id", notnull: 1, pk: 0, type: "TEXT" },
  { name: "name", notnull: 1, pk: 0, type: "TEXT" },
  { name: "goal", notnull: 1, pk: 0, type: "TEXT" },
  { name: "evaluation_method", notnull: 1, pk: 0, type: "TEXT" },
  { name: "created_at", notnull: 1, pk: 0, type: "TEXT" },
  { name: "updated_at", notnull: 1, pk: 0, type: "TEXT" },
] as const;

const dimensionEvaluationColumns = [
  { name: "id", notnull: 1, pk: 1, type: "TEXT" },
  { name: "dimension_id", notnull: 1, pk: 0, type: "TEXT" },
  { name: "project_id", notnull: 1, pk: 0, type: "TEXT" },
  { name: "commit_sha", notnull: 1, pk: 0, type: "TEXT" },
  { name: "evaluator_model", notnull: 1, pk: 0, type: "TEXT" },
  { name: "score", notnull: 1, pk: 0, type: "INTEGER" },
  { name: "evaluation", notnull: 1, pk: 0, type: "TEXT" },
  { name: "created_at", notnull: 1, pk: 0, type: "TEXT" },
] as const;

const normalizeColumnType = (type: string) => {
  const normalizedType = type.trim().toUpperCase();

  if (normalizedType === "TEXT" || normalizedType.startsWith("VARCHAR")) {
    return "TEXT";
  }

  if (normalizedType === "INT") {
    return "INTEGER";
  }

  if (normalizedType === "DATETIME") {
    return "TEXT";
  }

  return normalizedType;
};

const buildSchemaError = () => new Error("dimensions schema is incompatible");

const mapDimensionRow = (row: DimensionRow) =>
  dimensionSchema.parse({
    id: row.id,
    project_path: row.project_path,
    name: row.name,
    goal: row.goal,
    evaluation_method: row.evaluation_method,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });

const mapDimensionEvaluationRow = (row: DimensionEvaluationRow) =>
  dimensionEvaluationSchema.parse({
    id: row.id,
    dimension_id: row.dimension_id,
    project_path: row.project_path,
    commit_sha: row.commit_sha,
    evaluator_model: row.evaluator_model,
    score: row.score,
    evaluation: row.evaluation,
    created_at: row.created_at,
  });

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

const bootstrapDimensionDatabase = (projectRoot?: string) => {
  const database = openTaskDatabase(projectRoot);

  database.exec("PRAGMA foreign_keys = ON");
  applySqliteSchema(database);
  validateTableSchema(database, dimensionsTableName, dimensionColumns);
  validateTableSchema(
    database,
    dimensionEvaluationsTableName,
    dimensionEvaluationColumns,
  );

  return database;
};

const nextUpdateTimestamp = (previousTimestamp: string) => {
  const now = new Date();
  const previous = new Date(previousTimestamp);

  if (now <= previous) {
    return new Date(previous.getTime() + 1).toISOString();
  }

  return now.toISOString();
};

export const createDimensionRepository = (
  options: DimensionRepositoryOptions = {},
) => {
  const database = bootstrapDimensionDatabase(options.projectRoot);
  const asyncDisposeDatabase = createTaskDatabaseAsyncDispose(database);
  const insertDimensionStatement = database.prepare(`
    INSERT INTO ${dimensionsTableName} (
      id,
      project_id,
      name,
      goal,
      evaluation_method,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const getDimensionStatement = database.prepare(`
    SELECT dimensions.id, dimensions.project_id, projects.project_path AS project_path, dimensions.name, dimensions.goal, dimensions.evaluation_method, dimensions.created_at, dimensions.updated_at
    FROM ${dimensionsTableName} AS dimensions
    INNER JOIN ${projectsTableName} AS projects ON projects.id = dimensions.project_id
    WHERE dimensions.id = ?
  `);
  const listDimensionsStatement = database.prepare(`
    SELECT dimensions.id, dimensions.project_id, projects.project_path AS project_path, dimensions.name, dimensions.goal, dimensions.evaluation_method, dimensions.created_at, dimensions.updated_at
    FROM ${dimensionsTableName} AS dimensions
    INNER JOIN ${projectsTableName} AS projects ON projects.id = dimensions.project_id
    WHERE projects.project_path = ?
    ORDER BY dimensions.created_at ASC, dimensions.rowid ASC
  `);
  const patchDimensionStatement = database.prepare(`
    UPDATE ${dimensionsTableName}
    SET name = ?, goal = ?, evaluation_method = ?, updated_at = ?
    WHERE id = ?
  `);
  const deleteDimensionStatement = database.prepare(`
    DELETE FROM ${dimensionsTableName}
    WHERE id = ?
  `);
  const insertDimensionEvaluationStatement = database.prepare(`
    INSERT INTO ${dimensionEvaluationsTableName} (
      id,
      dimension_id,
      project_id,
      commit_sha,
      evaluator_model,
      score,
      evaluation,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const listDimensionEvaluationsStatement = database.prepare(`
    SELECT evaluations.id, evaluations.dimension_id, evaluations.project_id, projects.project_path AS project_path, evaluations.commit_sha, evaluations.evaluator_model, evaluations.score, evaluations.evaluation, evaluations.created_at
    FROM ${dimensionEvaluationsTableName} AS evaluations
    INNER JOIN ${projectsTableName} AS projects ON projects.id = evaluations.project_id
    WHERE evaluations.dimension_id = ?
    ORDER BY evaluations.created_at ASC, evaluations.rowid ASC
  `);
  const ensureProjectStatement = database.prepare(`
    INSERT OR IGNORE INTO ${projectsTableName} (id, name, project_path, global_provider_id, global_model_id, created_at, updated_at)
    VALUES (?, ?, ?, '', '', ?, ?)
  `);

  return {
    [Symbol.asyncDispose]: asyncDisposeDatabase,
    createDimension(input: CreateDimensionRequest): Promise<Dimension> {
      const timestamp = new Date().toISOString();
      const projectId = input.project_path;
      ensureProjectStatement.run(
        projectId,
        projectId,
        input.project_path,
        timestamp,
        timestamp,
      );
      const dimension = dimensionSchema.parse({
        id: randomUUID(),
        project_path: input.project_path,
        name: input.name,
        goal: input.goal,
        evaluation_method: input.evaluation_method,
        created_at: timestamp,
        updated_at: timestamp,
      });

      insertDimensionStatement.run(
        dimension.id,
        projectId,
        dimension.name,
        dimension.goal,
        dimension.evaluation_method,
        dimension.created_at,
        dimension.updated_at,
      );

      return Promise.resolve(dimension);
    },
    getDimension(dimensionId: string): Promise<null | Dimension> {
      const row = getDimensionStatement.get(dimensionId) as
        | DimensionRow
        | undefined;

      return Promise.resolve(row ? mapDimensionRow(row) : null);
    },
    listDimensions(projectPath: string): Promise<Dimension[]> {
      const rows = listDimensionsStatement.all(projectPath) as DimensionRow[];

      return Promise.resolve(rows.map(mapDimensionRow));
    },
    patchDimension(
      dimensionId: string,
      input: PatchDimensionRequest,
    ): Promise<null | Dimension> {
      const existing = getDimensionStatement.get(dimensionId) as
        | DimensionRow
        | undefined;

      if (!existing) {
        return Promise.resolve(null);
      }

      const timestamp = nextUpdateTimestamp(existing.updated_at);

      patchDimensionStatement.run(
        input.name ?? existing.name,
        input.goal ?? existing.goal,
        input.evaluation_method ?? existing.evaluation_method,
        timestamp,
        dimensionId,
      );

      const updated = getDimensionStatement.get(dimensionId) as DimensionRow;

      return Promise.resolve(mapDimensionRow(updated));
    },
    deleteDimension(dimensionId: string): Promise<boolean> {
      const result = deleteDimensionStatement.run(dimensionId);

      return Promise.resolve(result.changes > 0);
    },
    createDimensionEvaluation(
      dimensionId: string,
      input: CreateDimensionEvaluationRequest,
    ): Promise<null | DimensionEvaluation> {
      const dimension = getDimensionStatement.get(dimensionId) as
        | DimensionRow
        | undefined;

      if (!dimension || dimension.project_path !== input.project_path) {
        return Promise.resolve(null);
      }

      const timestamp = new Date().toISOString();
      const dimensionEvaluation = dimensionEvaluationSchema.parse({
        id: randomUUID(),
        dimension_id: dimensionId,
        project_path: input.project_path,
        commit_sha: input.commit_sha,
        evaluator_model: input.evaluator_model,
        score: input.score,
        evaluation: input.evaluation,
        created_at: timestamp,
      });

      insertDimensionEvaluationStatement.run(
        dimensionEvaluation.id,
        dimensionEvaluation.dimension_id,
        dimension.project_id,
        dimensionEvaluation.commit_sha,
        dimensionEvaluation.evaluator_model,
        dimensionEvaluation.score,
        dimensionEvaluation.evaluation,
        dimensionEvaluation.created_at,
      );

      return Promise.resolve(dimensionEvaluation);
    },
    listDimensionEvaluations(
      dimensionId: string,
    ): Promise<DimensionEvaluation[]> {
      const rows = listDimensionEvaluationsStatement.all(
        dimensionId,
      ) as DimensionEvaluationRow[];

      return Promise.resolve(rows.map(mapDimensionEvaluationRow));
    },
  };
};
