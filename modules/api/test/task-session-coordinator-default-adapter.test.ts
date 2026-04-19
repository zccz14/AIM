import { afterEach, describe, expect, it, vi } from "vitest";

const mockCreateOpenCodeSdkAdapter = vi.fn();

vi.mock("../src/opencode-sdk-adapter.js", () => ({
  createOpenCodeSdkAdapter: mockCreateOpenCodeSdkAdapter,
}));

describe("task session coordinator default adapter", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("uses the SDK adapter by default when one is not injected", async () => {
    const createSession = vi.fn().mockResolvedValue({ id: "session-1" });

    mockCreateOpenCodeSdkAdapter.mockReturnValue({
      createSession,
      getSession: vi.fn(),
      sendPrompt: vi.fn(),
    });

    const { createTaskSessionCoordinator } = await import(
      "../src/task-session-coordinator.js"
    );
    const coordinator = createTaskSessionCoordinator({
      baseUrl: "http://127.0.0.1:54321",
      modelId: "claude-sonnet-4-5",
      providerId: "anthropic",
    });

    await expect(
      coordinator.createSession({
        created_at: "2026-04-20T00:00:00.000Z",
        dependencies: [],
        done: false,
        pull_request_url: null,
        session_id: null,
        status: "created",
        task_id: "task-1",
        task_spec: "Implement the OpenCode SDK coordinator.",
        updated_at: "2026-04-20T00:00:00.000Z",
        worktree_path: "/repo/.worktrees/task-1",
      }),
    ).resolves.toEqual({ sessionId: "session-1" });

    expect(mockCreateOpenCodeSdkAdapter).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:54321",
      modelId: "claude-sonnet-4-5",
      providerId: "anthropic",
    });
    expect(createSession).toHaveBeenCalledOnce();
  });
});
