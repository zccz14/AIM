import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";
import { dbSqlitePath } from "../../contract/src/index.js";
import { createApp } from "../src/app.js";

const tempRoot = join(process.cwd(), ".tmp", "modules-api-db-sqlite-route");

let previousProjectRoot: string | undefined;

const useProjectRoot = async (name: string) => {
  previousProjectRoot = process.env.AIM_PROJECT_ROOT;

  const projectRoot = join(tempRoot, name);

  await rm(projectRoot, { force: true, recursive: true });
  await mkdir(projectRoot, { recursive: true });

  process.env.AIM_PROJECT_ROOT = projectRoot;

  return projectRoot;
};

afterEach(async () => {
  if (previousProjectRoot === undefined) {
    delete process.env.AIM_PROJECT_ROOT;
  } else {
    process.env.AIM_PROJECT_ROOT = previousProjectRoot;
  }

  previousProjectRoot = undefined;

  await rm(tempRoot, { force: true, recursive: true });
});

describe("db sqlite route", () => {
  it("downloads the current AIM sqlite database as binary content", async () => {
    const projectRoot = await useProjectRoot("downloads-current-sqlite-file");
    const databasePath = join(projectRoot, "aim.sqlite");
    const database = new DatabaseSync(databasePath);

    database.exec(
      "CREATE TABLE sync_marker (id INTEGER PRIMARY KEY, value TEXT NOT NULL)",
    );
    database
      .prepare("INSERT INTO sync_marker (value) VALUES (?)")
      .run("cross-machine-sync");
    database.close();

    const expectedBytes = await readFile(databasePath);
    const app = createApp();

    const response = await app.request(dbSqlitePath);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/vnd.sqlite3",
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="aim.sqlite"',
    );
    expect(Buffer.from(await response.arrayBuffer())).toEqual(expectedBytes);
  });
});
