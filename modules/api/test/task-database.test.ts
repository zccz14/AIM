import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openTaskDatabase } from "../src/task-database.js";

const tempRoot = join(process.cwd(), ".tmp", "modules-api-task-database");

const createProjectRoot = async (name: string) => {
  const projectRoot = join(tempRoot, name);

  await rm(projectRoot, { force: true, recursive: true });
  await mkdir(projectRoot, { recursive: true });

  return projectRoot;
};

const readPragmaValue = <Value>(
  database: ReturnType<typeof openTaskDatabase>,
  pragmaName: string,
) => {
  const row = database.prepare(`PRAGMA ${pragmaName}`).get() as Record<
    string,
    Value
  >;

  return Object.values(row)[0];
};

afterEach(async () => {
  await rm(tempRoot, { force: true, recursive: true });
});

describe("task database", () => {
  it("opens task databases with the shared SQLite busy baseline", async () => {
    const projectRoot = await createProjectRoot("shared-busy-baseline");

    using database = openTaskDatabase(projectRoot);

    expect(readPragmaValue<number>(database, "busy_timeout")).toBe(5000);
    expect(readPragmaValue<string>(database, "journal_mode")).toBe("wal");
    expect(readPragmaValue<number>(database, "synchronous")).toBe(1);
    expect(readPragmaValue<number>(database, "foreign_keys")).toBe(1);
  });
});
