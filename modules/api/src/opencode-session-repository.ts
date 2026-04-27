import {
  type CreateOpenCodeSessionRequest,
  type OpenCodeSession,
  type OpenCodeSessionSettleRequest,
  type OpenCodeSessionState,
  openCodeSessionSchema,
} from "@aim-ai/contract";

import { applySqliteTableSchema } from "./schema.js";
import {
  createTaskDatabaseAsyncDispose,
  openTaskDatabase,
} from "./task-database.js";

type OpenCodeSessionRow = {
  continue_prompt: null | string;
  created_at: string;
  reason: null | string;
  session_id: string;
  state: OpenCodeSessionState;
  updated_at: string;
  value: null | string;
};

type OpenCodeSessionRepositoryOptions = {
  projectRoot?: string;
};

const tableName = "opencode_sessions";

const mapOpenCodeSessionRow = (row: OpenCodeSessionRow): OpenCodeSession =>
  openCodeSessionSchema.parse({
    continue_prompt: row.continue_prompt,
    created_at: row.created_at,
    reason: row.reason,
    session_id: row.session_id,
    state: row.state,
    updated_at: row.updated_at,
    value: row.value,
  });

const bootstrapOpenCodeSessionDatabase = (projectRoot?: string) => {
  const database = openTaskDatabase(projectRoot);

  applySqliteTableSchema(database);

  return database;
};

export const createOpenCodeSessionRepository = (
  options: OpenCodeSessionRepositoryOptions = {},
) => {
  const database = bootstrapOpenCodeSessionDatabase(options.projectRoot);
  const asyncDisposeDatabase = createTaskDatabaseAsyncDispose(database);
  const insertStatement = database.prepare(`
    INSERT INTO ${tableName} (
      session_id,
      state,
      value,
      reason,
      continue_prompt,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const getByIdStatement = database.prepare(`
    SELECT session_id, state, value, reason, continue_prompt, created_at, updated_at
    FROM ${tableName}
    WHERE session_id = ?
  `);
  const settleStatement = database.prepare(`
    UPDATE ${tableName}
    SET state = ?, value = ?, reason = ?, updated_at = ?
    WHERE session_id = ?
  `);

  return {
    [Symbol.asyncDispose]: asyncDisposeDatabase,
    createSession(input: CreateOpenCodeSessionRequest): OpenCodeSession {
      const timestamp = new Date().toISOString();
      const session = mapOpenCodeSessionRow({
        continue_prompt: input.continue_prompt ?? null,
        created_at: timestamp,
        reason: null,
        session_id: input.session_id,
        state: "pending",
        updated_at: timestamp,
        value: null,
      });

      insertStatement.run(
        session.session_id,
        session.state,
        session.value,
        session.reason,
        session.continue_prompt,
        session.created_at,
        session.updated_at,
      );

      return session;
    },
    getSessionById(sessionId: string): null | OpenCodeSession {
      const row = getByIdStatement.get(sessionId) as
        | OpenCodeSessionRow
        | undefined;

      return row ? mapOpenCodeSessionRow(row) : null;
    },
    settleSession(
      sessionId: string,
      state: Exclude<OpenCodeSessionState, "pending">,
      input: OpenCodeSessionSettleRequest,
    ): null | OpenCodeSession {
      settleStatement.run(
        state,
        state === "resolved" ? (input.value ?? "") : null,
        state === "rejected" ? (input.reason ?? "") : null,
        new Date().toISOString(),
        sessionId,
      );

      return this.getSessionById(sessionId);
    },
  };
};
