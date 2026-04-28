import type { OptimizerLaneName } from "./optimizer-runtime.js";
import { applySqliteTableSchema } from "./schema.js";
import {
  createTaskDatabaseAsyncDispose,
  openTaskDatabase,
} from "./task-database.js";

export type OptimizerLaneState = {
  created_at: string;
  lane_name: Exclude<OptimizerLaneName, "developer_follow_up">;
  last_error: null | string;
  last_scan_at: null | string;
  project_id: string;
  session_id: null | string;
  updated_at: string;
};

export type OptimizerLaneStateInput = {
  lane_name: Exclude<OptimizerLaneName, "developer_follow_up">;
  last_error?: null | string;
  last_scan_at?: null | string;
  project_id: string;
  session_id?: null | string;
};

type OptimizerLaneStateRepositoryOptions = {
  projectRoot?: string;
};

const tableName = "optimizer_lane_states";

const bootstrapOptimizerLaneStateDatabase = (projectRoot?: string) => {
  const database = openTaskDatabase(projectRoot);

  applySqliteTableSchema(database);

  return database;
};

export const createOptimizerLaneStateRepository = (
  options: OptimizerLaneStateRepositoryOptions = {},
) => {
  const database = bootstrapOptimizerLaneStateDatabase(options.projectRoot);
  const asyncDisposeDatabase = createTaskDatabaseAsyncDispose(database);
  const getStatement = database.prepare(`
    SELECT project_id, lane_name, session_id, last_error, last_scan_at, created_at, updated_at
    FROM ${tableName}
    WHERE project_id = ? AND lane_name = ?
  `);
  const upsertStatement = database.prepare(`
    INSERT INTO ${tableName} (
      project_id,
      lane_name,
      session_id,
      last_error,
      last_scan_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, lane_name) DO UPDATE SET
      session_id = excluded.session_id,
      last_error = excluded.last_error,
      last_scan_at = excluded.last_scan_at,
      updated_at = excluded.updated_at
  `);

  return {
    [Symbol.asyncDispose]: asyncDisposeDatabase,
    getLaneState(
      projectId: string,
      laneName: Exclude<OptimizerLaneName, "developer_follow_up">,
    ): null | OptimizerLaneState {
      return (
        (getStatement.get(projectId, laneName) as
          | OptimizerLaneState
          | undefined) ?? null
      );
    },
    upsertLaneState(input: OptimizerLaneStateInput): OptimizerLaneState {
      const existing = this.getLaneState(input.project_id, input.lane_name);
      const timestamp = new Date().toISOString();

      upsertStatement.run(
        input.project_id,
        input.lane_name,
        input.session_id ?? null,
        input.last_error ?? null,
        input.last_scan_at ?? null,
        existing?.created_at ?? timestamp,
        timestamp,
      );

      const laneState = this.getLaneState(input.project_id, input.lane_name);

      if (!laneState) {
        throw new Error("optimizer lane state was not persisted");
      }

      return laneState;
    },
  };
};
