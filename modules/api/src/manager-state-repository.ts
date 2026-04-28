import { applySqliteTableSchema } from "./schema.js";
import {
  createTaskDatabaseAsyncDispose,
  openTaskDatabase,
} from "./task-database.js";

export type ManagerStateValue = "evaluating" | "failed";

export type ManagerState = {
  commit_sha: string;
  created_at: string;
  dimension_ids_json: string;
  last_error: null | string;
  project_id: string;
  session_id: null | string;
  state: ManagerStateValue;
  updated_at: string;
};

export type ManagerStateInput = {
  commit_sha: string;
  dimension_ids_json: string;
  last_error?: null | string;
  project_id: string;
  session_id?: null | string;
  state: ManagerStateValue;
};

type ManagerStateRepositoryOptions = {
  projectRoot?: string;
};

const tableName = "manager_states";

const bootstrapManagerStateDatabase = (projectRoot?: string) => {
  const database = openTaskDatabase(projectRoot);

  applySqliteTableSchema(database);

  return database;
};

export const createManagerStateRepository = (
  options: ManagerStateRepositoryOptions = {},
) => {
  const database = bootstrapManagerStateDatabase(options.projectRoot);
  const asyncDisposeDatabase = createTaskDatabaseAsyncDispose(database);
  const deleteStatement = database.prepare(`
    DELETE FROM ${tableName}
    WHERE project_id = ?
  `);
  const getStatement = database.prepare(`
    SELECT project_id, commit_sha, dimension_ids_json, session_id, state, last_error, created_at, updated_at
    FROM ${tableName}
    WHERE project_id = ?
  `);
  const upsertStatement = database.prepare(`
    INSERT INTO ${tableName} (
      project_id,
      commit_sha,
      dimension_ids_json,
      session_id,
      state,
      last_error,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      commit_sha = excluded.commit_sha,
      dimension_ids_json = excluded.dimension_ids_json,
      session_id = excluded.session_id,
      state = excluded.state,
      last_error = excluded.last_error,
      updated_at = excluded.updated_at
  `);

  return {
    [Symbol.asyncDispose]: asyncDisposeDatabase,
    clearManagerState(projectId: string): boolean {
      return deleteStatement.run(projectId).changes > 0;
    },
    getManagerState(projectId: string): ManagerState | null {
      return (getStatement.get(projectId) as ManagerState | undefined) ?? null;
    },
    upsertManagerState(input: ManagerStateInput): ManagerState {
      const existing = this.getManagerState(input.project_id);
      const timestamp = new Date().toISOString();

      upsertStatement.run(
        input.project_id,
        input.commit_sha,
        input.dimension_ids_json,
        input.session_id ?? null,
        input.state,
        input.last_error ?? null,
        existing?.created_at ?? timestamp,
        timestamp,
      );

      const state = this.getManagerState(input.project_id);

      if (!state) {
        throw new Error("manager state was not persisted");
      }

      return state;
    },
  };
};
