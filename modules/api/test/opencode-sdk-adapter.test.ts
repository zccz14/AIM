import type { Task } from "@aim-ai/contract";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TaskSessionCoordinatorConfig } from "../src/task-session-coordinator.js";

const mockCreateOpencodeClient = vi.fn();

vi.mock("@opencode-ai/sdk", () => ({
  createOpencodeClient: mockCreateOpencodeClient,
}));

const createTask = (overrides: Partial<Task> = {}): Task => ({
  created_at: "2026-04-20T00:00:00.000Z",
  dependencies: [],
  done: false,
  project_path: "/repo",
  pull_request_url: null,
  session_id: null,
  status: "created",
  task_id: "task-1",
  task_spec: "Implement the OpenCode SDK coordinator.",
  updated_at: "2026-04-20T00:00:00.000Z",
  worktree_path: "/repo/.worktrees/task-1",
  ...overrides,
});

const config: TaskSessionCoordinatorConfig = {
  baseUrl: "http://127.0.0.1:54321",
  modelId: "claude-sonnet-4-5",
  providerId: "anthropic",
};

describe("opencode sdk adapter", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("creates a session and sends the initial task prompt through the SDK", async () => {
    const create = vi.fn().mockResolvedValue({ data: { id: "session-1" } });
    const promptAsync = vi.fn().mockResolvedValue({});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create,
        promptAsync,
        status: vi.fn(),
      },
    });

    const { createOpenCodeSdkAdapter } = await import(
      "../src/opencode-sdk-adapter.js"
    );
    const adapter = createOpenCodeSdkAdapter(config);

    await expect(adapter.createSession(createTask())).resolves.toEqual({
      id: "session-1",
    });
    expect(mockCreateOpencodeClient).toHaveBeenCalledWith({
      baseUrl: config.baseUrl,
    });
    expect(create).toHaveBeenCalledWith({
      query: {
        directory: "/repo",
      },
      throwOnError: true,
    });
    expect(promptAsync).toHaveBeenCalledWith({
      body: {
        model: {
          modelID: "claude-sonnet-4-5",
          providerID: "anthropic",
        },
        parts: [
          {
            text: expect.stringContaining(
              "task_spec: Implement the OpenCode SDK coordinator.",
            ),
            type: "text",
          },
        ],
      },
      path: { id: "session-1" },
      throwOnError: true,
    });
    expect(promptAsync.mock.calls[0]?.[0]?.body.parts[0]?.text).toContain(
      "project_path: /repo",
    );
    expect(promptAsync.mock.calls[0]?.[0]?.body.parts[0]?.text).toContain(
      "worktree_path: /repo/.worktrees/task-1",
    );
  });

  it("reads the raw session status for the requested session", async () => {
    const status = vi.fn().mockResolvedValue({
      data: {
        "session-1": { type: "busy" },
      },
    });

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
        promptAsync: vi.fn(),
        status,
      },
    });

    const { createOpenCodeSdkAdapter } = await import(
      "../src/opencode-sdk-adapter.js"
    );
    const adapter = createOpenCodeSdkAdapter(config);

    await expect(adapter.getSession("session-1")).resolves.toEqual({
      type: "busy",
    });
    expect(status).toHaveBeenCalledWith({
      throwOnError: true,
    });
  });

  it("sends continue prompts through the SDK without extra behavior", async () => {
    const promptAsync = vi.fn().mockResolvedValue({});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
        promptAsync,
        status: vi.fn(),
      },
    });

    const { createOpenCodeSdkAdapter } = await import(
      "../src/opencode-sdk-adapter.js"
    );
    const adapter = createOpenCodeSdkAdapter(config);

    await expect(
      adapter.sendPrompt("session-1", "Continue implementing task 2"),
    ).resolves.toBeUndefined();
    expect(promptAsync).toHaveBeenCalledWith({
      body: {
        model: {
          modelID: "claude-sonnet-4-5",
          providerID: "anthropic",
        },
        parts: [
          {
            text: "Continue implementing task 2",
            type: "text",
          },
        ],
      },
      path: { id: "session-1" },
      throwOnError: true,
    });
  });
});
