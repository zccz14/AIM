import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const defaultProjectRoot = fileURLToPath(new URL("../../../", import.meta.url));

const resolveProjectRoot = (projectRoot?: string) =>
  projectRoot ?? process.env.AIM_PROJECT_ROOT ?? defaultProjectRoot;

export const resolveTaskDatabasePath = (projectRoot?: string) =>
  join(resolveProjectRoot(projectRoot), "aim.sqlite");

export const openTaskDatabase = (projectRoot?: string) => {
  const resolvedProjectRoot = resolveProjectRoot(projectRoot);
  const databasePath = resolveTaskDatabasePath(resolvedProjectRoot);

  mkdirSync(resolvedProjectRoot, { recursive: true });

  return new DatabaseSync(databasePath);
};

export const createTaskDatabaseAsyncDispose = (
  database: ReturnType<typeof openTaskDatabase>,
) => {
  let disposed = false;

  return async () => {
    if (disposed) {
      return;
    }

    disposed = true;
    database.close();
  };
};
