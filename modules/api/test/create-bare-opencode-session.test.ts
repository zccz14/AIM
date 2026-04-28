import { describe, expect, it, vi } from "vitest";

const mockCreateOpencodeClient = vi.fn();

vi.mock("@opencode-ai/sdk", () => ({
  createOpencodeClient: mockCreateOpencodeClient,
}));

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
