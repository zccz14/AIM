import { afterEach, describe, expect, it, vi } from "vitest";

const mockCreateOpencodeClient = vi.fn();

vi.mock("@opencode-ai/sdk", () => ({
  createOpencodeClient: mockCreateOpencodeClient,
}));

describe("agent session coordinator", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns an async-disposable session that aborts the OpenCode session", async () => {
    const abort = vi.fn().mockResolvedValue({});
    const create = vi.fn().mockResolvedValue({ data: { id: "session-1" } });
    const promptAsync = vi.fn().mockResolvedValue({});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        abort,
        create,
        messages: vi.fn(),
        promptAsync,
      },
    });

    const { createAgentSessionCoordinator } = await import(
      "../src/agent-session-coordinator.js"
    );
    const coordinator = createAgentSessionCoordinator({
      baseUrl: "http://127.0.0.1:54321",
    });

    const session = await coordinator.createSession({
      modelId: "gpt-5.5",
      projectPath: "/repo",
      prompt: "FOLLOW the aim-manager-guide SKILL.",
      providerId: "openai",
      title: "AIM Manager evaluation lane",
    });

    expect(session).toMatchObject({ sessionId: "session-1" });
    expect(session[Symbol.asyncDispose]).toEqual(expect.any(Function));

    await session[Symbol.asyncDispose]();

    expect(abort).toHaveBeenCalledWith({
      path: { id: "session-1" },
      query: { directory: "/repo" },
      throwOnError: true,
    });
  });
});
