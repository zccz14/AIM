import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateOpencodeClient = vi.fn();
const testProjectId = "00000000-0000-4000-8000-000000000101";
const aimHome = join(process.cwd(), ".tmp", "opencode-session-manager-home");
const expectedRuntimeDirectory = join(aimHome, "projects", testProjectId);
const successfulRuntimeResponse = {
  data: { directory: expectedRuntimeDirectory },
  response: { ok: true, status: 200 },
};

const initializeProjectWorkspace = async () => {
  await mkdir(expectedRuntimeDirectory, { recursive: true });
  execFileSync("git", ["init", "--quiet"], { cwd: expectedRuntimeDirectory });
  execFileSync(
    "git",
    ["remote", "add", "origin", "https://github.com/example/repo.git"],
    { cwd: expectedRuntimeDirectory },
  );
};

vi.mock("@opencode-ai/sdk", () => ({
  createOpencodeClient: mockCreateOpencodeClient,
}));

type StoredSession = {
  continue_prompt: null | string;
  created_at: string;
  model_id?: null | string;
  project_id?: null | string;
  provider_id?: null | string;
  session_id: string;
  state: "pending" | "rejected" | "resolved";
  title?: null | string;
};

const createRepository = () => {
  const sessions: StoredSession[] = [];
  const sessionReferences = new Map<
    string,
    {
      coordinator_state_project_ids: string[];
      manager_state_project_ids: string[];
      task_ids: string[];
    }
  >();

  return {
    [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    async createSession(input: {
      created_at?: string;
      continue_prompt?: null | string;
      model_id?: null | string;
      project_id?: null | string;
      provider_id?: null | string;
      session_id: string;
      title?: null | string;
    }) {
      const session: StoredSession = {
        continue_prompt: input.continue_prompt ?? null,
        created_at: input.created_at ?? new Date().toISOString(),
        model_id: input.model_id ?? null,
        project_id: input.project_id ?? testProjectId,
        provider_id: input.provider_id ?? null,
        session_id: input.session_id,
        state: "pending",
        title: input.title ?? null,
      };

      sessions.push(session);

      return session;
    },
    listSessions(filter: { state?: "pending" | "rejected" | "resolved" }) {
      return filter.state
        ? sessions.filter((session) => session.state === filter.state)
        : [...sessions];
    },
    deleteSessionById: vi.fn((sessionId: string) => {
      const sessionIndex = sessions.findIndex(
        (session) => session.session_id === sessionId,
      );
      if (sessionIndex >= 0) {
        sessions.splice(sessionIndex, 1);
      }
    }),
    getSessionReferences: vi.fn(
      (sessionId: string) =>
        sessionReferences.get(sessionId) ?? {
          coordinator_state_project_ids: [],
          manager_state_project_ids: [],
          task_ids: [],
        },
    ),
    getProjectById: vi.fn((projectId: string) =>
      projectId === testProjectId
        ? {
            git_origin_url: "https://github.com/example/repo.git",
            global_model_id: "claude-sonnet-4-5",
            global_provider_id: "anthropic",
            id: testProjectId,
          }
        : null,
    ),
    referenceSession(sessionId: string) {
      sessionReferences.set(sessionId, {
        coordinator_state_project_ids: [],
        manager_state_project_ids: [],
        task_ids: [`task-${sessionId}`],
      });
    },
  };
};

describe("createOpenCodeSessionManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T12:00:00.000Z"));
    vi.clearAllMocks();
    process.env.AIM_HOME = aimHome;
  });

  afterEach(async () => {
    delete process.env.AIM_HOME;
    vi.useRealTimers();
    vi.resetModules();
    vi.restoreAllMocks();
    await rm(aimHome, { force: true, recursive: true });
  });

  it("creates an OpenCode session from the project workspace and model and returns only the stored session id without sending the prompt", async () => {
    await initializeProjectWorkspace();
    const repository = createRepository();
    const create = vi.fn().mockResolvedValue({ data: { id: "session-1" } });
    const promptAsync = vi.fn().mockResolvedValue({});
    const abort = vi.fn().mockResolvedValue({});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        abort,
        create,
        messages: vi.fn().mockResolvedValue({ data: [] }),
        promptAsync,
      },
    });

    const { createOpenCodeSessionManager } = await import(
      "../src/opencode-session-manager.js"
    );
    const manager = createOpenCodeSessionManager({
      baseUrl: "http://127.0.0.1:54321",
      repository,
    });
    expect(manager).not.toHaveProperty("continueSession");

    const session = await manager.createSession({
      prompt: "Continue the task.",
      projectId: testProjectId,
      title: "AIM Developer: Task 1",
    });

    expect(session).toEqual({ session_id: "session-1" });
    expect(session).not.toHaveProperty("sessionId");
    expect(Symbol.asyncDispose in session).toBe(false);

    expect(create).toHaveBeenCalledWith({
      body: { title: "AIM Developer: Task 1" },
      query: { directory: expectedRuntimeDirectory },
      throwOnError: true,
    });
    expect(repository.listSessions({ state: "pending" })).toMatchObject([
      {
        continue_prompt: "Continue the task.",
        model_id: "claude-sonnet-4-5",
        project_id: testProjectId,
        provider_id: "anthropic",
        session_id: "session-1",
        state: "pending",
        title: "AIM Developer: Task 1",
      },
    ]);
    expect(promptAsync).not.toHaveBeenCalled();
    expect(abort).not.toHaveBeenCalled();

    await manager[Symbol.asyncDispose]();

    expect(repository[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("sends the stored prompt with persisted model when the latest message is older than 5 minutes", async () => {
    const repository = createRepository();
    await repository.createSession({
      continue_prompt: "Recover the session.",
      model_id: "claude-sonnet-4-5",
      provider_id: "anthropic",
      session_id: "session-pending",
    });
    repository.referenceSession("session-pending");
    const promptAsync = vi.fn().mockResolvedValue({});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
        get: vi.fn().mockResolvedValue(successfulRuntimeResponse),
        messages: vi.fn().mockResolvedValue({
          data: [
            {
              info: {
                time: { created: Date.now() - 6 * 60 * 1000 },
              },
              parts: [],
            },
          ],
        }),
        promptAsync,
      },
    });

    const { createOpenCodeSessionManager } = await import(
      "../src/opencode-session-manager.js"
    );
    const manager = createOpenCodeSessionManager({
      apiBaseUrl: "http://aim.example.test",
      baseUrl: "http://127.0.0.1:54321",
      repository,
    });

    await vi.advanceTimersByTimeAsync(1);

    const sentText = promptAsync.mock.calls[0]?.[0].body.parts[0].text;
    expect(sentText).toContain("Recover the session.");
    expect(sentText).toContain(
      "http://aim.example.test/opencode/sessions/session-pending/resolve",
    );
    expect(sentText).toContain(
      "http://aim.example.test/opencode/sessions/session-pending/reject",
    );
    expect(sentText).toContain("curl");
    expect(sentText).not.toContain("call aim_session_resolve");
    expect(sentText).not.toContain("call aim_session_reject");
    expect(promptAsync).toHaveBeenCalledWith({
      body: {
        model: { modelID: "claude-sonnet-4-5", providerID: "anthropic" },
        parts: [{ text: sentText, type: "text" }],
      },
      path: { id: "session-pending" },
      throwOnError: true,
    });

    await manager[Symbol.asyncDispose]();
  });

  it("does not prompt a pending session whose latest message is newer than 5 minutes", async () => {
    const repository = createRepository();
    await repository.createSession({
      continue_prompt: "Do not send yet.",
      session_id: "session-fresh",
    });
    repository.referenceSession("session-fresh");
    const promptAsync = vi.fn().mockResolvedValue({});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
        get: vi.fn().mockResolvedValue(successfulRuntimeResponse),
        messages: vi.fn().mockResolvedValue({
          data: [
            {
              info: {
                time: { created: Date.now() - 4 * 60 * 1000 },
              },
              parts: [],
            },
          ],
        }),
        promptAsync,
      },
    });

    const { createOpenCodeSessionManager } = await import(
      "../src/opencode-session-manager.js"
    );
    const manager = createOpenCodeSessionManager({
      baseUrl: "http://127.0.0.1:54321",
      repository,
    });

    await vi.advanceTimersByTimeAsync(1);

    expect(promptAsync).not.toHaveBeenCalled();

    await manager[Symbol.asyncDispose]();
  });

  it("does not prompt when the root session is stale but a sub-session has a message newer than 5 minutes", async () => {
    const repository = createRepository();
    await repository.createSession({
      continue_prompt: "Do not send while sub-session is active.",
      session_id: "session-with-active-child",
    });
    repository.referenceSession("session-with-active-child");
    const promptAsync = vi.fn().mockResolvedValue({});
    const messages = vi.fn(async ({ path }: { path: { id: string } }) => {
      if (path.id === "session-with-active-child") {
        return {
          data: [
            {
              info: {
                time: { created: Date.now() - 6 * 60 * 1000 },
              },
              parts: [
                {
                  state: { metadata: { sessionId: "active-child-session" } },
                  tool: "task",
                  type: "tool",
                },
              ],
            },
          ],
        };
      }

      if (path.id === "active-child-session") {
        return {
          data: [
            {
              info: {
                time: { created: Date.now() - 4 * 60 * 1000 },
              },
              parts: [],
            },
          ],
        };
      }

      throw new Error(`Unexpected session messages request: ${path.id}`);
    });

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
        get: vi.fn().mockResolvedValue(successfulRuntimeResponse),
        messages,
        promptAsync,
      },
    });

    const { createOpenCodeSessionManager } = await import(
      "../src/opencode-session-manager.js"
    );
    const manager = createOpenCodeSessionManager({
      baseUrl: "http://127.0.0.1:54321",
      repository,
    });

    await vi.advanceTimersByTimeAsync(1);

    expect(messages).toHaveBeenCalledWith({
      path: { id: "active-child-session" },
      throwOnError: true,
    });
    expect(promptAsync).not.toHaveBeenCalled();

    await manager[Symbol.asyncDispose]();
  });

  it("prompts when the root session and all sub-sessions have latest messages older than 5 minutes", async () => {
    const repository = createRepository();
    await repository.createSession({
      continue_prompt: "Recover after child sessions are stale.",
      session_id: "session-with-stale-child",
    });
    repository.referenceSession("session-with-stale-child");
    const promptAsync = vi.fn().mockResolvedValue({});
    const messages = vi.fn(async ({ path }: { path: { id: string } }) => {
      if (path.id === "session-with-stale-child") {
        return {
          data: [
            {
              info: {
                time: { created: Date.now() - 8 * 60 * 1000 },
              },
              parts: [
                {
                  state: { metadata: { sessionId: "stale-child-session" } },
                  tool: "task",
                  type: "tool",
                },
              ],
            },
          ],
        };
      }

      if (path.id === "stale-child-session") {
        return {
          data: [
            {
              info: {
                time: { created: Date.now() - 6 * 60 * 1000 },
              },
              parts: [],
            },
          ],
        };
      }

      throw new Error(`Unexpected session messages request: ${path.id}`);
    });

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
        get: vi.fn().mockResolvedValue(successfulRuntimeResponse),
        messages,
        promptAsync,
      },
    });

    const { createOpenCodeSessionManager, withContinuation } = await import(
      "../src/opencode-session-manager.js"
    );
    const manager = createOpenCodeSessionManager({
      apiBaseUrl: "http://aim.example.test",
      baseUrl: "http://127.0.0.1:54321",
      repository,
    });

    await vi.advanceTimersByTimeAsync(1);

    expect(promptAsync).toHaveBeenCalledWith({
      body: {
        model: undefined,
        parts: [
          {
            text: withContinuation("Recover after child sessions are stale.", {
              apiBaseUrl: "http://aim.example.test",
              sessionId: "session-with-stale-child",
            }),
            type: "text",
          },
        ],
      },
      path: { id: "session-with-stale-child" },
      throwOnError: true,
    });

    await manager[Symbol.asyncDispose]();
  });

  it("deletes a referenced pending AIM session when the runtime session lookup returns 404 before reading messages", async () => {
    const repository = createRepository();
    await repository.createSession({
      continue_prompt: "Do not recover dangling session.",
      session_id: "session-dangling",
    });
    repository.referenceSession("session-dangling");
    const get = vi
      .fn()
      .mockResolvedValue({ response: { ok: false, status: 404 } });
    const messages = vi.fn().mockResolvedValue({ data: [] });
    const promptAsync = vi.fn().mockResolvedValue({});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
        get,
        messages,
        promptAsync,
      },
    });

    const { createOpenCodeSessionManager } = await import(
      "../src/opencode-session-manager.js"
    );
    const manager = createOpenCodeSessionManager({
      baseUrl: "http://127.0.0.1:54321",
      repository,
    });

    await vi.advanceTimersByTimeAsync(1);

    expect(get).toHaveBeenCalledWith({
      path: { id: "session-dangling" },
      throwOnError: false,
    });
    expect(messages).not.toHaveBeenCalled();
    expect(repository.deleteSessionById).toHaveBeenCalledWith(
      "session-dangling",
    );
    expect(repository.listSessions({ state: "pending" })).toEqual([]);
    expect(promptAsync).not.toHaveBeenCalled();

    await manager[Symbol.asyncDispose]();
  });

  it("deletes a referenced pending AIM session when the runtime directory does not match the project workspace", async () => {
    const repository = createRepository();
    await repository.createSession({
      continue_prompt: "Do not recover wrong workspace.",
      project_id: testProjectId,
      session_id: "session-wrong-directory",
    });
    repository.referenceSession("session-wrong-directory");
    const messages = vi.fn().mockResolvedValue({ data: [] });
    const promptAsync = vi.fn().mockResolvedValue({});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
        get: vi.fn().mockResolvedValue({
          data: { directory: "/tmp/not-the-project-workspace" },
          response: { ok: true, status: 200 },
        }),
        messages,
        promptAsync,
      },
    });

    const { createOpenCodeSessionManager } = await import(
      "../src/opencode-session-manager.js"
    );
    const manager = createOpenCodeSessionManager({
      baseUrl: "http://127.0.0.1:54321",
      repository,
    });

    await vi.advanceTimersByTimeAsync(1);

    expect(repository.deleteSessionById).toHaveBeenCalledWith(
      "session-wrong-directory",
    );
    expect(repository.listSessions({ state: "pending" })).toEqual([]);
    expect(messages).not.toHaveBeenCalled();
    expect(promptAsync).not.toHaveBeenCalled();

    await manager[Symbol.asyncDispose]();
  });

  it("keeps a referenced pending AIM session when message retrieval fails after runtime lookup succeeds", async () => {
    const repository = createRepository();
    await repository.createSession({
      continue_prompt: "Do not recover dangling session.",
      session_id: "session-dangling",
    });
    repository.referenceSession("session-dangling");
    const messagesError = { response: { status: 404 } };
    const messages = vi.fn().mockRejectedValue(messagesError);
    const promptAsync = vi.fn().mockResolvedValue({});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
        get: vi.fn().mockResolvedValue(successfulRuntimeResponse),
        messages,
        promptAsync,
      },
    });

    const { createOpenCodeSessionManager } = await import(
      "../src/opencode-session-manager.js"
    );
    const manager = createOpenCodeSessionManager({
      baseUrl: "http://127.0.0.1:54321",
      repository,
    });

    await vi.advanceTimersByTimeAsync(1);

    expect(messages).toHaveBeenCalledWith({
      path: { id: "session-dangling" },
      throwOnError: true,
    });
    expect(repository.deleteSessionById).not.toHaveBeenCalled();
    expect(repository.listSessions({ state: "pending" })).toMatchObject([
      { session_id: "session-dangling", state: "pending" },
    ]);
    expect(promptAsync).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "OpenCode pending session recovery failed",
      {
        error: messagesError,
        session_id: "session-dangling",
      },
    );

    await manager[Symbol.asyncDispose]();
  });

  it("deletes a referenced pending AIM session with no continuation prompt when runtime lookup returns 404", async () => {
    const repository = createRepository();
    await repository.createSession({
      continue_prompt: null,
      session_id: "session-dangling-without-prompt",
    });
    repository.referenceSession("session-dangling-without-prompt");
    const get = vi
      .fn()
      .mockResolvedValue({ response: { ok: false, status: 404 } });
    const messages = vi.fn().mockResolvedValue({ data: [] });
    const promptAsync = vi.fn().mockResolvedValue({});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
        get,
        messages,
        promptAsync,
      },
    });

    const { createOpenCodeSessionManager } = await import(
      "../src/opencode-session-manager.js"
    );
    const manager = createOpenCodeSessionManager({
      baseUrl: "http://127.0.0.1:54321",
      repository,
    });

    await vi.advanceTimersByTimeAsync(1);

    expect(get).toHaveBeenCalledWith({
      path: { id: "session-dangling-without-prompt" },
      throwOnError: false,
    });
    expect(messages).not.toHaveBeenCalled();
    expect(repository.deleteSessionById).toHaveBeenCalledWith(
      "session-dangling-without-prompt",
    );
    expect(repository.listSessions({ state: "pending" })).toEqual([]);
    expect(promptAsync).not.toHaveBeenCalled();

    await manager[Symbol.asyncDispose]();
  });

  it("keeps a referenced pending AIM session when OpenCode messages fail for a reason other than not found", async () => {
    const repository = createRepository();
    await repository.createSession({
      continue_prompt: "Retry later.",
      session_id: "session-temporary-message-failure",
    });
    repository.referenceSession("session-temporary-message-failure");
    const messagesError = new Error("temporary outage");
    const messages = vi.fn().mockRejectedValue(messagesError);
    const promptAsync = vi.fn().mockResolvedValue({});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
        get: vi.fn().mockResolvedValue(successfulRuntimeResponse),
        messages,
        promptAsync,
      },
    });

    const { createOpenCodeSessionManager } = await import(
      "../src/opencode-session-manager.js"
    );
    const manager = createOpenCodeSessionManager({
      baseUrl: "http://127.0.0.1:54321",
      repository,
    });

    await vi.advanceTimersByTimeAsync(1);

    expect(repository.deleteSessionById).not.toHaveBeenCalled();
    expect(repository.listSessions({ state: "pending" })).toMatchObject([
      { session_id: "session-temporary-message-failure", state: "pending" },
    ]);
    expect(promptAsync).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "OpenCode pending session recovery failed",
      {
        error: messagesError,
        session_id: "session-temporary-message-failure",
      },
    );

    await manager[Symbol.asyncDispose]();
  });

  it("continues pending session patrol when dangling cleanup fails for one session", async () => {
    const repository = createRepository();
    await repository.createSession({
      continue_prompt: "Delete me.",
      session_id: "session-dangling-delete-fails",
    });
    repository.referenceSession("session-dangling-delete-fails");
    await repository.createSession({
      continue_prompt: "Recover after dangling cleanup failure.",
      session_id: "session-after-dangling-delete-failure",
    });
    repository.referenceSession("session-after-dangling-delete-failure");
    repository.deleteSessionById.mockImplementationOnce(() => {
      throw new Error("temporary delete failure");
    });
    const get = vi
      .fn()
      .mockResolvedValueOnce({ response: { ok: false, status: 404 } })
      .mockResolvedValue(successfulRuntimeResponse);
    const messages = vi.fn().mockResolvedValue({ data: [] });
    const promptAsync = vi.fn().mockResolvedValue({});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
        get,
        messages,
        promptAsync,
      },
    });

    const { createOpenCodeSessionManager, withContinuation } = await import(
      "../src/opencode-session-manager.js"
    );
    const manager = createOpenCodeSessionManager({
      baseUrl: "http://127.0.0.1:54321",
      repository,
    });

    await vi.advanceTimersByTimeAsync(1001);

    expect(warn).toHaveBeenCalledWith(
      "OpenCode dangling session cleanup failed",
      {
        error: "temporary delete failure",
        session_id: "session-dangling-delete-fails",
      },
    );
    expect(promptAsync).toHaveBeenCalledWith({
      body: {
        model: undefined,
        parts: [
          {
            text: withContinuation("Recover after dangling cleanup failure.", {
              apiBaseUrl: "http://localhost:8192",
              sessionId: "session-after-dangling-delete-failure",
            }),
            type: "text",
          },
        ],
      },
      path: { id: "session-after-dangling-delete-failure" },
      throwOnError: true,
    });

    await manager[Symbol.asyncDispose]();
  });

  it("continues recovering pending sessions after one repository scan fails", async () => {
    const repository = createRepository();
    await repository.createSession({
      continue_prompt: "Recover after scan failure.",
      session_id: "session-after-scan-error",
    });
    repository.referenceSession("session-after-scan-error");
    const listSessions = vi
      .spyOn(repository, "listSessions")
      .mockRejectedValueOnce(new Error("temporary repository failure"));
    const promptAsync = vi.fn().mockResolvedValue({});

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
        get: vi.fn().mockResolvedValue(successfulRuntimeResponse),
        messages: vi.fn().mockResolvedValue({ data: [] }),
        promptAsync,
      },
    });

    const { createOpenCodeSessionManager, withContinuation } = await import(
      "../src/opencode-session-manager.js"
    );
    const manager = createOpenCodeSessionManager({
      baseUrl: "http://127.0.0.1:54321",
      repository,
    });

    await vi.advanceTimersByTimeAsync(1001);

    expect(listSessions).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith("OpenCode pending session scan failed", {
      error: "temporary repository failure",
    });
    expect(promptAsync).toHaveBeenCalledWith({
      body: {
        model: undefined,
        parts: [
          {
            text: withContinuation("Recover after scan failure.", {
              apiBaseUrl: "http://localhost:8192",
              sessionId: "session-after-scan-error",
            }),
            type: "text",
          },
        ],
      },
      path: { id: "session-after-scan-error" },
      throwOnError: true,
    });

    await manager[Symbol.asyncDispose]();
  });

  it("continues recovering other pending sessions after one prompt fails", async () => {
    const repository = createRepository();
    await repository.createSession({
      continue_prompt: "First recovery prompt.",
      session_id: "session-prompt-fails",
    });
    repository.referenceSession("session-prompt-fails");
    await repository.createSession({
      continue_prompt: "Second recovery prompt.",
      session_id: "session-prompt-continues",
    });
    repository.referenceSession("session-prompt-continues");
    const promptError = new Error("temporary prompt failure");
    const promptAsync = vi
      .fn()
      .mockRejectedValueOnce(promptError)
      .mockResolvedValue({});

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
        get: vi.fn().mockResolvedValue(successfulRuntimeResponse),
        messages: vi.fn().mockResolvedValue({ data: [] }),
        promptAsync,
      },
    });

    const { createOpenCodeSessionManager, withContinuation } = await import(
      "../src/opencode-session-manager.js"
    );
    const manager = createOpenCodeSessionManager({
      baseUrl: "http://127.0.0.1:54321",
      repository,
    });

    await vi.advanceTimersByTimeAsync(1001);

    expect(warn).toHaveBeenCalledWith(
      "OpenCode pending session recovery failed",
      {
        error: promptError,
        session_id: "session-prompt-fails",
      },
    );
    expect(promptAsync).toHaveBeenCalledWith({
      body: {
        model: undefined,
        parts: [
          {
            text: withContinuation("Second recovery prompt.", {
              apiBaseUrl: "http://localhost:8192",
              sessionId: "session-prompt-continues",
            }),
            type: "text",
          },
        ],
      },
      path: { id: "session-prompt-continues" },
      throwOnError: true,
    });

    await manager[Symbol.asyncDispose]();
  });

  it("can repeat a stale continuation prompt on the next patrol when messages still report the same stale timestamp", async () => {
    const repository = createRepository();
    await repository.createSession({
      continue_prompt: "Recover only once for now.",
      session_id: "session-throttled",
    });
    repository.referenceSession("session-throttled");
    const promptAsync = vi.fn().mockResolvedValue({});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
        get: vi.fn().mockResolvedValue(successfulRuntimeResponse),
        messages: vi.fn().mockResolvedValue({ data: [] }),
        promptAsync,
      },
    });

    const { createOpenCodeSessionManager } = await import(
      "../src/opencode-session-manager.js"
    );
    const manager = createOpenCodeSessionManager({
      baseUrl: "http://127.0.0.1:54321",
      repository,
    });

    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(2001);

    expect(promptAsync).toHaveBeenCalledTimes(2);

    await manager[Symbol.asyncDispose]();
  });

  it("disposes the background recovery loop without leaving active timers", async () => {
    const repository = createRepository();

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
        messages: vi.fn().mockResolvedValue({ data: [] }),
        promptAsync: vi.fn().mockResolvedValue({}),
      },
    });

    const { createOpenCodeSessionManager } = await import(
      "../src/opencode-session-manager.js"
    );
    const manager = createOpenCodeSessionManager({
      baseUrl: "http://127.0.0.1:54321",
      repository,
    });

    await vi.advanceTimersByTimeAsync(1);
    await manager[Symbol.asyncDispose]();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("skips orphan pending AIM sessions inside the cleanup grace window without prompting them", async () => {
    const repository = createRepository();
    await repository.createSession({
      continue_prompt: "Do not recover orphan.",
      created_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
      session_id: "session-orphan-under-grace",
    });
    const messages = vi.fn().mockResolvedValue({ data: [] });
    const promptAsync = vi.fn().mockResolvedValue({});
    const abort = vi.fn().mockResolvedValue({});
    const deleteSession = vi.fn().mockResolvedValue({});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        abort,
        create: vi.fn(),
        delete: deleteSession,
        messages,
        promptAsync,
      },
    });

    const { createOpenCodeSessionManager } = await import(
      "../src/opencode-session-manager.js"
    );
    const manager = createOpenCodeSessionManager({
      baseUrl: "http://127.0.0.1:54321",
      repository,
    });

    await vi.advanceTimersByTimeAsync(1);

    expect(messages).not.toHaveBeenCalled();
    expect(promptAsync).not.toHaveBeenCalled();
    expect(abort).not.toHaveBeenCalled();
    expect(deleteSession).not.toHaveBeenCalled();
    expect(repository.deleteSessionById).not.toHaveBeenCalled();

    await manager[Symbol.asyncDispose]();
  });

  it("waits before processing the next pending session after skipping an orphan inside the cleanup grace window", async () => {
    const repository = createRepository();
    await repository.createSession({
      continue_prompt: "Do not recover orphan yet.",
      created_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
      session_id: "session-orphan-under-grace-first",
    });
    await repository.createSession({
      continue_prompt: "Recover after orphan grace skip.",
      session_id: "session-after-orphan-grace-skip",
    });
    repository.referenceSession("session-after-orphan-grace-skip");
    const promptAsync = vi.fn().mockResolvedValue({});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        abort: vi.fn().mockResolvedValue({}),
        create: vi.fn(),
        get: vi.fn().mockResolvedValue(successfulRuntimeResponse),
        messages: vi.fn().mockResolvedValue({ data: [] }),
        promptAsync,
      },
    });

    const { createOpenCodeSessionManager, withContinuation } = await import(
      "../src/opencode-session-manager.js"
    );
    const manager = createOpenCodeSessionManager({
      baseUrl: "http://127.0.0.1:54321",
      repository,
    });

    await vi.advanceTimersByTimeAsync(1);

    expect(promptAsync).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(promptAsync).toHaveBeenCalledWith({
      body: {
        model: undefined,
        parts: [
          {
            text: withContinuation("Recover after orphan grace skip.", {
              apiBaseUrl: "http://localhost:8192",
              sessionId: "session-after-orphan-grace-skip",
            }),
            type: "text",
          },
        ],
      },
      path: { id: "session-after-orphan-grace-skip" },
      throwOnError: true,
    });

    await manager[Symbol.asyncDispose]();
  });

  it("deletes orphan pending runtime sessions past the cleanup grace window instead of aborting them", async () => {
    const repository = createRepository();
    await repository.createSession({
      continue_prompt: "Do not recover expired orphan.",
      created_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
      session_id: "session-orphan-expired",
    });
    const messages = vi.fn().mockResolvedValue({ data: [] });
    const promptAsync = vi.fn().mockResolvedValue({});
    const abort = vi.fn().mockResolvedValue({});
    const deleteSession = vi.fn().mockResolvedValue(successfulRuntimeResponse);

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        abort,
        create: vi.fn(),
        delete: deleteSession,
        messages,
        promptAsync,
      },
    });

    const { createOpenCodeSessionManager } = await import(
      "../src/opencode-session-manager.js"
    );
    const manager = createOpenCodeSessionManager({
      baseUrl: "http://127.0.0.1:54321",
      repository,
    });

    await vi.advanceTimersByTimeAsync(1);

    expect(deleteSession).toHaveBeenCalledWith({
      path: { id: "session-orphan-expired" },
      throwOnError: false,
    });
    expect(abort).not.toHaveBeenCalled();
    expect(repository.deleteSessionById).toHaveBeenCalledWith(
      "session-orphan-expired",
    );
    expect(repository.listSessions({ state: "pending" })).toEqual([]);
    expect(messages).not.toHaveBeenCalled();
    expect(promptAsync).not.toHaveBeenCalled();

    await manager[Symbol.asyncDispose]();
  });

  it("deletes orphan pending AIM sessions past the cleanup grace window when runtime delete reports not found", async () => {
    const repository = createRepository();
    await repository.createSession({
      continue_prompt: "Do not recover absent orphan.",
      created_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
      session_id: "session-orphan-runtime-absent",
    });
    const messages = vi.fn().mockResolvedValue({ data: [] });
    const promptAsync = vi.fn().mockResolvedValue({});
    const deleteSession = vi
      .fn()
      .mockResolvedValue({ response: { ok: false, status: 404 } });

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        abort: vi.fn().mockResolvedValue({}),
        create: vi.fn(),
        delete: deleteSession,
        messages,
        promptAsync,
      },
    });

    const { createOpenCodeSessionManager } = await import(
      "../src/opencode-session-manager.js"
    );
    const manager = createOpenCodeSessionManager({
      baseUrl: "http://127.0.0.1:54321",
      repository,
    });

    await vi.advanceTimersByTimeAsync(1);

    expect(deleteSession).toHaveBeenCalledWith({
      path: { id: "session-orphan-runtime-absent" },
      throwOnError: false,
    });
    expect(repository.deleteSessionById).toHaveBeenCalledWith(
      "session-orphan-runtime-absent",
    );
    expect(repository.listSessions({ state: "pending" })).toEqual([]);
    expect(messages).not.toHaveBeenCalled();
    expect(promptAsync).not.toHaveBeenCalled();

    await manager[Symbol.asyncDispose]();
  });

  it("keeps orphan pending AIM sessions for retry when runtime delete fails for a non-not-found reason", async () => {
    const repository = createRepository();
    await repository.createSession({
      continue_prompt: "Retry orphan cleanup later.",
      created_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
      session_id: "session-orphan-delete-temporary-failure",
    });
    const messages = vi.fn().mockResolvedValue({ data: [] });
    const promptAsync = vi.fn().mockResolvedValue({});
    const deleteSession = vi
      .fn()
      .mockResolvedValue({ response: { ok: false, status: 503 } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        abort: vi.fn().mockResolvedValue({}),
        create: vi.fn(),
        delete: deleteSession,
        messages,
        promptAsync,
      },
    });

    const { createOpenCodeSessionManager } = await import(
      "../src/opencode-session-manager.js"
    );
    const manager = createOpenCodeSessionManager({
      baseUrl: "http://127.0.0.1:54321",
      repository,
    });

    await vi.advanceTimersByTimeAsync(1);

    expect(deleteSession).toHaveBeenCalledWith({
      path: { id: "session-orphan-delete-temporary-failure" },
      throwOnError: false,
    });
    expect(repository.deleteSessionById).not.toHaveBeenCalled();
    expect(repository.listSessions({ state: "pending" })).toMatchObject([
      {
        session_id: "session-orphan-delete-temporary-failure",
        state: "pending",
      },
    ]);
    expect(messages).not.toHaveBeenCalled();
    expect(promptAsync).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "OpenCode orphan runtime cleanup failed",
      {
        error: "OpenCode session delete failed with status 503",
        session_id: "session-orphan-delete-temporary-failure",
      },
    );

    await manager[Symbol.asyncDispose]();
  });

  it("waits before processing the next pending session after orphan cleanup", async () => {
    const repository = createRepository();
    await repository.createSession({
      continue_prompt: "Clean up expired orphan.",
      created_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
      session_id: "session-orphan-expired-first",
    });
    await repository.createSession({
      continue_prompt: "Recover after orphan cleanup.",
      session_id: "session-after-orphan-cleanup",
    });
    repository.referenceSession("session-after-orphan-cleanup");
    const abort = vi.fn().mockResolvedValue({});
    const deleteSession = vi.fn().mockResolvedValue(successfulRuntimeResponse);
    const promptAsync = vi.fn().mockResolvedValue({});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        abort,
        create: vi.fn(),
        delete: deleteSession,
        get: vi.fn().mockResolvedValue(successfulRuntimeResponse),
        messages: vi.fn().mockResolvedValue({ data: [] }),
        promptAsync,
      },
    });

    const { createOpenCodeSessionManager, withContinuation } = await import(
      "../src/opencode-session-manager.js"
    );
    const manager = createOpenCodeSessionManager({
      baseUrl: "http://127.0.0.1:54321",
      repository,
    });

    await vi.advanceTimersByTimeAsync(1);

    expect(deleteSession).toHaveBeenCalledWith({
      path: { id: "session-orphan-expired-first" },
      throwOnError: false,
    });
    expect(abort).not.toHaveBeenCalled();
    expect(repository.deleteSessionById).toHaveBeenCalledWith(
      "session-orphan-expired-first",
    );
    expect(promptAsync).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(promptAsync).toHaveBeenCalledWith({
      body: {
        model: undefined,
        parts: [
          {
            text: withContinuation("Recover after orphan cleanup.", {
              apiBaseUrl: "http://localhost:8192",
              sessionId: "session-after-orphan-cleanup",
            }),
            type: "text",
          },
        ],
      },
      path: { id: "session-after-orphan-cleanup" },
      throwOnError: true,
    });

    await manager[Symbol.asyncDispose]();
  });

  it("waits before processing the next pending session after dangling cleanup", async () => {
    const repository = createRepository();
    await repository.createSession({
      continue_prompt: "Clean up dangling session.",
      session_id: "session-dangling-first",
    });
    repository.referenceSession("session-dangling-first");
    await repository.createSession({
      continue_prompt: "Recover after dangling cleanup.",
      session_id: "session-after-dangling-cleanup",
    });
    repository.referenceSession("session-after-dangling-cleanup");
    const get = vi
      .fn()
      .mockResolvedValueOnce({ response: { ok: false, status: 404 } })
      .mockResolvedValue(successfulRuntimeResponse);
    const messages = vi.fn().mockResolvedValue({ data: [] });
    const promptAsync = vi.fn().mockResolvedValue({});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
        get,
        messages,
        promptAsync,
      },
    });

    const { createOpenCodeSessionManager, withContinuation } = await import(
      "../src/opencode-session-manager.js"
    );
    const manager = createOpenCodeSessionManager({
      baseUrl: "http://127.0.0.1:54321",
      repository,
    });

    await vi.advanceTimersByTimeAsync(1);

    expect(messages).not.toHaveBeenCalled();
    expect(repository.deleteSessionById).toHaveBeenCalledWith(
      "session-dangling-first",
    );
    expect(promptAsync).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(promptAsync).toHaveBeenCalledWith({
      body: {
        model: undefined,
        parts: [
          {
            text: withContinuation("Recover after dangling cleanup.", {
              apiBaseUrl: "http://localhost:8192",
              sessionId: "session-after-dangling-cleanup",
            }),
            type: "text",
          },
        ],
      },
      path: { id: "session-after-dangling-cleanup" },
      throwOnError: true,
    });

    await manager[Symbol.asyncDispose]();
  });

  it("continues pending session patrol when orphan cleanup fails for one session", async () => {
    const repository = createRepository();
    await repository.createSession({
      continue_prompt: "First orphan.",
      created_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
      session_id: "session-orphan-delete-fails",
    });
    await repository.createSession({
      continue_prompt: "Second orphan.",
      created_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
      session_id: "session-orphan-delete-continues",
    });
    const deleteError = new Error("temporary delete failure");
    repository.deleteSessionById.mockImplementationOnce(() => {
      throw deleteError;
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const abort = vi.fn().mockResolvedValue({});
    const deleteSession = vi.fn().mockResolvedValue(successfulRuntimeResponse);

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        abort,
        create: vi.fn(),
        delete: deleteSession,
        messages: vi.fn().mockResolvedValue({ data: [] }),
        promptAsync: vi.fn().mockResolvedValue({}),
      },
    });

    const { createOpenCodeSessionManager } = await import(
      "../src/opencode-session-manager.js"
    );
    const manager = createOpenCodeSessionManager({
      baseUrl: "http://127.0.0.1:54321",
      repository,
    });

    await vi.advanceTimersByTimeAsync(1001);

    expect(warn).toHaveBeenCalledWith(
      "OpenCode pending session recovery failed",
      {
        error: deleteError,
        session_id: "session-orphan-delete-fails",
      },
    );
    expect(repository.deleteSessionById).toHaveBeenCalledWith(
      "session-orphan-delete-continues",
    );
    expect(deleteSession).toHaveBeenCalledWith({
      path: { id: "session-orphan-delete-continues" },
      throwOnError: false,
    });
    expect(abort).not.toHaveBeenCalled();

    await manager[Symbol.asyncDispose]();
  });

  it("appends terminal settlement instructions without changing the original prompt", async () => {
    const { withContinuation } = await import(
      "../src/opencode-session-manager.js"
    );

    const prompt = withContinuation("External prompt.", {
      apiBaseUrl: "http://aim.example.test",
      sessionId: "session-helper",
    });

    expect(prompt.startsWith("External prompt.")).toBe(true);
    expect(prompt).toContain("AIM Session Settlement Protocol");
    expect(prompt).toContain(
      "http://aim.example.test/opencode/sessions/session-helper/resolve",
    );
    expect(prompt).toContain(
      "http://aim.example.test/opencode/sessions/session-helper/reject",
    );
    expect(prompt).toContain("curl");
    expect(prompt).toContain("value");
    expect(prompt).toContain("reason");
    expect(prompt).not.toContain("aim_session_resolve");
    expect(prompt).not.toContain("aim_session_reject");
    expect(prompt).not.toContain("Terminal instruction");
    expect(prompt).toContain("this loop will not end");
  });
});
