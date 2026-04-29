import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const apiRoot = new URL("../", import.meta.url);
const schemaUrl = new URL("src/schema.sql", apiRoot);
const repositorySourceUrls = [
  new URL("src/director-clarification-repository.ts", apiRoot),
  new URL("src/dimension-repository.ts", apiRoot),
  new URL("src/coordinator-state-repository.ts", apiRoot),
  new URL("src/manager-state-repository.ts", apiRoot),
  new URL("src/task-repository.ts", apiRoot),
];

describe("api sqlite schema source", () => {
  it("keeps schema DDL in the api package schema.sql artifact", async () => {
    const schemaSql = await readFile(schemaUrl, "utf8");

    expect(schemaSql).toMatch(/CREATE TABLE IF NOT EXISTS projects/i);
    expect(schemaSql).toMatch(/CREATE TABLE IF NOT EXISTS tasks/i);
    expect(schemaSql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS tasks_session_id_unique/i,
    );
    const tasksDdl = schemaSql.match(
      /CREATE TABLE IF NOT EXISTS tasks \([\s\S]*?\);/i,
    )?.[0];

    expect(tasksDdl).toBeDefined();
    expect(tasksDdl).not.toMatch(/\b(done|status)\b/i);
    expect(schemaSql).toMatch(/CREATE TABLE IF NOT EXISTS dimensions/i);
    expect(schemaSql).toMatch(
      /CREATE TABLE IF NOT EXISTS dimension_evaluations/i,
    );
    expect(schemaSql).toMatch(
      /CREATE TABLE IF NOT EXISTS director_clarifications/i,
    );
    expect(schemaSql).not.toMatch(
      /CREATE TABLE IF NOT EXISTS optimizer_lane_states/i,
    );
    expect(schemaSql).toMatch(/CREATE TABLE IF NOT EXISTS manager_states/i);
    expect(schemaSql).toMatch(/CREATE TABLE IF NOT EXISTS coordinator_states/i);
    const coordinatorStatesDdl = schemaSql.match(
      /CREATE TABLE IF NOT EXISTS coordinator_states \([\s\S]*?\);/i,
    )?.[0];

    expect(coordinatorStatesDdl).toBeDefined();
    expect(coordinatorStatesDdl).toMatch(/project_id TEXT PRIMARY KEY/i);
    expect(coordinatorStatesDdl).toMatch(
      /FOREIGN KEY \(project_id\) REFERENCES projects\(id\) ON DELETE CASCADE/i,
    );
    expect(coordinatorStatesDdl).toMatch(
      /FOREIGN KEY \(session_id\) REFERENCES opencode_sessions\(session_id\) ON DELETE SET NULL/i,
    );
    expect(schemaSql).not.toMatch(
      /CREATE TABLE IF NOT EXISTS task_write_bulks/i,
    );
    expect(schemaSql).toMatch(/DROP TABLE IF EXISTS task_write_bulks/i);
    expect(schemaSql).not.toMatch(/manager_reports/i);

    const opencodeSessionsDdl = schemaSql.match(
      /CREATE TABLE IF NOT EXISTS opencode_sessions \([\s\S]*?\);/i,
    )?.[0];
    expect(opencodeSessionsDdl).toBeDefined();
    expect(opencodeSessionsDdl).toMatchInlineSnapshot(`
      "CREATE TABLE IF NOT EXISTS opencode_sessions (
        session_id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        value TEXT,
        reason TEXT,
        continue_prompt TEXT,
        provider_id TEXT,
        model_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );"
    `);
  });

  it("does not scatter schema DDL across api repository modules", async () => {
    for (const sourceUrl of repositorySourceUrls) {
      const source = await readFile(sourceUrl, "utf8");

      expect(source).not.toMatch(/CREATE\s+(?:TABLE|(?:UNIQUE\s+)?INDEX)\b/i);
    }
  });
});
