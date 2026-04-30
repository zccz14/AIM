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

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const mainProjectId = "00000000-0000-4000-8000-000000000001";

const createProject = async (
  repository: ReturnType<typeof createTaskRepository>,
  suffix = "main",
) =>
  repository.createProject({
    git_origin_url: `https://github.com/example/${suffix}.git`,
    global_model_id: "claude-sonnet-4-5",
    global_provider_id: "anthropic",
    name: `Project ${suffix}`,
  });

const createTask = async (
  repository: ReturnType<typeof createTaskRepository>,
  input: Parameters<ReturnType<typeof createTaskRepository>["createTask"]>[0],
) => {
  const project = input.project_id
    ? null
    : await createProject(repository, String(input.task_spec ?? "task"));

  return repository.createTask({
    title: String(input.task_spec ?? "Task"),
    ...input,
    project_id: input.project_id ?? project?.id ?? mainProjectId,
  });
};

const insertOpenCodeSession = (
  projectRoot: string,
  sessionId: string,
  state: "pending" | "rejected" | "resolved",
) => {
  const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));
  const now = new Date().toISOString();

  database
    .prepare(
      "INSERT INTO opencode_sessions (session_id, state, value, reason, continue_prompt, provider_id, model_id, created_at, updated_at) VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)",
    )
    .run(sessionId, state, now, now);
  database.close();
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

  it("closes its database when an await using scope exits", async () => {
    const projectRoot = await createProjectRoot("await-using-closes-db");
    let repository: ReturnType<typeof createTaskRepository> | undefined;

    await (async () => {
      await using scopedRepository = createTaskRepository({ projectRoot });

      repository = scopedRepository;
      await scopedRepository.listTasks();
    })();

    await expect(async () => {
      await repository?.listTasks();
    }).rejects.toThrow(/closed|finalized|open/i);
  });

  it("allows repeated async disposal without throwing", async () => {
    const projectRoot = await createProjectRoot("idempotent-disposal");
    const repository = createTaskRepository({ projectRoot });

    await repository[Symbol.asyncDispose]();
    await expect(repository[Symbol.asyncDispose]()).resolves.toBeUndefined();
  });

  it("creates the tasks table automatically before storing rows", async () => {
    const projectRoot = await createProjectRoot("creates-tasks-table");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const createdTask = await createTask(repository, {
      task_spec: "bootstrap repository schema",
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
      .prepare("SELECT result FROM tasks WHERE task_id = ?")
      .get(createdTask.task_id) as undefined | { result: string };
    database.close();

    expect(taskSchema.safeParse(createdTask).success).toBe(true);
    expect(createdTask.done).toBe(false);
    expect(createdTask.git_origin_url).toContain("bootstrap");
    expect(createdTask.result).toBe("");
    expect(resultColumn).toMatchObject({
      dflt_value: "''",
      name: "result",
      notnull: 1,
      pk: 0,
      type: "TEXT",
    });
    expect(persistedRow).toEqual({ result: "" });
    expect(tasks).toEqual([createdTask]);
  });

  it("stores tasks with project_id and resolves project model context from an explicit project row", async () => {
    const projectRoot = await createProjectRoot("stores-task-project-id");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));

    database
      .prepare(
        `INSERT INTO projects (
          id,
          name,
          git_origin_url,
          global_provider_id,
          global_model_id,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        mainProjectId,
        "Main project",
        "https://github.com/example/project-main.git",
        "anthropic",
        "claude-sonnet-4-5",
        "2026-04-26T00:00:00.000Z",
        "2026-04-26T00:00:00.000Z",
      );

    await expect(
      repository.createTask({
        project_id: mainProjectId,
        status: "pending",
        task_spec: "store task under project identity",
        title: "Project scoped task",
      }),
    ).resolves.toMatchObject({
      global_model_id: "claude-sonnet-4-5",
      global_provider_id: "anthropic",
      project_id: mainProjectId,
      git_origin_url: "https://github.com/example/project-main.git",
    });

    const projectColumns = database
      .prepare("PRAGMA table_info(projects)")
      .all();
    const taskColumns = database.prepare("PRAGMA table_info(tasks)").all();
    const persistedProject = database
      .prepare(
        "SELECT id, name, git_origin_url, global_provider_id, global_model_id FROM projects WHERE id = ?",
      )
      .get(mainProjectId);
    const persistedTask = database
      .prepare("SELECT project_id FROM tasks WHERE project_id = ?")
      .get(mainProjectId);
    database.close();

    expect(
      projectColumns.map((column) => (column as TableInfoRow).name),
    ).toEqual(
      expect.arrayContaining([
        "id",
        "name",
        "git_origin_url",
        "global_provider_id",
        "global_model_id",
      ]),
    );
    expect(
      taskColumns.map((column) => (column as TableInfoRow).name),
    ).toContain("project_id");
    expect(
      taskColumns.map((column) => (column as TableInfoRow).name),
    ).not.toEqual(
      expect.arrayContaining(["developer_provider_id", "developer_model_id"]),
    );
    expect(persistedProject).toEqual({
      global_model_id: "claude-sonnet-4-5",
      global_provider_id: "anthropic",
      id: mainProjectId,
      name: "Main project",
      git_origin_url: "https://github.com/example/project-main.git",
    });
    expect(persistedTask).toEqual({ project_id: mainProjectId });
  });

  it("creates projects with UUID ids that stay distinct from git_origin_url", async () => {
    const projectRoot = await createProjectRoot("creates-project-uuid-id");
    const repository = createTaskRepository({ projectRoot });

    const project = await repository.createProject({
      global_model_id: "claude-sonnet-4-5",
      global_provider_id: "anthropic",
      name: "Main project",
      git_origin_url: "https://github.com/example/project-main.git",
    });

    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));
    const persistedProject = database
      .prepare(
        "SELECT id, git_origin_url FROM projects WHERE git_origin_url = ?",
      )
      .get("https://github.com/example/project-main.git") as
      | { git_origin_url: string; id: string }
      | undefined;
    database.close();

    expect(project.id).toMatch(uuidPattern);
    expect(project.id).not.toBe(project.git_origin_url);
    expect(persistedProject).toEqual({
      id: project.id,
      git_origin_url: "https://github.com/example/project-main.git",
    });
  });

  it("persists git_origin_url instead of project_path for project identity", async () => {
    const projectRoot = await createProjectRoot("stores-project-origin-url");
    const repository = createTaskRepository({ projectRoot });

    const project = await repository.createProject({
      git_origin_url: "https://github.com/example/main.git",
      global_model_id: "claude-sonnet-4-5",
      global_provider_id: "anthropic",
      name: "Main project",
    });

    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));
    const projectColumns = database
      .prepare("PRAGMA table_info(projects)")
      .all();
    const persistedProject = database
      .prepare("SELECT id, git_origin_url FROM projects WHERE id = ?")
      .get(project.id);
    database.close();

    expect(project).toMatchObject({
      git_origin_url: "https://github.com/example/main.git",
      name: "Main project",
    });
    expect(
      projectColumns.map((column) => (column as TableInfoRow).name),
    ).toEqual(
      expect.arrayContaining([
        "id",
        "name",
        "git_origin_url",
        "global_provider_id",
        "global_model_id",
      ]),
    );
    expect(
      projectColumns.map((column) => (column as TableInfoRow).name),
    ).not.toContain("project_path");
    expect(persistedProject).toEqual({
      git_origin_url: "https://github.com/example/main.git",
      id: project.id,
    });
  });

  it("persists task project identity as a project_id foreign key and resolves git_origin_url from projects", async () => {
    const projectRoot = await createProjectRoot("task-project-id-foreign-key");
    const repository = createTaskRepository({ projectRoot });
    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));

    database
      .prepare(
        `INSERT INTO projects (
          id,
          name,
          git_origin_url,
          global_provider_id,
          global_model_id,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        mainProjectId,
        "Main project",
        "https://github.com/example/project-main.git",
        "anthropic",
        "claude-sonnet-4-5",
        "2026-04-26T00:00:00.000Z",
        "2026-04-26T00:00:00.000Z",
      );

    const task = await repository.createTask({
      project_id: mainProjectId,
      status: "pending",
      task_spec: "store only the project identity on the task row",
      title: "Project scoped task",
    });
    const taskColumns = database.prepare("PRAGMA table_info(tasks)").all();
    const taskForeignKeys = database
      .prepare("PRAGMA foreign_key_list(tasks)")
      .all();
    const persistedTask = database
      .prepare("SELECT project_id FROM tasks WHERE task_id = ?")
      .get(task.task_id);
    database.close();

    expect(task).toMatchObject({
      project_id: mainProjectId,
      git_origin_url: "https://github.com/example/project-main.git",
    });
    expect(
      taskColumns.map((column) => (column as TableInfoRow).name),
    ).not.toContain("project_path");
    expect(taskForeignKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "project_id",
          table: "projects",
          to: "id",
        }),
      ]),
    );
    expect(persistedTask).toEqual({ project_id: mainProjectId });
  });

  it("migrates path-as-id project data to UUID ids while preserving child references", async () => {
    const projectRoot = await createProjectRoot("migrates-path-project-ids");
    const databasePath = join(projectRoot, "aim.sqlite");
    const database = new DatabaseSync(databasePath);

    database.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        project_path TEXT NOT NULL UNIQUE,
        global_provider_id TEXT NOT NULL,
        global_model_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE tasks (
        task_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        task_spec TEXT NOT NULL,
        project_id TEXT NOT NULL,
        developer_provider_id TEXT NOT NULL,
        developer_model_id TEXT NOT NULL,
        session_id TEXT,
        worktree_path TEXT,
        pull_request_url TEXT,
        dependencies TEXT NOT NULL,
        result TEXT NOT NULL DEFAULT '',
        done INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE dimensions (
        id TEXT NOT NULL PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        goal TEXT NOT NULL,
        evaluation_method TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE dimension_evaluations (
        id TEXT NOT NULL PRIMARY KEY,
        dimension_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        commit_sha TEXT NOT NULL,
        evaluator_model TEXT NOT NULL,
        score INTEGER NOT NULL,
        evaluation TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    database
      .prepare(
        "INSERT INTO projects (id, name, project_path, global_provider_id, global_model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "/repo/legacy",
        "Legacy project",
        "/repo/legacy",
        "anthropic",
        "claude-sonnet-4-5",
        "2026-04-26T00:00:00.000Z",
        "2026-04-26T00:00:00.000Z",
      );
    database
      .prepare(
        "INSERT INTO tasks (task_id, title, task_spec, project_id, developer_provider_id, developer_model_id, dependencies, result, done, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "task-1",
        "Legacy task",
        "Keep task linked",
        "/repo/legacy",
        "anthropic",
        "claude-sonnet-4-5",
        "[]",
        "",
        0,
        "pending",
        "2026-04-26T00:00:00.000Z",
        "2026-04-26T00:00:00.000Z",
      );
    database
      .prepare(
        "INSERT INTO dimensions (id, project_id, name, goal, evaluation_method, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "dimension-1",
        "/repo/legacy",
        "Quality",
        "Improve quality",
        "Review",
        "2026-04-26T00:00:00.000Z",
        "2026-04-26T00:00:00.000Z",
      );
    database
      .prepare(
        "INSERT INTO dimension_evaluations (id, dimension_id, project_id, commit_sha, evaluator_model, score, evaluation, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "evaluation-1",
        "dimension-1",
        "/repo/legacy",
        "abc123",
        "gpt-5.5",
        80,
        "Good",
        "2026-04-26T00:00:00.000Z",
      );
    database.close();

    const repository = createTaskRepository({ projectRoot });
    await repository.listTasks();

    const migratedDatabase = new DatabaseSync(databasePath);
    const migratedProject = migratedDatabase
      .prepare(
        "SELECT id, git_origin_url FROM projects WHERE git_origin_url = ?",
      )
      .get("/repo/legacy") as { git_origin_url: string; id: string };
    const childReferences = migratedDatabase
      .prepare(
        `SELECT
          (SELECT project_id FROM tasks WHERE task_id = 'task-1') AS task_project_id,
          (SELECT project_id FROM dimensions WHERE id = 'dimension-1') AS dimension_project_id,
          (SELECT project_id FROM dimension_evaluations WHERE id = 'evaluation-1') AS evaluation_project_id`,
      )
      .get() as Record<string, string>;
    migratedDatabase.close();

    expect(migratedProject.id).toMatch(uuidPattern);
    expect(migratedProject.id).not.toBe("/repo/legacy");
    expect(childReferences).toEqual({
      dimension_project_id: migratedProject.id,
      evaluation_project_id: migratedProject.id,
      task_project_id: migratedProject.id,
    });
  });

  it("adds a disabled optimizer flag to compatible existing project rows", async () => {
    const projectRoot = await createProjectRoot(
      "migrates-project-optimizer-flag",
    );
    const databasePath = join(projectRoot, "aim.sqlite");
    const database = new DatabaseSync(databasePath);

    database.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        git_origin_url TEXT NOT NULL UNIQUE,
        global_provider_id TEXT NOT NULL,
        global_model_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE tasks (
        task_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        task_spec TEXT NOT NULL,
        project_id TEXT NOT NULL,
        developer_provider_id TEXT NOT NULL,
        developer_model_id TEXT NOT NULL,
        session_id TEXT,
        worktree_path TEXT,
        pull_request_url TEXT,
        dependencies TEXT NOT NULL,
        result TEXT NOT NULL DEFAULT '',
        source_metadata TEXT NOT NULL DEFAULT '{}',
        done INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    database
      .prepare(
        "INSERT INTO projects (id, name, git_origin_url, global_provider_id, global_model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        mainProjectId,
        "Existing project",
        "https://github.com/example/existing.git",
        "anthropic",
        "claude-sonnet-4-5",
        "2026-04-26T00:00:00.000Z",
        "2026-04-26T00:00:00.000Z",
      );
    database.close();

    const repository = createTaskRepository({ projectRoot });
    const projects = repository.listProjects();
    await repository[Symbol.asyncDispose]();

    const migratedDatabase = new DatabaseSync(databasePath);
    const optimizerColumn = (
      migratedDatabase
        .prepare("PRAGMA table_info(projects)")
        .all() as TableInfoRow[]
    ).find((column) => column.name === "optimizer_enabled");
    migratedDatabase.close();

    expect(projects[0]).toMatchObject({ optimizer_enabled: false });
    expect(optimizerColumn).toMatchObject({
      dflt_value: "0",
      name: "optimizer_enabled",
      notnull: 1,
      type: "INTEGER",
    });
  });

  it("creates and persists required task title without task-level developer model columns", async () => {
    const projectRoot = await createProjectRoot(
      "creates-no-task-model-columns",
    );

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const createdTask = await createTask(repository, {
      status: "pending",
      task_spec: "persist task without copied model fields",
      title: "Persist task identity fields",
    });
    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));
    const columns = database
      .prepare("PRAGMA table_info(tasks)")
      .all() as TableInfoRow[];
    const persistedRow = database
      .prepare("SELECT title FROM tasks WHERE task_id = ?")
      .get(createdTask.task_id);
    database.close();

    expect(columns.find((column) => column.name === "title")).toMatchObject({
      name: "title",
      notnull: 1,
      type: "TEXT",
    });
    expect(columns.map((column) => column.name)).not.toEqual(
      expect.arrayContaining(["developer_provider_id", "developer_model_id"]),
    );
    expect(createdTask).toMatchObject(persistedRow as object);
  });

  it("supports full CRUD with filter-aware listing", async () => {
    const projectRoot = await createProjectRoot("supports-full-crud");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const project = await createProject(repository, "crud");
    const otherProject = await createProject(repository, "other");
    insertOpenCodeSession(projectRoot, "session-a", "pending");
    insertOpenCodeSession(projectRoot, "session-a-pending", "pending");
    insertOpenCodeSession(projectRoot, "session-b", "rejected");
    const firstTask = await createTask(repository, {
      project_id: project.id,
      task_spec: "keep pending",
      session_id: "session-a",
      status: "pending",
    });
    const secondTask = await createTask(repository, {
      project_id: project.id,
      task_spec: "complete later",
      session_id: "session-a-pending",
      dependencies: [firstTask.task_id],
      status: "pending",
    });
    const thirdTask = await createTask(repository, {
      project_id: project.id,
      task_spec: "different session",
      session_id: "session-b",
      status: "rejected",
    });
    const otherProjectTask = await createTask(repository, {
      project_id: otherProject.id,
      task_spec: "other project",
      status: "pending",
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
    await expect(repository.listTasks({ status: "rejected" })).resolves.toEqual(
      [
        expect.objectContaining({
          status: "rejected",
          task_id: thirdTask.task_id,
        }),
      ],
    );
    await expect(
      repository.listTasks({ done: false, project_id: firstTask.project_id }),
    ).resolves.toEqual([firstTask, secondTask]);
    await expect(
      repository.listTasks({ done: false, project_id: otherProject.id }),
    ).resolves.toEqual([otherProjectTask]);
    await expect(repository.listTasks({ done: true })).resolves.toEqual([
      expect.objectContaining({ done: true, task_id: thirdTask.task_id }),
    ]);

    const updatedTask = await repository.updateTask(secondTask.task_id, {
      pull_request_url: "https://example.test/pr/2",
      task_spec: "complete now",
    });

    expect(updatedTask.task_id).toBe(secondTask.task_id);
    expect(updatedTask.task_spec).toBe("complete now");
    expect(updatedTask.project_id).toBe(secondTask.project_id);
    expect(updatedTask.session_id).toBe("session-a-pending");
    expect(updatedTask.dependencies).toEqual([firstTask.task_id]);
    expect(updatedTask.pull_request_url).toBe("https://example.test/pr/2");
    expect(updatedTask.status).toBe("pending");
    expect(updatedTask.done).toBe(false);
    expect(Date.parse(updatedTask.updated_at)).toBeGreaterThanOrEqual(
      Date.parse(secondTask.updated_at),
    );

    await expect(repository.getTaskById(updatedTask.task_id)).resolves.toEqual(
      updatedTask,
    );
    const doneTasks = await repository.listTasks({ done: true });

    expect(doneTasks).toHaveLength(1);
    expect(doneTasks.map((task) => task.task_id).sort()).toEqual(
      [thirdTask.task_id].sort(),
    );

    await expect(repository.deleteTask(firstTask.task_id)).resolves.toBe(true);
    await expect(repository.getTaskById(firstTask.task_id)).resolves.toBeNull();
    await expect(repository.deleteTask(firstTask.task_id)).resolves.toBe(false);
  });

  it("preserves the current result when a patch omits it", async () => {
    const projectRoot = await createProjectRoot("patch-omits-result");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const task = await createTask(repository, {
      result: "keep me",
      status: "pending",
      task_spec: "preserve result",
    });

    const updatedTask = await repository.updateTask(task.task_id, {
      task_spec: "preserve existing result",
    });

    expect(updatedTask).toMatchObject({
      done: false,
      result: "keep me",
      status: "pending",
      task_id: task.task_id,
    });
  });

  it("does not enrich ordinary task reads with bound opencode session state", async () => {
    const projectRoot = await createProjectRoot(
      "ordinary-read-session-id-only",
    );

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    insertOpenCodeSession(projectRoot, "session-resolved", "resolved");
    const task = await createTask(repository, {
      session_id: "session-resolved",
      task_spec: "read without session entity",
    });

    await expect(repository.getTaskById(task.task_id)).resolves.toMatchObject({
      done: false,
      opencode_session: null,
      session_id: "session-resolved",
      status: "pending",
      task_id: task.task_id,
    });
    await expect(repository.listTasks()).resolves.toEqual([
      expect.objectContaining({
        done: false,
        opencode_session: null,
        session_id: "session-resolved",
        status: "pending",
        task_id: task.task_id,
      }),
    ]);
  });

  it("uses explicit status and done filters to derive task pool state", async () => {
    const projectRoot = await createProjectRoot("explicit-status-filters");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    insertOpenCodeSession(projectRoot, "session-resolved", "resolved");
    insertOpenCodeSession(projectRoot, "session-rejected", "rejected");
    const pendingTask = await createTask(repository, {
      task_spec: "still pending",
    });
    const resolvedTask = await createTask(repository, {
      session_id: "session-resolved",
      task_spec: "resolved elsewhere",
    });
    const rejectedTask = await createTask(repository, {
      session_id: "session-rejected",
      task_spec: "rejected elsewhere",
    });

    await expect(repository.listTasks({ status: "resolved" })).resolves.toEqual(
      [
        expect.objectContaining({
          status: "resolved",
          task_id: resolvedTask.task_id,
        }),
      ],
    );
    await expect(repository.listTasks({ status: "rejected" })).resolves.toEqual(
      [
        expect.objectContaining({
          status: "rejected",
          task_id: rejectedTask.task_id,
        }),
      ],
    );
    await expect(repository.listTasks({ done: true })).resolves.toEqual([
      expect.objectContaining({ done: true, task_id: resolvedTask.task_id }),
      expect.objectContaining({ done: true, task_id: rejectedTask.task_id }),
    ]);
    await expect(repository.listTasks({ done: false })).resolves.toEqual([
      expect.objectContaining({ done: false, task_id: pendingTask.task_id }),
    ]);
  });

  it("updates the result when a patch explicitly includes it", async () => {
    const projectRoot = await createProjectRoot("patch-updates-result");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const task = await createTask(repository, {
      result: "before",
      status: "pending",
      task_spec: "replace result",
    });

    const updatedTask = await repository.updateTask(task.task_id, {
      result: "after",
    });

    expect(updatedTask).toMatchObject({
      result: "after",
      status: "pending",
      task_id: task.task_id,
    });
  });

  it("derives terminal task state from bound sessions while persisting result", async () => {
    const projectRoot = await createProjectRoot("terminal-result-helpers");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    insertOpenCodeSession(projectRoot, "session-resolved", "resolved");
    insertOpenCodeSession(projectRoot, "session-rejected", "rejected");
    const resolvedTask = await createTask(repository, {
      session_id: "session-resolved",
      status: "pending",
      task_spec: "resolve me",
    });
    const rejectedTask = await createTask(repository, {
      session_id: "session-rejected",
      status: "pending",
      task_spec: "reject me",
    });

    await expect(
      repository.updateTask(resolvedTask.task_id, { result: "ship it" }),
    ).resolves.toMatchObject({
      done: false,
      result: "ship it",
      status: "pending",
      task_id: resolvedTask.task_id,
    });
    await expect(
      repository.updateTask(rejectedTask.task_id, {
        result: "needs more work",
      }),
    ).resolves.toMatchObject({
      done: false,
      result: "needs more work",
      status: "pending",
      task_id: rejectedTask.task_id,
    });
    await expect(repository.listTasks({ status: "resolved" })).resolves.toEqual(
      [
        expect.objectContaining({
          done: true,
          result: "ship it",
          status: "resolved",
          task_id: resolvedTask.task_id,
        }),
      ],
    );
    await expect(repository.listTasks({ status: "rejected" })).resolves.toEqual(
      [
        expect.objectContaining({
          done: true,
          result: "needs more work",
          status: "rejected",
          task_id: rejectedTask.task_id,
        }),
      ],
    );
  });

  it("clears a task session binding when AIM stops tracking the opencode session", async () => {
    const projectRoot = await createProjectRoot("session-delete-clears-task");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const project = await createProject(repository, "session-delete");
    insertOpenCodeSession(projectRoot, "session-forget", "pending");
    const task = await createTask(repository, {
      project_id: project.id,
      result: "preserve result",
      session_id: "session-forget",
      task_spec: "forget session but keep task",
      title: "Forget managed session",
      worktree_path: "/repo/.worktrees/session-forget",
    });
    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));

    database.exec("PRAGMA foreign_keys = ON");
    database
      .prepare("DELETE FROM opencode_sessions WHERE session_id = ?")
      .run("session-forget");
    database.close();

    await expect(repository.getTaskById(task.task_id)).resolves.toMatchObject({
      project_id: project.id,
      result: "preserve result",
      session_id: null,
      status: "pending",
      task_id: task.task_id,
      task_spec: "forget session but keep task",
      title: "Forget managed session",
      worktree_path: "/repo/.worktrees/session-forget",
    });
  });

  it("lists only unfinished tasks for the scheduler", async () => {
    const projectRoot = await createProjectRoot("lists-unfinished-tasks");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const processingTask = await createTask(repository, {
      task_spec: "still pending",
      status: "pending",
    });
    const queuedTask = await createTask(repository, {
      task_spec: "queued",
      status: "pending",
    });
    await createTask(repository, {
      task_spec: "already done",
      status: "pending",
    });

    await expect(repository.listUnfinishedTasks()).resolves.toHaveLength(3);
    await expect(repository.listUnfinishedTasks()).resolves.toEqual(
      expect.arrayContaining([processingTask, queuedTask]),
    );
  });

  it("binds a session only when the task is still unassigned", async () => {
    const projectRoot = await createProjectRoot(
      "assigns-session-if-unassigned",
    );

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    insertOpenCodeSession(projectRoot, "session-a", "pending");
    const task = await createTask(repository, {
      task_spec: "claim me once",
      status: "pending",
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
    const task = await createTask(repository, {
      task_spec: "race me",
      status: "pending",
    });
    insertOpenCodeSession(projectRoot, "winning-session", "pending");
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

  it("rejects assigning a session when another unfinished task already uses it", async () => {
    const projectRoot = await createProjectRoot(
      "rejects-session-claim-on-conflict",
    );

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    insertOpenCodeSession(projectRoot, "shared-session", "pending");
    await createTask(repository, {
      task_spec: "already claimed elsewhere",
      session_id: "shared-session",
      status: "pending",
    });
    const unassignedTask = await createTask(repository, {
      task_spec: "claim me later",
      status: "pending",
    });

    await expect(
      repository.assignSessionIfUnassigned(
        unassignedTask.task_id,
        "shared-session",
      ),
    ).rejects.toThrow(/unique|constraint/i);
    await expect(
      repository.getTaskById(unassignedTask.task_id),
    ).resolves.toMatchObject({
      session_id: null,
      task_id: unassignedTask.task_id,
    });
  });

  it("allows multiple unfinished tasks without session assignments", async () => {
    const projectRoot = await createProjectRoot("multiple-null-sessions");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const firstTask = await createTask(repository, {
      task_spec: "null session first",
      status: "pending",
    });
    const secondTask = await createTask(repository, {
      task_spec: "null session second",
      status: "pending",
    });

    await expect(repository.listUnfinishedTasks()).resolves.toEqual([
      firstTask,
      secondTask,
    ]);
  });

  it("rejects a second unfinished task with the same non-null session_id", async () => {
    const projectRoot = await createProjectRoot("rejects-duplicate-session");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    insertOpenCodeSession(projectRoot, "shared-session", "pending");
    await createTask(repository, {
      task_spec: "first shared session task",
      session_id: "shared-session",
      status: "pending",
    });

    await expect(
      createTask(repository, {
        task_spec: "second shared session task",
        session_id: "shared-session",
        status: "pending",
      }),
    ).rejects.toThrow(/unique|constraint/i);
  });

  it("rejects reusing a session_id because session state is task lifecycle", async () => {
    const projectRoot = await createProjectRoot("rejects-session-id-reuse");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    insertOpenCodeSession(projectRoot, "reusable-session", "resolved");
    const firstTask = await createTask(repository, {
      task_spec: "finish before reuse",
      session_id: "reusable-session",
      status: "pending",
    });

    await expect(
      createTask(repository, {
        task_spec: "reuse blocked",
        session_id: "reusable-session",
        status: "pending",
      }),
    ).rejects.toThrow(/unique|constraint/i);
    await expect(repository.getTaskById(firstTask.task_id)).resolves.toEqual(
      firstTask,
    );
  });

  it("rejects updating an unfinished task to a conflicting session_id", async () => {
    const projectRoot = await createProjectRoot(
      "rejects-update-session-conflict",
    );

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    insertOpenCodeSession(projectRoot, "shared-session", "pending");
    await createTask(repository, {
      task_spec: "session owner",
      session_id: "shared-session",
      status: "pending",
    });
    const taskToUpdate = await createTask(repository, {
      task_spec: "update me",
      status: "pending",
    });

    await expect(
      repository.updateTask(taskToUpdate.task_id, {
        session_id: "shared-session",
      }),
    ).rejects.toThrow(/unique|constraint/i);
    await expect(
      repository.getTaskById(taskToUpdate.task_id),
    ).resolves.toMatchObject({
      session_id: null,
      task_id: taskToUpdate.task_id,
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

  it("fails fast when an existing tasks table lacks project_id", async () => {
    const projectRoot = await createProjectRoot("rejects-missing-project-id");
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
        title varchar(255) NOT NULL,
        task_spec varchar(255) NOT NULL,
        project_id varchar(255) NOT NULL,
        developer_provider_id varchar(255) NOT NULL,
        developer_model_id varchar(255) NOT NULL,
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
      CREATE UNIQUE INDEX tasks_session_id_unique
      ON tasks (session_id)
      WHERE (session_id IS NOT NULL) AND (0 = done)
    `);
    database.close();

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();
    const createdTask = await createTask(repository, {
      task_spec: "compatible schema bootstrap",
    });

    await expect(repository.getTaskById(createdTask.task_id)).resolves.toEqual(
      createdTask,
    );
  });

  it("rebuilds a legacy project_path task table with a broader session index predicate", async () => {
    const projectRoot = await createProjectRoot(
      "rejects-broader-session-index-predicate",
    );
    const databasePath = join(projectRoot, "aim.sqlite");
    const database = new DatabaseSync(databasePath);

    database.exec(`
      CREATE TABLE tasks (
        task_id text PRIMARY KEY,
        title varchar(255) NOT NULL,
        task_spec varchar(255) NOT NULL,
        project_id varchar(255) NOT NULL,
        developer_provider_id varchar(255) NOT NULL,
        developer_model_id varchar(255) NOT NULL,
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
      CREATE UNIQUE INDEX tasks_session_id_unique
      ON tasks (session_id)
      WHERE done = 0 OR session_id IS NOT NULL
    `);
    database.close();

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();

    await expect(repository.listTasks()).resolves.toEqual([]);
  });

  it("creates a partial unique index for session sessions", async () => {
    const projectRoot = await createProjectRoot("creates-session-index");

    process.env.AIM_PROJECT_ROOT = projectRoot;

    const repository = createTaskRepository();

    await repository.listTasks();

    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));
    const index = database
      .prepare("PRAGMA index_list(tasks)")
      .all()
      .find(
        (row) => (row as IndexListRow).name === "tasks_session_id_unique",
      ) as IndexListRow | undefined;
    const indexColumns = database
      .prepare("PRAGMA index_info(tasks_session_id_unique)")
      .all() as Array<{ name: string }>;
    const indexSql = database
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?",
      )
      .get("tasks_session_id_unique") as { sql: string } | undefined;
    database.close();

    expect(index).toMatchObject({
      name: "tasks_session_id_unique",
      partial: 1,
      unique: 1,
    });
    expect(indexColumns).toHaveLength(1);
    expect(indexColumns[0]).toMatchObject({ name: "session_id" });
    expect(indexSql?.sql).toContain("WHERE session_id IS NOT NULL");
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
        title varchar(255) NOT NULL,
        task_spec varchar(255) NOT NULL,
        project_path varchar(255) NOT NULL,
        developer_provider_id varchar(255) NOT NULL,
        developer_model_id varchar(255) NOT NULL,
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
        (row) => (row as IndexListRow).name === "tasks_session_id_unique",
      ) as IndexListRow | undefined;
    bootstrappedDatabase.close();

    expect(index).toMatchObject({
      name: "tasks_session_id_unique",
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
        project_id TEXT NOT NULL,
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
