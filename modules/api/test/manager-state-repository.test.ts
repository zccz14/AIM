import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

const tempRoot = join(process.cwd(), ".tmp", "manager-state-repository");

const createProjectRoot = async (name: string) => {
  const projectRoot = join(tempRoot, name);

  await rm(projectRoot, { force: true, recursive: true });
  await mkdir(projectRoot, { recursive: true });

  return projectRoot;
};

const insertProjectAndSession = (
  projectRoot: string,
  projectId: string,
  sessionId: string,
) => {
  const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));
  database.exec("PRAGMA foreign_keys = ON");
  const now = new Date().toISOString();

  database
    .prepare(
      "INSERT INTO projects (id, name, git_origin_url, global_provider_id, global_model_id, optimizer_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
    )
    .run(
      projectId,
      `Project ${projectId}`,
      `https://github.com/example/${projectId}.git`,
      "anthropic",
      "claude-sonnet-4-5",
      now,
      now,
    );
  database
    .prepare(
      "INSERT INTO opencode_sessions (session_id, project_id, state, value, reason, continue_prompt, provider_id, model_id, created_at, updated_at) VALUES (?, ?, 'pending', NULL, NULL, NULL, NULL, NULL, ?, ?)",
    )
    .run(sessionId, projectId, now, now);
  database.close();
};

afterEach(async () => {
  await rm(tempRoot, { force: true, recursive: true });
});

describe("manager state repository", () => {
  it("keeps manager lane state and releases the session reference when an OpenCode attempt is deleted", async () => {
    const projectRoot = await createProjectRoot("session-delete-nullifies");
    const projectId = "project-1";
    const sessionId = "manager-session-1";

    const { createManagerStateRepository } = await import(
      "../src/manager-state-repository.js"
    );
    await using repository = createManagerStateRepository({ projectRoot });
    insertProjectAndSession(projectRoot, projectId, sessionId);

    repository.upsertManagerState({
      commit_sha: "commit-1",
      dimension_ids_json: JSON.stringify(["dimension-1"]),
      last_error: "previous failure",
      project_id: projectId,
      session_id: sessionId,
      state: "failed",
    });

    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));
    database.exec("PRAGMA foreign_keys = ON");
    database
      .prepare("DELETE FROM opencode_sessions WHERE session_id = ?")
      .run(sessionId);
    database.close();

    expect(repository.getManagerState(projectId)).toMatchObject({
      commit_sha: "commit-1",
      dimension_ids_json: JSON.stringify(["dimension-1"]),
      last_error: "previous failure",
      project_id: projectId,
      session_id: null,
      state: "failed",
    });
  });
});
