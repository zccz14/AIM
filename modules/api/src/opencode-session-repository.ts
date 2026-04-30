import {
  type CreateOpenCodeSessionRequest,
  type OpenCodeSession,
  type OpenCodeSessionSettleRequest,
  type OpenCodeSessionState,
  openCodeSessionSchema,
  type PatchOpenCodeSessionRequest,
} from "@aim-ai/contract";

import { applySqliteTableSchema } from "./schema.js";
import {
  createTaskDatabaseAsyncDispose,
  openTaskDatabase,
} from "./task-database.js";

type OpenCodeSessionRow = {
  cached_tokens: number;
  cache_write_tokens: number;
  continue_prompt: null | string;
  created_at: string;
  input_tokens: number;
  model_id: null | string;
  output_tokens: number;
  reason: null | string;
  reasoning_tokens: number;
  provider_id: null | string;
  session_id: string;
  state: OpenCodeSessionState;
  updated_at: string;
  value: null | string;
};

type SessionReferenceRow = {
  id: string;
};

type OpenCodeSessionRepositoryOptions = {
  projectRoot?: string;
};

export type OpenCodeSessionTokenUsageInput = {
  cached_tokens: number;
  cache_write_tokens: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
};

const tableName = "opencode_sessions";
const defaultStaleAfterMilliseconds = 30 * 60 * 1000;

const getStaleAfterMilliseconds = () => {
  const rawValue = process.env.AIM_OPENCODE_SESSION_STALE_AFTER_MS;

  if (!rawValue) {
    return defaultStaleAfterMilliseconds;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  return Number.isFinite(parsedValue) && parsedValue >= 0
    ? parsedValue
    : defaultStaleAfterMilliseconds;
};

const isStalePendingSession = (row: OpenCodeSessionRow) => {
  if (row.state !== "pending") {
    return false;
  }

  const updatedAt = Date.parse(row.updated_at);

  return (
    !Number.isNaN(updatedAt) &&
    Date.now() - updatedAt >= getStaleAfterMilliseconds()
  );
};

const mapOpenCodeSessionRow = (row: OpenCodeSessionRow): OpenCodeSession =>
  openCodeSessionSchema.parse({
    cached_tokens: row.cached_tokens,
    cache_write_tokens: row.cache_write_tokens,
    continue_prompt: row.continue_prompt,
    created_at: row.created_at,
    input_tokens: row.input_tokens,
    model_id: row.model_id,
    output_tokens: row.output_tokens,
    provider_id: row.provider_id,
    reason: row.reason,
    reasoning_tokens: row.reasoning_tokens,
    session_id: row.session_id,
    stale: isStalePendingSession(row),
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
      provider_id,
      model_id,
      input_tokens,
      cached_tokens,
      cache_write_tokens,
      output_tokens,
      reasoning_tokens,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getByIdStatement = database.prepare(`
    SELECT session_id, state, value, reason, continue_prompt, provider_id, model_id, input_tokens, cached_tokens, cache_write_tokens, output_tokens, reasoning_tokens, created_at, updated_at
    FROM ${tableName}
    WHERE session_id = ?
  `);
  const listStatement = database.prepare(`
    SELECT session_id, state, value, reason, continue_prompt, provider_id, model_id, input_tokens, cached_tokens, cache_write_tokens, output_tokens, reasoning_tokens, created_at, updated_at
    FROM ${tableName}
    ORDER BY created_at ASC, session_id ASC
  `);
  const listByStateStatement = database.prepare(`
    SELECT session_id, state, value, reason, continue_prompt, provider_id, model_id, input_tokens, cached_tokens, cache_write_tokens, output_tokens, reasoning_tokens, created_at, updated_at
    FROM ${tableName}
    WHERE state = ?
    ORDER BY created_at ASC, session_id ASC
  `);
  const updateContinuePromptStatement = database.prepare(`
    UPDATE ${tableName}
    SET continue_prompt = ?, updated_at = ?
    WHERE session_id = ? AND state = 'pending'
  `);
  const settleStatement = database.prepare(`
    UPDATE ${tableName}
    SET state = ?, value = ?, reason = ?, updated_at = ?
    WHERE session_id = ? AND state = 'pending'
  `);
  const updateTokenUsageStatement = database.prepare(`
    UPDATE ${tableName}
    SET input_tokens = ?, cached_tokens = ?, cache_write_tokens = ?, output_tokens = ?, reasoning_tokens = ?, updated_at = ?
    WHERE session_id = ?
  `);
  const deleteByIdStatement = database.prepare(`
    DELETE FROM ${tableName}
    WHERE session_id = ?
  `);
  const getTaskReferencesStatement = database.prepare(`
    SELECT task_id AS id
    FROM tasks
    WHERE session_id = ?
    ORDER BY task_id ASC
  `);
  const getManagerStateReferencesStatement = database.prepare(`
    SELECT project_id AS id
    FROM manager_states
    WHERE session_id = ?
    ORDER BY project_id ASC
  `);
  const getCoordinatorStateReferencesStatement = database.prepare(`
    SELECT project_id AS id
    FROM coordinator_states
    WHERE session_id = ?
    ORDER BY project_id ASC
  `);

  const getReferenceIds = (
    statement: typeof getTaskReferencesStatement,
    sessionId: string,
  ) => (statement.all(sessionId) as SessionReferenceRow[]).map((row) => row.id);

  return {
    [Symbol.asyncDispose]: asyncDisposeDatabase,
    async createSession(
      input: CreateOpenCodeSessionRequest,
    ): Promise<OpenCodeSession> {
      const timestamp = new Date().toISOString();
      const session = mapOpenCodeSessionRow({
        continue_prompt: input.continue_prompt ?? null,
        created_at: timestamp,
        model_id: input.model_id ?? null,
        cached_tokens: 0,
        cache_write_tokens: 0,
        input_tokens: 0,
        output_tokens: 0,
        reasoning_tokens: 0,
        provider_id: input.provider_id ?? null,
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
        session.provider_id,
        session.model_id,
        session.input_tokens,
        session.cached_tokens,
        session.cache_write_tokens,
        session.output_tokens,
        session.reasoning_tokens,
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
    deleteSessionById(sessionId: string): void {
      deleteByIdStatement.run(sessionId);
    },
    getSessionReferences(sessionId: string): {
      coordinator_state_project_ids: string[];
      manager_state_project_ids: string[];
      task_ids: string[];
    } {
      return {
        coordinator_state_project_ids: getReferenceIds(
          getCoordinatorStateReferencesStatement,
          sessionId,
        ),
        manager_state_project_ids: getReferenceIds(
          getManagerStateReferencesStatement,
          sessionId,
        ),
        task_ids: getReferenceIds(getTaskReferencesStatement, sessionId),
      };
    },
    listSessions(
      filter: { state?: OpenCodeSessionState } = {},
    ): OpenCodeSession[] {
      const rows = (
        filter.state
          ? listByStateStatement.all(filter.state)
          : listStatement.all()
      ) as OpenCodeSessionRow[];

      return rows.map(mapOpenCodeSessionRow);
    },
    updateContinuePrompt(
      sessionId: string,
      input: PatchOpenCodeSessionRequest,
    ): null | OpenCodeSession {
      updateContinuePromptStatement.run(
        input.continue_prompt ?? null,
        new Date().toISOString(),
        sessionId,
      );

      return this.getSessionById(sessionId);
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
    updateSessionTokenUsage(
      sessionId: string,
      input: OpenCodeSessionTokenUsageInput,
    ): null | OpenCodeSession {
      updateTokenUsageStatement.run(
        input.input_tokens,
        input.cached_tokens,
        input.cache_write_tokens,
        input.output_tokens,
        input.reasoning_tokens,
        new Date().toISOString(),
        sessionId,
      );

      return this.getSessionById(sessionId);
    },
  };
};
