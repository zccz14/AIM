import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateOpencodeClient = vi.fn();

vi.mock("@opencode-ai/sdk", () => ({
  createOpencodeClient: mockCreateOpencodeClient,
}));

type StoredSession = {
  continue_prompt: null | string;
  session_id: string;
  state: "pending" | "rejected" | "resolved";
};

const createRepository = () => {
  const sessions: StoredSession[] = [];

  return {
    async createSession(input: {
      continue_prompt?: null | string;
      session_id: string;
    }) {
      const session: StoredSession = {
        continue_prompt: input.continue_prompt ?? null,
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
  });

  it("creates an OpenCode session, stores its prompt, and returns the session id without sending the prompt", async () => {
    const repository = createRepository();
    const create = vi.fn().mockResolvedValue({ data: { id: "session-1" } });
    const promptAsync = vi.fn().mockResolvedValue({});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
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

    await expect(
      manager.createSession({
        directory: "/repo/.worktrees/task-1",
        prompt: "Continue the task.",
      }),
    ).resolves.toBe("session-1");

    expect(create).toHaveBeenCalledWith({
      body: { title: "AIM OpenCode Session" },
      query: { directory: "/repo/.worktrees/task-1" },
      throwOnError: true,
    });
    expect(repository.listSessions({ state: "pending" })).toMatchObject([
      {
        continue_prompt: "Continue the task.",
        session_id: "session-1",
        state: "pending",
      },
    ]);
    expect(promptAsync).not.toHaveBeenCalled();

    await manager[Symbol.asyncDispose]();
  });

  it("sends the stored prompt when a pending session has no messages for 30 minutes", async () => {
    const repository = createRepository();
    await repository.createSession({
      continue_prompt: "Recover the session.",
      session_id: "session-pending",
    });
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

    expect(promptAsync).toHaveBeenCalledWith({
      body: { parts: [{ text: "Recover the session.", type: "text" }] },
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
    const promptAsync = vi.fn().mockResolvedValue({});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
        messages: vi.fn().mockResolvedValue({
          data: [{ time: Date.now() - 29 * 60 * 1000 }],
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
});
