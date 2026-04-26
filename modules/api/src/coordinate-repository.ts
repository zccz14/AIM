import { randomUUID } from "node:crypto";

import {
  type Coordinate,
  type CoordinateEvaluation,
  type CreateCoordinateEvaluationRequest,
  type CreateCoordinateRequest,
  coordinateEvaluationSchema,
  coordinateSchema,
  type PatchCoordinateRequest,
} from "@aim-ai/contract";

import { openTaskDatabase } from "./task-database.js";

type CoordinateRow = {
  created_at: string;
  evaluation_method: string;
  goal: string;
  id: string;
  name: string;
  project_path: string;
  updated_at: string;
};

type CoordinateEvaluationRow = {
  commit_sha: string;
  coordinate_id: string;
  created_at: string;
  evaluation: string;
  evaluator_model: string;
  id: string;
  project_path: string;
  score: number;
};

type TableInfoRow = {
  name: string;
  notnull: 0 | 1;
  pk: 0 | 1;
  type: string;
};

type CoordinateRepositoryOptions = {
  projectRoot?: string;
};

const coordinatesTableName = "coordinates";
const coordinateEvaluationsTableName = "coordinate_evaluations";

const coordinateColumns = [
  { name: "id", notnull: 1, pk: 1, type: "TEXT" },
  { name: "project_path", notnull: 1, pk: 0, type: "TEXT" },
  { name: "name", notnull: 1, pk: 0, type: "TEXT" },
  { name: "goal", notnull: 1, pk: 0, type: "TEXT" },
  { name: "evaluation_method", notnull: 1, pk: 0, type: "TEXT" },
  { name: "created_at", notnull: 1, pk: 0, type: "TEXT" },
  { name: "updated_at", notnull: 1, pk: 0, type: "TEXT" },
] as const;

const coordinateEvaluationColumns = [
  { name: "id", notnull: 1, pk: 1, type: "TEXT" },
  { name: "coordinate_id", notnull: 1, pk: 0, type: "TEXT" },
  { name: "project_path", notnull: 1, pk: 0, type: "TEXT" },
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

const buildSchemaError = () => new Error("coordinates schema is incompatible");

const mapCoordinateRow = (row: CoordinateRow) =>
  coordinateSchema.parse({
    id: row.id,
    project_path: row.project_path,
    name: row.name,
    goal: row.goal,
    evaluation_method: row.evaluation_method,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });

const mapCoordinateEvaluationRow = (row: CoordinateEvaluationRow) =>
  coordinateEvaluationSchema.parse({
    id: row.id,
    coordinate_id: row.coordinate_id,
    project_path: row.project_path,
    commit_sha: row.commit_sha,
    evaluator_model: row.evaluator_model,
    score: row.score,
    evaluation: row.evaluation,
    created_at: row.created_at,
  });

const createCoordinateTables = (
  database: ReturnType<typeof openTaskDatabase>,
) => {
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS ${coordinatesTableName} (
      id TEXT NOT NULL PRIMARY KEY,
      project_path TEXT NOT NULL,
      name TEXT NOT NULL,
      goal TEXT NOT NULL,
      evaluation_method TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS ${coordinateEvaluationsTableName} (
      id TEXT NOT NULL PRIMARY KEY,
      coordinate_id TEXT NOT NULL,
      project_path TEXT NOT NULL,
      commit_sha TEXT NOT NULL,
      evaluator_model TEXT NOT NULL,
      score INTEGER NOT NULL,
      evaluation TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (coordinate_id) REFERENCES ${coordinatesTableName}(id) ON DELETE CASCADE
    )
  `);
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

const bootstrapCoordinateDatabase = (projectRoot?: string) => {
  const database = openTaskDatabase(projectRoot);

  createCoordinateTables(database);
  validateTableSchema(database, coordinatesTableName, coordinateColumns);
  validateTableSchema(
    database,
    coordinateEvaluationsTableName,
    coordinateEvaluationColumns,
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

export const createCoordinateRepository = (
  options: CoordinateRepositoryOptions = {},
) => {
  const database = bootstrapCoordinateDatabase(options.projectRoot);
  const insertCoordinateStatement = database.prepare(`
    INSERT INTO ${coordinatesTableName} (
      id,
      project_path,
      name,
      goal,
      evaluation_method,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const getCoordinateStatement = database.prepare(`
    SELECT id, project_path, name, goal, evaluation_method, created_at, updated_at
    FROM ${coordinatesTableName}
    WHERE id = ?
  `);
  const listCoordinatesStatement = database.prepare(`
    SELECT id, project_path, name, goal, evaluation_method, created_at, updated_at
    FROM ${coordinatesTableName}
    WHERE project_path = ?
    ORDER BY created_at ASC, rowid ASC
  `);
  const patchCoordinateStatement = database.prepare(`
    UPDATE ${coordinatesTableName}
    SET name = ?, goal = ?, evaluation_method = ?, updated_at = ?
    WHERE id = ?
  `);
  const deleteCoordinateStatement = database.prepare(`
    DELETE FROM ${coordinatesTableName}
    WHERE id = ?
  `);
  const insertCoordinateEvaluationStatement = database.prepare(`
    INSERT INTO ${coordinateEvaluationsTableName} (
      id,
      coordinate_id,
      project_path,
      commit_sha,
      evaluator_model,
      score,
      evaluation,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const listCoordinateEvaluationsStatement = database.prepare(`
    SELECT id, coordinate_id, project_path, commit_sha, evaluator_model, score, evaluation, created_at
    FROM ${coordinateEvaluationsTableName}
    WHERE coordinate_id = ?
    ORDER BY created_at ASC, rowid ASC
  `);

  return {
    createCoordinate(input: CreateCoordinateRequest): Promise<Coordinate> {
      const timestamp = new Date().toISOString();
      const coordinate = coordinateSchema.parse({
        id: randomUUID(),
        project_path: input.project_path,
        name: input.name,
        goal: input.goal,
        evaluation_method: input.evaluation_method,
        created_at: timestamp,
        updated_at: timestamp,
      });

      insertCoordinateStatement.run(
        coordinate.id,
        coordinate.project_path,
        coordinate.name,
        coordinate.goal,
        coordinate.evaluation_method,
        coordinate.created_at,
        coordinate.updated_at,
      );

      return Promise.resolve(coordinate);
    },
    getCoordinate(coordinateId: string): Promise<null | Coordinate> {
      const row = getCoordinateStatement.get(coordinateId) as
        | CoordinateRow
        | undefined;

      return Promise.resolve(row ? mapCoordinateRow(row) : null);
    },
    listCoordinates(projectPath: string): Promise<Coordinate[]> {
      const rows = listCoordinatesStatement.all(projectPath) as CoordinateRow[];

      return Promise.resolve(rows.map(mapCoordinateRow));
    },
    patchCoordinate(
      coordinateId: string,
      input: PatchCoordinateRequest,
    ): Promise<null | Coordinate> {
      const existing = getCoordinateStatement.get(coordinateId) as
        | CoordinateRow
        | undefined;

      if (!existing) {
        return Promise.resolve(null);
      }

      const timestamp = nextUpdateTimestamp(existing.updated_at);

      patchCoordinateStatement.run(
        input.name ?? existing.name,
        input.goal ?? existing.goal,
        input.evaluation_method ?? existing.evaluation_method,
        timestamp,
        coordinateId,
      );

      const updated = getCoordinateStatement.get(coordinateId) as CoordinateRow;

      return Promise.resolve(mapCoordinateRow(updated));
    },
    deleteCoordinate(coordinateId: string): Promise<boolean> {
      const result = deleteCoordinateStatement.run(coordinateId);

      return Promise.resolve(result.changes > 0);
    },
    createCoordinateEvaluation(
      coordinateId: string,
      input: CreateCoordinateEvaluationRequest,
    ): Promise<null | CoordinateEvaluation> {
      const coordinate = getCoordinateStatement.get(coordinateId) as
        | CoordinateRow
        | undefined;

      if (!coordinate || coordinate.project_path !== input.project_path) {
        return Promise.resolve(null);
      }

      const timestamp = new Date().toISOString();
      const coordinateEvaluation = coordinateEvaluationSchema.parse({
        id: randomUUID(),
        coordinate_id: coordinateId,
        project_path: input.project_path,
        commit_sha: input.commit_sha,
        evaluator_model: input.evaluator_model,
        score: input.score,
        evaluation: input.evaluation,
        created_at: timestamp,
      });

      insertCoordinateEvaluationStatement.run(
        coordinateEvaluation.id,
        coordinateEvaluation.coordinate_id,
        coordinateEvaluation.project_path,
        coordinateEvaluation.commit_sha,
        coordinateEvaluation.evaluator_model,
        coordinateEvaluation.score,
        coordinateEvaluation.evaluation,
        coordinateEvaluation.created_at,
      );

      return Promise.resolve(coordinateEvaluation);
    },
    listCoordinateEvaluations(
      coordinateId: string,
    ): Promise<CoordinateEvaluation[]> {
      const rows = listCoordinateEvaluationsStatement.all(
        coordinateId,
      ) as CoordinateEvaluationRow[];

      return Promise.resolve(rows.map(mapCoordinateEvaluationRow));
    },
  };
};
