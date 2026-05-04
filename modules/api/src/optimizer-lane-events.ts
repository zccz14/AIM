import { randomUUID } from "node:crypto";

import {
  createTaskDatabaseAsyncDispose,
  openTaskDatabase,
} from "./task-database.js";

export type OptimizerLaneName = "coordinator" | "developer" | "manager";

export type OptimizerLaneEventKind =
  | "failure"
  | "idle"
  | "noop"
  | "start"
  | "success";

export type OptimizerLaneEventInput = {
  event: OptimizerLaneEventKind;
  lane_name: OptimizerLaneName;
  project_id: string;
  session_id?: string;
  summary: string;
  task_id?: string;
};

export type OptimizerLaneRecentEvent = OptimizerLaneEventInput & {
  timestamp: string;
};

const maxEventsPerLane = 5;

type OptimizerLaneEventRow = {
  event: OptimizerLaneEventKind;
  lane_name: OptimizerLaneName;
  project_id: string;
  session_id: null | string;
  summary: string;
  task_id: null | string;
  timestamp: string;
};

type OptimizerLaneEventRecorderOptions = {
  projectRoot?: string;
};

const tableName = "optimizer_lane_events";

const bootstrapOptimizerLaneEventsSchema = (
  database: ReturnType<typeof openTaskDatabase>,
) => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      lane_name TEXT NOT NULL,
      event TEXT NOT NULL,
      summary TEXT NOT NULL,
      session_id TEXT,
      task_id TEXT,
      timestamp TEXT NOT NULL
    )
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS optimizer_lane_events_project_lane_timestamp_index
    ON ${tableName} (project_id, lane_name, timestamp)
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS optimizer_lane_events_project_timestamp_index
    ON ${tableName} (project_id, timestamp)
  `);
};

const mapEventRow = (row: OptimizerLaneEventRow): OptimizerLaneRecentEvent => ({
  event: row.event,
  lane_name: row.lane_name,
  project_id: row.project_id,
  ...(row.session_id === null ? {} : { session_id: row.session_id }),
  summary: row.summary,
  ...(row.task_id === null ? {} : { task_id: row.task_id }),
  timestamp: row.timestamp,
});

export const createOptimizerLaneEventRecorder = (
  options: OptimizerLaneEventRecorderOptions = {},
) => {
  const database = openTaskDatabase(options.projectRoot);
  const asyncDisposeDatabase = createTaskDatabaseAsyncDispose(database);

  bootstrapOptimizerLaneEventsSchema(database);

  const listStatement = database.prepare(`
    SELECT
      event,
      lane_name,
      project_id,
      session_id,
      summary,
      task_id,
      timestamp
    FROM ${tableName}
    WHERE project_id = ?
    ORDER BY timestamp DESC, rowid DESC
  `);
  const insertStatement = database.prepare(`
    INSERT INTO ${tableName} (
      id,
      project_id,
      lane_name,
      event,
      summary,
      session_id,
      task_id,
      timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const trimLaneStatement = database.prepare(`
    DELETE FROM ${tableName}
    WHERE project_id = ?
      AND lane_name = ?
      AND rowid NOT IN (
        SELECT rowid
        FROM ${tableName}
        WHERE project_id = ? AND lane_name = ?
        ORDER BY timestamp DESC, rowid DESC
        LIMIT ${maxEventsPerLane}
      )
  `);

  return {
    [Symbol.asyncDispose]: asyncDisposeDatabase,
    list(projectId: string) {
      const rows = listStatement.all(projectId) as OptimizerLaneEventRow[];

      return rows.map(mapEventRow);
    },
    record(input: OptimizerLaneEventInput) {
      insertStatement.run(
        randomUUID(),
        input.project_id,
        input.lane_name,
        input.event,
        input.summary,
        input.session_id ?? null,
        input.task_id ?? null,
        new Date().toISOString(),
      );

      trimLaneStatement.run(
        input.project_id,
        input.lane_name,
        input.project_id,
        input.lane_name,
      );
    },
  };
};
