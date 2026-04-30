import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateOpencodeClient = vi.fn();

vi.mock("@opencode-ai/sdk", () => ({
  createOpencodeClient: mockCreateOpencodeClient,
}));

type StoredSession = {
  continue_prompt: null | string;
  created_at: string;
  model_id?: null | string;
  provider_id?: null | string;
  session_id: string;
  state: "pending" | "rejected" | "resolved";
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
      provider_id?: null | string;
      session_id: string;
    }) {
      const session: StoredSession = {
        continue_prompt: input.continue_prompt ?? null,
        created_at: input.created_at ?? new Date().toISOString(),
        model_id: input.model_id ?? null,
        provider_id: input.provider_id ?? null,
        session_id: input.session_id,
        state: "pending",
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
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("creates an OpenCode session, stores prompt and model metadata, and returns a disposable handle without sending the prompt", async () => {
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

    const session = await manager.createSession({
      directory: "/repo/.worktrees/task-1",
      model: { modelID: "claude-sonnet-4-5", providerID: "anthropic" },
      prompt: "Continue the task.",
      title: "AIM Developer: Task 1",
    });

    expect(session.sessionId).toBe("session-1");

    expect(create).toHaveBeenCalledWith({
      body: { title: "AIM Developer: Task 1" },
      query: { directory: "/repo/.worktrees/task-1" },
      throwOnError: true,
    });
    expect(repository.listSessions({ state: "pending" })).toMatchObject([
      {
        continue_prompt: "Continue the task.",
        model_id: "claude-sonnet-4-5",
        provider_id: "anthropic",
        session_id: "session-1",
        state: "pending",
      },
    ]);
    expect(promptAsync).not.toHaveBeenCalled();
    await session[Symbol.asyncDispose]();
    expect(abort).toHaveBeenCalledWith({
      path: { id: "session-1" },
      query: { directory: "/repo/.worktrees/task-1" },
      throwOnError: true,
    });

    await manager[Symbol.asyncDispose]();

    expect(repository[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("sends the stored prompt with persisted model when a pending session has no messages for 30 minutes", async () => {
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

    expect(promptAsync).toHaveBeenCalledWith({
      body: {
        model: { modelID: "claude-sonnet-4-5", providerID: "anthropic" },
        parts: [
          { text: withContinuation("Recover the session."), type: "text" },
        ],
      },
      path: { id: "session-pending" },
      throwOnError: true,
    });

    await manager[Symbol.asyncDispose]();
  });

  it("does not prompt a pending session whose latest message is newer than 30 minutes", async () => {
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
        messages: vi.fn().mockResolvedValue({
          data: [
            {
              info: {
                time: { created: Date.now() - 29 * 60 * 1000 },
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

  it("deletes a referenced pending AIM session when OpenCode reports its messages are not found", async () => {
    const repository = createRepository();
    await repository.createSession({
      continue_prompt: "Do not recover dangling session.",
      session_id: "session-dangling",
    });
    repository.referenceSession("session-dangling");
    const messages = vi.fn().mockRejectedValue({ response: { status: 404 } });
    const promptAsync = vi.fn().mockResolvedValue({});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
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
    expect(repository.deleteSessionById).toHaveBeenCalledWith(
      "session-dangling",
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
    const messages = vi.fn().mockRejectedValue(new Error("temporary outage"));
    const promptAsync = vi.fn().mockResolvedValue({});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
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
        error: "temporary outage",
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
    const messages = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 404 } })
      .mockResolvedValue({ data: [] });
    const promptAsync = vi.fn().mockResolvedValue({});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
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
            text: withContinuation("Recover after dangling cleanup failure."),
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
            text: withContinuation("Recover after scan failure."),
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
    const promptAsync = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary prompt failure"))
      .mockResolvedValue({});

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
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
        error: "temporary prompt failure",
        session_id: "session-prompt-fails",
      },
    );
    expect(promptAsync).toHaveBeenCalledWith({
      body: {
        model: undefined,
        parts: [
          { text: withContinuation("Second recovery prompt."), type: "text" },
        ],
      },
      path: { id: "session-prompt-continues" },
      throwOnError: true,
    });

    await manager[Symbol.asyncDispose]();
  });

  it("does not repeat a stale continuation prompt inside the retry throttle window", async () => {
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
    await vi.advanceTimersByTimeAsync(2000);

    expect(promptAsync).toHaveBeenCalledTimes(1);

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

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        abort,
        create: vi.fn(),
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
    expect(repository.deleteSessionById).not.toHaveBeenCalled();

    await manager[Symbol.asyncDispose]();
  });

  it("deletes orphan pending AIM sessions past the cleanup grace window even when the runtime session is absent", async () => {
    const repository = createRepository();
    await repository.createSession({
      continue_prompt: "Do not recover dangling orphan.",
      created_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
      session_id: "session-orphan-expired",
    });
    const messages = vi.fn().mockResolvedValue({ data: [] });
    const promptAsync = vi.fn().mockResolvedValue({});
    const abort = vi.fn().mockRejectedValue(new Error("session not found"));

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        abort,
        create: vi.fn(),
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

    expect(abort).toHaveBeenCalledWith({
      path: { id: "session-orphan-expired" },
      throwOnError: true,
    });
    expect(repository.deleteSessionById).toHaveBeenCalledWith(
      "session-orphan-expired",
    );
    expect(repository.listSessions({ state: "pending" })).toEqual([]);
    expect(messages).not.toHaveBeenCalled();
    expect(promptAsync).not.toHaveBeenCalled();

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
    repository.deleteSessionById.mockImplementationOnce(() => {
      throw new Error("temporary delete failure");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const abort = vi.fn().mockResolvedValue({});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        abort,
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

    await vi.advanceTimersByTimeAsync(1001);

    expect(warn).toHaveBeenCalledWith(
      "OpenCode pending session recovery failed",
      {
        error: "temporary delete failure",
        session_id: "session-orphan-delete-fails",
      },
    );
    expect(repository.deleteSessionById).toHaveBeenCalledWith(
      "session-orphan-delete-continues",
    );
    expect(abort).toHaveBeenCalledWith({
      path: { id: "session-orphan-delete-continues" },
      throwOnError: true,
    });

    await manager[Symbol.asyncDispose]();
  });

  it("pushes explicit continuation prompts with selected model metadata", async () => {
    const repository = createRepository();
    const promptAsync = vi.fn().mockResolvedValue({});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
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

    await manager.pushContinuationPrompt({
      model: { modelID: "claude-sonnet-4-5", providerID: "anthropic" },
      prompt: "Continue explicitly.",
      sessionId: "session-explicit",
    });

    expect(promptAsync).toHaveBeenCalledWith({
      body: {
        model: { modelID: "claude-sonnet-4-5", providerID: "anthropic" },
        parts: [
          { text: withContinuation("Continue explicitly."), type: "text" },
        ],
      },
      path: { id: "session-explicit" },
      throwOnError: true,
    });

    await manager[Symbol.asyncDispose]();
  });

  it("appends terminal settlement instructions without changing the original prompt", async () => {
    const { withContinuation } = await import(
      "../src/opencode-session-manager.js"
    );

    const prompt = withContinuation("External prompt.");

    expect(prompt.startsWith("External prompt.")).toBe(true);
    expect(prompt).toContain("aim_session_resolve");
    expect(prompt).toContain("aim_session_reject");
    expect(prompt).toContain("this loop will not end");
  });
});
