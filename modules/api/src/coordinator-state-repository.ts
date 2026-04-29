import { applySqliteTableSchema } from "./schema.js";
import {
  createTaskDatabaseAsyncDispose,
  openTaskDatabase,
} from "./task-database.js";

export type CoordinatorStateValue = "failed" | "planning";

export type CoordinatorState = {
  active_task_count: number;
  commit_sha: string;
  created_at: string;
  last_error: null | string;
  planning_input_hash: string;
  project_id: string;
  session_id: null | string;
  state: CoordinatorStateValue;
  threshold: number;
  updated_at: string;
};

export type CoordinatorStateInput = {
  active_task_count: number;
  commit_sha: string;
  last_error?: null | string;
  planning_input_hash: string;
  project_id: string;
  session_id?: null | string;
  state: CoordinatorStateValue;
  threshold: number;
};

type CoordinatorStateRepositoryOptions = {
  projectRoot?: string;
};

const tableName = "coordinator_states";

const bootstrapCoordinatorStateDatabase = (projectRoot?: string) => {
  const database = openTaskDatabase(projectRoot);

  applySqliteTableSchema(database);

  return database;
};

export const createCoordinatorStateRepository = (
  options: CoordinatorStateRepositoryOptions = {},
) => {
  const database = bootstrapCoordinatorStateDatabase(options.projectRoot);
  const asyncDisposeDatabase = createTaskDatabaseAsyncDispose(database);
  const deleteStatement = database.prepare(`
    DELETE FROM ${tableName}
    WHERE project_id = ?
  `);
  const getStatement = database.prepare(`
    SELECT project_id, commit_sha, active_task_count, threshold, planning_input_hash, session_id, state, last_error, created_at, updated_at
    FROM ${tableName}
    WHERE project_id = ?
  `);
  const upsertStatement = database.prepare(`
    INSERT INTO ${tableName} (
      project_id,
      commit_sha,
      active_task_count,
      threshold,
      planning_input_hash,
      session_id,
      state,
      last_error,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      commit_sha = excluded.commit_sha,
      active_task_count = excluded.active_task_count,
      threshold = excluded.threshold,
      planning_input_hash = excluded.planning_input_hash,
      session_id = excluded.session_id,
      state = excluded.state,
      last_error = excluded.last_error,
      updated_at = excluded.updated_at
  `);

  return {
    [Symbol.asyncDispose]: asyncDisposeDatabase,
    clearCoordinatorState(projectId: string): boolean {
      return deleteStatement.run(projectId).changes > 0;
    },
    getCoordinatorState(projectId: string): CoordinatorState | null {
      return (
        (getStatement.get(projectId) as CoordinatorState | undefined) ?? null
      );
    },
    upsertCoordinatorState(input: CoordinatorStateInput): CoordinatorState {
      const existing = this.getCoordinatorState(input.project_id);
      const timestamp = new Date().toISOString();

      upsertStatement.run(
        input.project_id,
        input.commit_sha,
        input.active_task_count,
        input.threshold,
        input.planning_input_hash,
        input.session_id ?? null,
        input.state,
        input.last_error ?? null,
        existing?.created_at ?? timestamp,
        timestamp,
      );

      const state = this.getCoordinatorState(input.project_id);

      if (!state) {
        throw new Error("coordinator state was not persisted");
      }

      return state;
    },
  };
};
