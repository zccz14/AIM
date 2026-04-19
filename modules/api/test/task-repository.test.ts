import { access, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import { taskSchema } from "../../contract/src/index.js";

import { resolveTaskDatabasePath } from "../src/task-database.js";
import { createTaskRepository } from "../src/task-repository.js";

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
      status: "succeeded",
    });
    const tasks = await repository.listTasks();
    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));
    const persistedRow = database
      .prepare("SELECT done FROM tasks WHERE task_id = ?")
      .get(createdTask.task_id) as undefined | { done: number };
    database.close();

    expect(taskSchema.safeParse(createdTask).success).toBe(true);
    expect(createdTask.done).toBe(true);
    expect(persistedRow).toEqual({ done: 1 });
    expect(tasks).toEqual([createdTask]);
  });

  it("supports full CRUD with filter-aware listing", async () => {
    const projectRoot = await createProjectRoot("supports-full-crud");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const firstTask = await repository.createTask({
      task_spec: "keep running",
      session_id: "session-a",
      status: "running",
    });
    const secondTask = await repository.createTask({
      task_spec: "complete later",
      session_id: "session-a",
      dependencies: [firstTask.task_id],
      status: "created",
    });
    const thirdTask = await repository.createTask({
      task_spec: "different session",
      session_id: "session-b",
      status: "failed",
    });

    await expect(repository.getTaskById(secondTask.task_id)).resolves.toEqual(
      secondTask,
    );
    await expect(
      repository.listTasks({ session_id: "session-a" }),
    ).resolves.toEqual([firstTask, secondTask]);
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
    expect(updatedTask.session_id).toBe("session-a");
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

  it("lists only unfinished tasks for the scheduler", async () => {
    const projectRoot = await createProjectRoot("lists-unfinished-tasks");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const runningTask = await repository.createTask({
      task_spec: "still running",
      status: "running",
    });
    const createdTask = await repository.createTask({
      task_spec: "queued",
      status: "created",
    });
    await repository.createTask({
      task_spec: "already done",
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

  it("keeps duplicate session rows visible to the scheduler scan", async () => {
    const projectRoot = await createProjectRoot("duplicate-session-visibility");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const firstTask = await repository.createTask({
      task_spec: "shared session first",
      session_id: "shared-session",
      status: "running",
    });
    const secondTask = await repository.createTask({
      task_spec: "shared session second",
      session_id: "shared-session",
      status: "created",
    });

    await expect(repository.listUnfinishedTasks()).resolves.toEqual([
      firstTask,
      secondTask,
    ]);
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

  it("accepts a semantically compatible existing tasks schema", async () => {
    const projectRoot = await createProjectRoot("accepts-compatible-schema");
    const databasePath = join(projectRoot, "aim.sqlite");
    const database = new DatabaseSync(databasePath);

    database.exec(`
      CREATE TABLE tasks (
        task_id text PRIMARY KEY,
        task_spec varchar(255) NOT NULL,
        session_id text,
        worktree_path text,
        pull_request_url text,
        dependencies text NOT NULL,
        done int NOT NULL,
        status varchar(32) NOT NULL,
        created_at datetime NOT NULL,
        updated_at datetime NOT NULL
      )
    `);
    database.close();

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const createdTask = await repository.createTask({
      task_spec: "compatible schema bootstrap",
    });

    await expect(repository.getTaskById(createdTask.task_id)).resolves.toEqual(
      createdTask,
    );
  });

  it("resolves the database path from AIM_PROJECT_ROOT when set", async () => {
    const projectRoot = await createProjectRoot("env-root-resolution");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    expect(resolveTaskDatabasePath()).toBe(join(projectRoot, "aim.sqlite"));
  });
});
