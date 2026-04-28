import { afterEach, describe, expect, it, vi } from "vitest";

const mockCreateOpencodeClient = vi.fn();

vi.mock("@opencode-ai/sdk", () => ({
  createOpencodeClient: mockCreateOpencodeClient,
}));

describe("abortOpenCodeSession", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("aborts an OpenCode session without requiring a directory", async () => {
    const abort = vi.fn().mockResolvedValue({});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        abort,
      },
    });

    const { abortOpenCodeSession } = await import(
      "../src/opencode/abort-session.js"
    );

    await expect(
      abortOpenCodeSession({
        baseUrl: "http://127.0.0.1:54321",
        sessionId: "session-abort-1",
      }),
    ).resolves.toBeUndefined();

    expect(mockCreateOpencodeClient).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:54321",
    });
    expect(abort).toHaveBeenCalledWith({
      path: { id: "session-abort-1" },
      throwOnError: true,
    });
  });
});
