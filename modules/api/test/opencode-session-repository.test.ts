import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

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

  it("reports explicit downstream owner references for an AIM session row", async () => {
    const projectRoot = await createProjectRoot("session-references");
    const repository = createOpenCodeSessionRepository({ projectRoot });
    await repository.createSession({
      continue_prompt: "Continue.",
      session_id: "session-owned",
    });
    const database = openDatabase(projectRoot);
    insertProject(database);
    database
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
    database
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
    database
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
    database.close();

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
    await repository.createSession({
      continue_prompt: "Delete me.",
      session_id: "session-delete",
    });
    const keptSession = await repository.createSession({
      continue_prompt: "Keep me.",
      session_id: "session-keep",
    });

    repository.deleteSessionById("session-delete");

    expect(repository.getSessionById("session-delete")).toBeNull();
    expect(repository.getSessionById("session-keep")).toEqual(keptSession);

    await repository[Symbol.asyncDispose]();
  });
});
