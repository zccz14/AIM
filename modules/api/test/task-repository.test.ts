import { access, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import { taskSchema } from "../../contract/src/index.js";

import { resolveTaskDatabasePath } from "../src/task-database.js";
import { createTaskRepository } from "../src/task-repository.js";

type TableInfoRow = {
  dflt_value: null | string;
  name: string;
  notnull: 0 | 1;
  pk: 0 | 1;
  type: string;
};

type IndexListRow = {
  name: string;
  origin: string;
  partial: 0 | 1;
  seq: number;
  unique: 0 | 1;
};

const tempRoot = join(process.cwd(), ".tmp", "modules-api-task-repository");
const defaultDatabasePath = fileURLToPath(
  new URL("../../../aim.sqlite", import.meta.url),
);

const ensureMissing = async (filePath: string) => {
  await expect(access(filePath)).rejects.toThrow();
};

const createProjectRoot = async (name: string) => {
  const projectRoot = join(tempRoot, name);

  await rm(projectRoot, { force: true, recursive: true });
  await mkdir(projectRoot, { recursive: true });

  return projectRoot;
};

afterEach(async () => {
  delete process.env.AIM_PROJECT_ROOT;
  await rm(tempRoot, { force: true, recursive: true });
});

describe("task repository", () => {
  it("resolves the default database path from the repo root", async () => {
    const projectRoot = await createProjectRoot("default-root-resolution");
    const originalWorkingDirectory = process.cwd();

    process.chdir(projectRoot);

    try {
      expect(resolveTaskDatabasePath()).toBe(defaultDatabasePath);
    } finally {
      process.chdir(originalWorkingDirectory);
    }
  });

  it("creates aim.sqlite automatically in the project root", async () => {
    const projectRoot = await createProjectRoot("creates-db-file");
    const databasePath = join(projectRoot, "aim.sqlite");

    await ensureMissing(databasePath);

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();

    await repository.listTasks();

    await expect(access(databasePath)).resolves.toBeUndefined();
  });

  it("creates the tasks table automatically before storing rows", async () => {
    const projectRoot = await createProjectRoot("creates-tasks-table");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const createdTask = await repository.createTask({
      task_spec: "bootstrap repository schema",
      project_path: "/repo/bootstrap",
      status: "succeeded",
    });
    const tasks = await repository.listTasks();
    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));
    const resultColumn = database
      .prepare("PRAGMA table_info(tasks)")
      .all()
      .find((row) => (row as TableInfoRow).name === "result") as
      | TableInfoRow
      | undefined;
    const persistedRow = database
      .prepare("SELECT done, result FROM tasks WHERE task_id = ?")
      .get(createdTask.task_id) as undefined | { done: number; result: string };
    database.close();

    expect(taskSchema.safeParse(createdTask).success).toBe(true);
    expect(createdTask.done).toBe(true);
    expect(createdTask.project_path).toBe("/repo/bootstrap");
    expect(createdTask.result).toBe("");
    expect(resultColumn).toMatchObject({
      dflt_value: "''",
      name: "result",
      notnull: 1,
      pk: 0,
      type: "TEXT",
    });
    expect(persistedRow).toEqual({ done: 1, result: "" });
    expect(tasks).toEqual([createdTask]);
  });

  it("supports full CRUD with filter-aware listing", async () => {
    const projectRoot = await createProjectRoot("supports-full-crud");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const firstTask = await repository.createTask({
      task_spec: "keep running",
      project_path: "/repo/session-a/running",
      session_id: "session-a",
      status: "running",
    });
    const secondTask = await repository.createTask({
      task_spec: "complete later",
      project_path: "/repo/session-a/created",
      session_id: "session-a-pending",
      dependencies: [firstTask.task_id],
      status: "created",
    });
    const thirdTask = await repository.createTask({
      task_spec: "different session",
      project_path: "/repo/session-b/failed",
      session_id: "session-b",
      status: "failed",
    });

    await expect(repository.getTaskById(secondTask.task_id)).resolves.toEqual(
      secondTask,
    );
    await expect(
      repository.listTasks({ session_id: "session-a" }),
    ).resolves.toEqual([firstTask]);
    await expect(
      repository.listTasks({ session_id: "session-a-pending" }),
    ).resolves.toEqual([secondTask]);
    await expect(repository.listTasks({ status: "failed" })).resolves.toEqual([
      thirdTask,
    ]);
    await expect(repository.listTasks({ done: true })).resolves.toEqual([
      thirdTask,
    ]);

    const updatedTask = await repository.updateTask(secondTask.task_id, {
      pull_request_url: "https://example.test/pr/2",
      status: "succeeded",
      task_spec: "complete now",
    });

    expect(updatedTask.task_id).toBe(secondTask.task_id);
    expect(updatedTask.task_spec).toBe("complete now");
    expect(updatedTask.project_path).toBe("/repo/session-a/created");
    expect(updatedTask.session_id).toBe("session-a-pending");
    expect(updatedTask.dependencies).toEqual([firstTask.task_id]);
    expect(updatedTask.pull_request_url).toBe("https://example.test/pr/2");
    expect(updatedTask.status).toBe("succeeded");
    expect(updatedTask.done).toBe(true);
    expect(Date.parse(updatedTask.updated_at)).toBeGreaterThanOrEqual(
      Date.parse(secondTask.updated_at),
    );

    await expect(repository.getTaskById(updatedTask.task_id)).resolves.toEqual(
      updatedTask,
    );
    const doneTasks = await repository.listTasks({ done: true });

    expect(doneTasks).toHaveLength(2);
    expect(doneTasks.map((task) => task.task_id).sort()).toEqual(
      [updatedTask.task_id, thirdTask.task_id].sort(),
    );

    await expect(repository.deleteTask(firstTask.task_id)).resolves.toBe(true);
    await expect(repository.getTaskById(firstTask.task_id)).resolves.toBeNull();
    await expect(repository.deleteTask(firstTask.task_id)).resolves.toBe(false);
  });

  it("preserves the current result when a patch omits it", async () => {
    const projectRoot = await createProjectRoot("patch-omits-result");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const task = await repository.createTask({
      project_path: "/repo/patch-omits-result",
      result: "keep me",
      status: "running",
      task_spec: "preserve result",
    });

    const updatedTask = await repository.updateTask(task.task_id, {
      status: "succeeded",
      task_spec: "preserve existing result",
    });

    expect(updatedTask).toMatchObject({
      done: true,
      result: "keep me",
      status: "succeeded",
      task_id: task.task_id,
    });
  });

  it("updates the result when a patch explicitly includes it", async () => {
    const projectRoot = await createProjectRoot("patch-updates-result");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const task = await repository.createTask({
      project_path: "/repo/patch-updates-result",
      result: "before",
      status: "running",
      task_spec: "replace result",
    });

    const updatedTask = await repository.updateTask(task.task_id, {
      result: "after",
    });

    expect(updatedTask).toMatchObject({
      result: "after",
      status: "running",
      task_id: task.task_id,
    });
  });

  it("resolves and rejects tasks while persisting their terminal result", async () => {
    const projectRoot = await createProjectRoot("terminal-result-helpers");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const resolvedTask = await repository.createTask({
      project_path: "/repo/terminal-result-helpers/resolved",
      status: "running",
      task_spec: "resolve me",
    });
    const rejectedTask = await repository.createTask({
      project_path: "/repo/terminal-result-helpers/rejected",
      status: "running",
      task_spec: "reject me",
    });

    await expect(
      repository.resolveTask(resolvedTask.task_id, "ship it"),
    ).resolves.toMatchObject({
      done: true,
      result: "ship it",
      status: "succeeded",
      task_id: resolvedTask.task_id,
    });
    await expect(
      repository.rejectTask(rejectedTask.task_id, "needs more work"),
    ).resolves.toMatchObject({
      done: true,
      result: "needs more work",
      status: "failed",
      task_id: rejectedTask.task_id,
    });
    await expect(
      repository.getTaskById(resolvedTask.task_id),
    ).resolves.toMatchObject({
      result: "ship it",
      status: "succeeded",
    });
    await expect(
      repository.getTaskById(rejectedTask.task_id),
    ).resolves.toMatchObject({
      result: "needs more work",
      status: "failed",
    });
  });

  it("lists only unfinished tasks for the scheduler", async () => {
    const projectRoot = await createProjectRoot("lists-unfinished-tasks");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const runningTask = await repository.createTask({
      task_spec: "still running",
      project_path: "/repo/unfinished/running",
      status: "running",
    });
    const createdTask = await repository.createTask({
      task_spec: "queued",
      project_path: "/repo/unfinished/queued",
      status: "created",
    });
    await repository.createTask({
      task_spec: "already done",
      project_path: "/repo/unfinished/done",
      status: "succeeded",
    });

    await expect(repository.listUnfinishedTasks()).resolves.toEqual([
      runningTask,
      createdTask,
    ]);
  });

  it("binds a session only when the task is still unassigned", async () => {
    const projectRoot = await createProjectRoot(
      "assigns-session-if-unassigned",
    );

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const task = await repository.createTask({
      task_spec: "claim me once",
      project_path: "/repo/claim-once",
      status: "created",
    });

    const claimedTask = await repository.assignSessionIfUnassigned(
      task.task_id,
      "session-a",
    );
    const rejectedClaim = await repository.assignSessionIfUnassigned(
      task.task_id,
      "session-b",
    );

    expect(claimedTask?.session_id).toBe("session-a");
    expect(rejectedClaim).toEqual(claimedTask);
  });

  it("returns the latest snapshot after losing the session assignment race", async () => {
    const projectRoot = await createProjectRoot(
      "loses-session-assignment-race",
    );

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const task = await repository.createTask({
      task_spec: "race me",
      project_path: "/repo/race-me",
      status: "created",
    });
    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));

    database
      .prepare("UPDATE tasks SET session_id = ? WHERE task_id = ?")
      .run("winning-session", task.task_id);
    database.close();

    await expect(
      repository.assignSessionIfUnassigned(task.task_id, "losing-session"),
    ).resolves.toMatchObject({
      task_id: task.task_id,
      session_id: "winning-session",
    });
  });

  it("does not bind a session after the task finishes during the assignment race", async () => {
    const projectRoot = await createProjectRoot(
      "assignment-race-with-done-task",
    );

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const task = await repository.createTask({
      task_spec: "finish before binding",
      project_path: "/repo/finish-first",
      status: "created",
    });
    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));

    database
      .prepare("UPDATE tasks SET done = 1, status = ? WHERE task_id = ?")
      .run("succeeded", task.task_id);
    database.close();

    await expect(
      repository.assignSessionIfUnassigned(task.task_id, "late-session"),
    ).resolves.toMatchObject({
      task_id: task.task_id,
      done: true,
      session_id: null,
      status: "succeeded",
    });
  });

  it("allows multiple unfinished tasks without session assignments", async () => {
    const projectRoot = await createProjectRoot("multiple-null-sessions");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const firstTask = await repository.createTask({
      task_spec: "null session first",
      project_path: "/repo/null-session/first",
      status: "running",
    });
    const secondTask = await repository.createTask({
      task_spec: "null session second",
      project_path: "/repo/null-session/second",
      status: "created",
    });

    await expect(repository.listUnfinishedTasks()).resolves.toEqual([
      firstTask,
      secondTask,
    ]);
  });

  it("rejects a second unfinished task with the same non-null session_id", async () => {
    const projectRoot = await createProjectRoot(
      "rejects-duplicate-unfinished-session",
    );

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    await repository.createTask({
      task_spec: "first shared session task",
      project_path: "/repo/shared-session/first",
      session_id: "shared-session",
      status: "running",
    });

    await expect(
      repository.createTask({
        task_spec: "second shared session task",
        project_path: "/repo/shared-session/second",
        session_id: "shared-session",
        status: "created",
      }),
    ).rejects.toThrow(/unique|constraint/i);
  });

  it("reuses a session_id after the earlier task is done", async () => {
    const projectRoot = await createProjectRoot("reuses-finished-session-id");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const firstTask = await repository.createTask({
      task_spec: "finish before reuse",
      project_path: "/repo/reuse-session/first",
      session_id: "reusable-session",
      status: "running",
    });

    await expect(
      repository.updateTask(firstTask.task_id, { status: "succeeded" }),
    ).resolves.toMatchObject({
      done: true,
      session_id: "reusable-session",
      status: "succeeded",
      task_id: firstTask.task_id,
    });

    await expect(
      repository.createTask({
        task_spec: "reuse after completion",
        project_path: "/repo/reuse-session/second",
        session_id: "reusable-session",
        status: "created",
      }),
    ).resolves.toMatchObject({
      done: false,
      session_id: "reusable-session",
      status: "created",
    });
  });

  it("fails fast when the tasks table schema is incompatible", async () => {
    const projectRoot = await createProjectRoot("rejects-bad-schema");
    const databasePath = join(projectRoot, "aim.sqlite");
    const database = new DatabaseSync(databasePath);

    database.exec(
      "CREATE TABLE tasks (task_id TEXT PRIMARY KEY, task_spec INTEGER NOT NULL)",
    );
    database.close();

    process.env.AIM_PROJECT_ROOT = projectRoot;

    expect(() => createTaskRepository()).toThrowError(/tasks schema/i);
  });

  it("fails fast when an existing tasks table lacks project_path", async () => {
    const projectRoot = await createProjectRoot("rejects-missing-project-path");
    const databasePath = join(projectRoot, "aim.sqlite");
    const database = new DatabaseSync(databasePath);

    database.exec(`
      CREATE TABLE tasks (
        task_id TEXT PRIMARY KEY,
        task_spec TEXT NOT NULL,
        session_id TEXT,
        worktree_path TEXT,
        pull_request_url TEXT,
        dependencies TEXT NOT NULL,
        result TEXT NOT NULL DEFAULT '',
        done INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    database.close();

    process.env.AIM_PROJECT_ROOT = projectRoot;

    expect(() => createTaskRepository()).toThrowError(
      /tasks schema is incompatible/i,
    );
  });

  it("accepts a semantically compatible existing tasks schema", async () => {
    const projectRoot = await createProjectRoot("accepts-compatible-schema");
    const databasePath = join(projectRoot, "aim.sqlite");
    const database = new DatabaseSync(databasePath);

    database.exec(`
      CREATE TABLE tasks (
        task_id text PRIMARY KEY,
        task_spec varchar(255) NOT NULL,
        project_path varchar(255) NOT NULL,
        session_id text,
        worktree_path text,
        pull_request_url text,
        dependencies text NOT NULL,
        result text NOT NULL default '',
        done int NOT NULL,
        status varchar(32) NOT NULL,
        created_at datetime NOT NULL,
        updated_at datetime NOT NULL
      )
    `);
    database.exec(`
      CREATE UNIQUE INDEX tasks_unfinished_session_id_unique
      ON tasks (session_id)
      WHERE done = 0 AND session_id IS NOT NULL
    `);
    database.close();

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const createdTask = await repository.createTask({
      task_spec: "compatible schema bootstrap",
      project_path: "/repo/compatible-schema",
    });

    await expect(repository.getTaskById(createdTask.task_id)).resolves.toEqual(
      createdTask,
    );
  });

  it("creates a partial unique index for unfinished non-null sessions", async () => {
    const projectRoot = await createProjectRoot(
      "creates-unfinished-session-index",
    );

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();

    await repository.listTasks();

    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));
    const index = database
      .prepare("PRAGMA index_list(tasks)")
      .all()
      .find(
        (row) =>
          (row as IndexListRow).name === "tasks_unfinished_session_id_unique",
      ) as IndexListRow | undefined;
    const indexColumns = database
      .prepare("PRAGMA index_info(tasks_unfinished_session_id_unique)")
      .all() as Array<{ name: string }>;
    const indexSql = database
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?",
      )
      .get("tasks_unfinished_session_id_unique") as { sql: string } | undefined;
    database.close();

    expect(index).toMatchObject({
      name: "tasks_unfinished_session_id_unique",
      partial: 1,
      unique: 1,
    });
    expect(indexColumns).toHaveLength(1);
    expect(indexColumns[0]).toMatchObject({ name: "session_id" });
    expect(indexSql?.sql).toContain(
      "WHERE done = 0 AND session_id IS NOT NULL",
    );
  });

  it("bootstraps the session index onto a compatible existing schema", async () => {
    const projectRoot = await createProjectRoot(
      "bootstraps-missing-session-index",
    );
    const databasePath = join(projectRoot, "aim.sqlite");
    const database = new DatabaseSync(databasePath);

    database.exec(`
      CREATE TABLE tasks (
        task_id text PRIMARY KEY,
        task_spec varchar(255) NOT NULL,
        project_path varchar(255) NOT NULL,
        session_id text,
        worktree_path text,
        pull_request_url text,
        dependencies text NOT NULL,
        result text NOT NULL default '',
        done int NOT NULL,
        status varchar(32) NOT NULL,
        created_at datetime NOT NULL,
        updated_at datetime NOT NULL
      )
    `);
    database.close();

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();

    await repository.listTasks();

    const bootstrappedDatabase = new DatabaseSync(databasePath);
    const index = bootstrappedDatabase
      .prepare("PRAGMA index_list(tasks)")
      .all()
      .find(
        (row) =>
          (row as IndexListRow).name === "tasks_unfinished_session_id_unique",
      ) as IndexListRow | undefined;
    bootstrappedDatabase.close();

    expect(index).toMatchObject({
      name: "tasks_unfinished_session_id_unique",
      partial: 1,
      unique: 1,
    });
  });

  it("rejects an existing result column when it lacks the empty-string default", async () => {
    const projectRoot = await createProjectRoot(
      "rejects-result-without-default",
    );
    const databasePath = join(projectRoot, "aim.sqlite");
    const database = new DatabaseSync(databasePath);

    database.exec(`
      CREATE TABLE tasks (
        task_id TEXT PRIMARY KEY,
        task_spec TEXT NOT NULL,
        project_path TEXT NOT NULL,
        session_id TEXT,
        worktree_path TEXT,
        pull_request_url TEXT,
        dependencies TEXT NOT NULL,
        result TEXT NOT NULL,
        done INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    database.close();

    process.env.AIM_PROJECT_ROOT = projectRoot;

    expect(() => createTaskRepository()).toThrowError(
      /tasks schema is incompatible/i,
    );
  });

  it("resolves the database path from AIM_PROJECT_ROOT when set", async () => {
    const projectRoot = await createProjectRoot("env-root-resolution");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    expect(resolveTaskDatabasePath()).toBe(join(projectRoot, "aim.sqlite"));
  });
});
