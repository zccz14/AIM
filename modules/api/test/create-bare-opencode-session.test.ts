import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateOpencodeClient = vi.fn();

vi.mock("@opencode-ai/sdk", () => ({
  createOpencodeClient: mockCreateOpencodeClient,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createBareOpenCodeSession", () => {
  it("creates an OpenCode session without sending an initial prompt", async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ data: { id: "session-bare-1" } });
    const promptAsync = vi.fn();

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create,
        promptAsync,
      },
    });

    const { createBareOpenCodeSession } = await import(
      "../src/opencode/create-bare-session.js"
    );

    await expect(
      createBareOpenCodeSession({
        baseUrl: "http://127.0.0.1:54321",
        directory: "/repo/.worktrees/task-1",
        title: "Review task",
      }),
    ).resolves.toBe("session-bare-1");

    expect(mockCreateOpencodeClient).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:54321",
    });
    expect(create).toHaveBeenCalledWith({
      body: { title: "Review task" },
      query: { directory: "/repo/.worktrees/task-1" },
      throwOnError: true,
    });
    expect(promptAsync).not.toHaveBeenCalled();
  });
});

describe("sendPromptText", () => {
  it("sends a text prompt to an existing OpenCode session", async () => {
    const promptAsync = vi.fn().mockResolvedValue({});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        promptAsync,
      },
    });

    const { sendPromptText } = await import(
      "../src/opencode/create-bare-session.js"
    );

    await expect(
      sendPromptText({
        baseUrl: "http://127.0.0.1:54321",
        prompt: "Summarize the task",
        session_id: "session-bare-1",
      }),
    ).resolves.toBeUndefined();

    expect(mockCreateOpencodeClient).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:54321",
    });
    expect(promptAsync).toHaveBeenCalledWith({
      body: { parts: [{ text: "Summarize the task", type: "text" }] },
      path: { id: "session-bare-1" },
      throwOnError: true,
    });
  });
});
