import { readFile } from "node:fs/promises";

import { dbSqlitePath } from "@aim-ai/contract";
import type { Hono } from "hono";

import { resolveTaskDatabasePath } from "../task-database.js";

export const registerDbRoutes = (app: Hono) => {
  app.get(dbSqlitePath, async (context) => {
    const databaseBytes = await readFile(resolveTaskDatabasePath());

    return context.body(databaseBytes, 200, {
      "content-disposition": 'attachment; filename="aim.sqlite"',
      "content-type": "application/vnd.sqlite3",
    });
  });
};
