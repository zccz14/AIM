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

  it("validates config before constructing the default SDK adapter", async () => {
    const { createTaskSessionCoordinator } = await import(
      "../src/task-session-coordinator.js"
    );

    expect(() =>
      createTaskSessionCoordinator({
        baseUrl: "   ",
        modelId: "claude-sonnet-4-5",
        providerId: "anthropic",
      }),
    ).toThrow("Task session coordinator requires a non-empty baseUrl");

    expect(mockCreateOpenCodeSdkAdapter).not.toHaveBeenCalled();
  });

  it("uses the SDK adapter by default when one is not injected", async () => {
    const createSession = vi.fn().mockResolvedValue({
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      id: "session-1",
    });
    const getSessionState = vi.fn().mockResolvedValue("running");

    mockCreateOpenCodeSdkAdapter.mockReturnValue({
      createSession,
      getSessionState,
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

    const session = await coordinator.createSession({
      created_at: "2026-04-20T00:00:00.000Z",
      developer_model_id: "claude-sonnet-4-5",
      developer_provider_id: "anthropic",
      dependencies: [],
      done: false,
      git_origin_url: "https://github.com/example/repo.git",
      project_id: "00000000-0000-4000-8000-000000000001",
      pull_request_url: null,
      result: "",
      session_id: null,
      source_metadata: {},
      status: "processing",
      task_id: "task-1",
      task_spec: "Implement the OpenCode SDK coordinator.",
      title: "OpenCode SDK coordinator",
      updated_at: "2026-04-20T00:00:00.000Z",
      worktree_path: "/repo/.worktrees/task-1",
    });

    expect(session).toMatchObject({ sessionId: "session-1" });
    expect(session[Symbol.asyncDispose]).toEqual(expect.any(Function));

    expect(mockCreateOpenCodeSdkAdapter).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:54321",
      modelId: "claude-sonnet-4-5",
      providerId: "anthropic",
    });
    expect(createSession).toHaveBeenCalledOnce();

    await expect(
      coordinator.getSessionState("session-1", {
        created_at: "2026-04-20T00:00:00.000Z",
        dependencies: [],
        developer_model_id: "claude-sonnet-4-5",
        developer_provider_id: "anthropic",
        done: false,
        git_origin_url: "https://github.com/example/repo.git",
        project_id: "00000000-0000-4000-8000-000000000001",
        pull_request_url: null,
        result: "",
        session_id: null,
        source_metadata: {},
        status: "processing",
        task_id: "task-1",
        task_spec: "Implement the OpenCode SDK coordinator.",
        title: "OpenCode SDK coordinator",
        updated_at: "2026-04-20T00:00:00.000Z",
        worktree_path: "/repo/.worktrees/task-1",
      }),
    ).resolves.toBe("running");
    expect(getSessionState).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        project_id: "00000000-0000-4000-8000-000000000001",
      }),
    );
  });
});
