import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

const routesTempRoot = join(
  process.cwd(),
  ".tmp",
  "modules-api-opencode-session-routes",
);
const opencodeSessionsPath = "/opencode/sessions";
const opencodeSessionPath = (sessionId: string) =>
  `/opencode/sessions/${sessionId}`;
const opencodeSessionResolvePath = (sessionId: string) =>
  `/opencode/sessions/${sessionId}/resolve`;
const opencodeSessionRejectPath = (sessionId: string) =>
  `/opencode/sessions/${sessionId}/reject`;

let previousProjectRoot: string | undefined;

const useProjectRoot = async (name: string) => {
  previousProjectRoot = process.env.AIM_PROJECT_ROOT;

  const projectRoot = join(routesTempRoot, name);

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

  await rm(routesTempRoot, { force: true, recursive: true });
});

describe("opencode session routes", () => {
  it("creates a pending OpenCode session record and reads the persisted prompt", async () => {
    const projectRoot = await useProjectRoot("creates-and-reads-session");
    const app = createApp();

    const createResponse = await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-1",
        continue_prompt: "Continue the standalone AIM-controlled session.",
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdSession = await createResponse.json();

    expect(createdSession).toMatchObject({
      session_id: "session-1",
      state: "pending",
      value: null,
      reason: null,
      continue_prompt: "Continue the standalone AIM-controlled session.",
    });
    expect(Date.parse(createdSession.created_at)).not.toBeNaN();
    expect(Date.parse(createdSession.updated_at)).not.toBeNaN();

    const detailResponse = await app.request(opencodeSessionPath("session-1"));

    expect(detailResponse.status).toBe(200);
    await expect(detailResponse.json()).resolves.toEqual(createdSession);

    const database = new DatabaseSync(join(projectRoot, "aim.sqlite"));
    const columns = database
      .prepare("PRAGMA table_info(opencode_sessions)")
      .all();
    const persisted = database
      .prepare(
        "SELECT session_id, state, value, reason, continue_prompt FROM opencode_sessions WHERE session_id = ?",
      )
      .get("session-1");
    database.close();

    expect(columns.map((column) => (column as { name: string }).name)).toEqual(
      expect.arrayContaining([
        "session_id",
        "state",
        "value",
        "reason",
        "continue_prompt",
        "created_at",
        "updated_at",
      ]),
    );
    expect(persisted).toEqual({
      session_id: "session-1",
      state: "pending",
      value: null,
      reason: null,
      continue_prompt: "Continue the standalone AIM-controlled session.",
    });
  });

  it("settles pending OpenCode sessions through resolve and reject endpoints", async () => {
    await useProjectRoot("settles-sessions");
    const app = createApp();

    await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-resolved",
        continue_prompt: "Continue until resolved.",
      }),
    });
    await app.request(opencodeSessionsPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "session-rejected",
        continue_prompt: "Continue until rejected.",
      }),
    });

    const resolveResponse = await app.request(
      opencodeSessionResolvePath("session-resolved"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "finished" }),
      },
    );
    const rejectResponse = await app.request(
      opencodeSessionRejectPath("session-rejected"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "blocked" }),
      },
    );

    expect(resolveResponse.status).toBe(204);
    expect(rejectResponse.status).toBe(204);

    await expect(
      (await app.request(opencodeSessionPath("session-resolved"))).json(),
    ).resolves.toMatchObject({
      session_id: "session-resolved",
      state: "resolved",
      value: "finished",
      reason: null,
    });
    await expect(
      (await app.request(opencodeSessionPath("session-rejected"))).json(),
    ).resolves.toMatchObject({
      session_id: "session-rejected",
      state: "rejected",
      value: null,
      reason: "blocked",
    });
  });
});
