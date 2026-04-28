import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const apiRoot = new URL("../", import.meta.url);
const schemaUrl = new URL("src/schema.sql", apiRoot);
const repositorySourceUrls = [
  new URL("src/dimension-repository.ts", apiRoot),
  new URL("src/optimizer-lane-state-repository.ts", apiRoot),
  new URL("src/task-repository.ts", apiRoot),
];

describe("api sqlite schema source", () => {
  it("keeps schema DDL in the api package schema.sql artifact", async () => {
    const schemaSql = await readFile(schemaUrl, "utf8");

    expect(schemaSql).toMatch(/CREATE TABLE IF NOT EXISTS projects/i);
    expect(schemaSql).toMatch(/CREATE TABLE IF NOT EXISTS tasks/i);
    expect(schemaSql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS tasks_unfinished_session_id_unique/i,
    );
    expect(schemaSql).toMatch(/CREATE TABLE IF NOT EXISTS dimensions/i);
    expect(schemaSql).toMatch(
      /CREATE TABLE IF NOT EXISTS dimension_evaluations/i,
    );
    expect(schemaSql).toMatch(
      /CREATE TABLE IF NOT EXISTS optimizer_lane_states/i,
    );
    expect(schemaSql).not.toMatch(
      /CREATE TABLE IF NOT EXISTS task_write_bulks/i,
    );
    expect(schemaSql).toMatch(/DROP TABLE IF EXISTS task_write_bulks/i);
    expect(schemaSql).not.toMatch(/manager_reports/i);
  });

  it("does not scatter schema DDL across api repository modules", async () => {
    for (const sourceUrl of repositorySourceUrls) {
      const source = await readFile(sourceUrl, "utf8");

      expect(source).not.toMatch(/CREATE\s+(?:TABLE|(?:UNIQUE\s+)?INDEX)\b/i);
    }
  });
});
