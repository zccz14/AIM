import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createOpenCodeSessionRepository } from "../src/opencode-session-repository.js";

const tempRoot = join(
  process.cwd(),
  ".tmp",
  "modules-api-opencode-session-repository",
);
const timestamp = "2026-04-28T12:00:00.000Z";
const projectId = "00000000-0000-4000-8000-000000000101";

const createProjectRoot = async (name: string) => {
  const projectRoot = join(tempRoot, name);

  await rm(projectRoot, { force: true, recursive: true });
  await mkdir(projectRoot, { recursive: true });

  return projectRoot;
};

const openDatabase = (projectRoot: string) =>
  new DatabaseSync(join(projectRoot, "aim.sqlite"));

const insertProject = (database: DatabaseSync) => {
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
      projectId,
      "Main project",
      "https://github.com/example/aim.git",
      "anthropic",
      "claude-sonnet-4-5",
      timestamp,
      timestamp,
    );
};

afterEach(async () => {
  vi.useRealTimers();
  delete process.env.AIM_OPENCODE_SESSION_STALE_AFTER_MS;
  await rm(tempRoot, { force: true, recursive: true });
});

describe("OpenCode session repository", () => {
  it("persists session title and project owner when creating a session", async () => {
    const projectRoot = await createProjectRoot("session-metadata");
    const repository = createOpenCodeSessionRepository({ projectRoot });
    const database = openDatabase(projectRoot);
    insertProject(database);

    await repository.createSession({
      continue_prompt: "Continue.",
      project_id: projectId,
      session_id: "session-metadata",
      title: "AIM Developer: Persist session metadata",
    });

    expect(
      database
        .prepare(
          "SELECT title, project_id FROM opencode_sessions WHERE session_id = ?",
        )
        .get("session-metadata"),
    ).toEqual({
      project_id: projectId,
      title: "AIM Developer: Persist session metadata",
    });
    database.close();

    await repository[Symbol.asyncDispose]();
  });

  it("returns contract datetimes with timezone offsets for legacy SQLite session timestamps", async () => {
    const projectRoot = await createProjectRoot("legacy-sqlite-datetimes");
    const repository = createOpenCodeSessionRepository({ projectRoot });
    const database = openDatabase(projectRoot);
    insertProject(database);
    database.close();
    await repository.createSession({
      continue_prompt: "Continue.",
      project_id: projectId,
      session_id: "session-legacy-datetime",
    });
    const updateDatabase = openDatabase(projectRoot);

    updateDatabase
      .prepare(
        "UPDATE opencode_sessions SET updated_at = ? WHERE session_id = ?",
      )
      .run("2026-04-27 09:30:00", "session-legacy-datetime");
    updateDatabase.close();

    expect(repository.getSessionById("session-legacy-datetime")).toMatchObject({
      session_id: "session-legacy-datetime",
      updated_at: "2026-04-27T09:30:00.000Z",
    });

    await repository[Symbol.asyncDispose]();
  });

  it("rejects creating a session without an existing project", async () => {
    const projectRoot = await createProjectRoot("requires-existing-project");
    const repository = createOpenCodeSessionRepository({ projectRoot });

    await expect(
      repository.createSession({
        continue_prompt: "Continue.",
        session_id: "session-missing-project",
      }),
    ).rejects.toThrow(/project_id/i);

    await expect(
      repository.createSession({
        continue_prompt: "Continue.",
        project_id: "00000000-0000-4000-8000-000000000404",
        session_id: "session-unknown-project",
      }),
    ).rejects.toThrow(/Project .* was not found/i);

    await repository[Symbol.asyncDispose]();
  });

  it("migrates only legacy sessions that already identify an existing project", async () => {
    const projectRoot = await createProjectRoot(
      "legacy-null-project-migration",
    );
    const database = openDatabase(projectRoot);
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
      CREATE TABLE opencode_sessions (
        session_id TEXT PRIMARY KEY,
        project_id TEXT,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    insertProject(database);
    database
      .prepare(
        "INSERT INTO opencode_sessions (session_id, project_id, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run("session-owned", projectId, "pending", timestamp, timestamp);
    database
      .prepare(
        "INSERT INTO opencode_sessions (session_id, project_id, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run("session-null-project", null, "pending", timestamp, timestamp);
    database
      .prepare(
        "INSERT INTO opencode_sessions (session_id, project_id, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        "session-unknown-project",
        "00000000-0000-4000-8000-000000000404",
        "pending",
        timestamp,
        timestamp,
      );
    database.close();

    const repository = createOpenCodeSessionRepository({ projectRoot });

    expect(repository.getSessionById("session-owned")).toMatchObject({
      project_id: projectId,
      session_id: "session-owned",
    });
    expect(repository.getSessionById("session-null-project")).toBeNull();
    expect(repository.getSessionById("session-unknown-project")).toBeNull();

    await repository[Symbol.asyncDispose]();
  });

  it("reports explicit downstream owner references for an AIM session row", async () => {
    const projectRoot = await createProjectRoot("session-references");
    const repository = createOpenCodeSessionRepository({ projectRoot });
    const database = openDatabase(projectRoot);
    insertProject(database);
    database.close();
    await repository.createSession({
      continue_prompt: "Continue.",
      project_id: projectId,
      session_id: "session-owned",
    });
    const referenceDatabase = openDatabase(projectRoot);
    referenceDatabase
      .prepare(
        `INSERT INTO tasks (
          task_id,
          title,
          task_spec,
          project_id,
          session_id,
          dependencies,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "task-1",
        "Task 1",
        "Spec",
        projectId,
        "session-owned",
        "[]",
        timestamp,
        timestamp,
      );
    referenceDatabase
      .prepare(
        `INSERT INTO manager_states (
          project_id,
          commit_sha,
          dimension_ids_json,
          session_id,
          state,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        projectId,
        "abc123",
        "[]",
        "session-owned",
        "running",
        timestamp,
        timestamp,
      );
    referenceDatabase
      .prepare(
        `INSERT INTO coordinator_states (
          project_id,
          commit_sha,
          active_task_count,
          threshold,
          planning_input_hash,
          session_id,
          state,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        projectId,
        "abc123",
        1,
        3,
        "hash",
        "session-owned",
        "running",
        timestamp,
        timestamp,
      );
    referenceDatabase.close();

    expect(repository.getSessionReferences("session-owned")).toEqual({
      coordinator_state_project_ids: [projectId],
      manager_state_project_ids: [projectId],
      task_ids: ["task-1"],
    });
    expect(repository.getSessionReferences("session-missing")).toEqual({
      coordinator_state_project_ids: [],
      manager_state_project_ids: [],
      task_ids: [],
    });

    await repository[Symbol.asyncDispose]();
  });

  it("deletes an AIM session row by id without touching unrelated sessions", async () => {
    const projectRoot = await createProjectRoot("delete-session-by-id");
    const repository = createOpenCodeSessionRepository({ projectRoot });
    const database = openDatabase(projectRoot);
    insertProject(database);
    database.close();
    await repository.createSession({
      continue_prompt: "Delete me.",
      project_id: projectId,
      session_id: "session-delete",
    });
    const keptSession = await repository.createSession({
      continue_prompt: "Keep me.",
      project_id: projectId,
      session_id: "session-keep",
    });

    repository.deleteSessionById("session-delete");

    expect(repository.getSessionById("session-delete")).toBeNull();
    expect(repository.getSessionById("session-keep")).toEqual(keptSession);

    await repository[Symbol.asyncDispose]();
  });

  it("marks pending sessions stale after 5 minutes by default", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T12:00:00.000Z"));
    const projectRoot = await createProjectRoot("default-stale-threshold");
    const repository = createOpenCodeSessionRepository({ projectRoot });
    const database = openDatabase(projectRoot);
    insertProject(database);
    database.close();
    await repository.createSession({
      continue_prompt: "Continue.",
      project_id: projectId,
      session_id: "session-stale-after-five-minutes",
    });

    vi.setSystemTime(new Date("2026-04-28T12:04:59.999Z"));
    expect(
      repository.getSessionById("session-stale-after-five-minutes"),
    ).toMatchObject({ stale: false });

    vi.setSystemTime(new Date("2026-04-28T12:05:00.000Z"));
    expect(
      repository.getSessionById("session-stale-after-five-minutes"),
    ).toMatchObject({ stale: true });

    await repository[Symbol.asyncDispose]();
  });
});
