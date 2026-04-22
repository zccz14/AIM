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

const createCompletedAssistantMessage = () => ({
  info: {
    cost: 0,
    finish: "stop",
    id: "assistant-1",
    mode: "build",
    modelID: "claude-sonnet-4-5",
    parentID: "user-1",
    path: { cwd: "/repo", root: "/repo" },
    providerID: "anthropic",
    role: "assistant",
    sessionID: "session-1",
    time: { created: 1_000, completed: 2_000 },
    tokens: {
      cache: { read: 0, write: 0 },
      input: 0,
      output: 0,
      reasoning: 0,
    },
  },
  parts: [
    {
      cost: 0,
      id: "part-1",
      messageID: "assistant-1",
      reason: "stop",
      sessionID: "session-1",
      tokens: {
        cache: { read: 0, write: 0 },
        input: 0,
        output: 0,
        reasoning: 0,
      },
      type: "step-finish",
    },
  ],
});

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
            text: expect.stringContaining("task_id: task-1"),
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
    expect(promptAsync.mock.calls[0]?.[0]?.body.parts[0]?.text).toContain(
      "Read the task spec by GET /tasks/task-1/spec.",
    );
    expect(promptAsync.mock.calls[0]?.[0]?.body.parts[0]?.text).toContain(
      "FOLLOW the aim-task-lifecycle SKILL and finish the task assigned to you by AIM Coordinator.",
    );
    expect(promptAsync.mock.calls[0]?.[0]?.body.parts[0]?.text).toContain(
      "DON'T ASK ME ANY QUESTIONS. Just Follow your Recommendations and Continue. I agree with all your actions.",
    );
    expect(promptAsync.mock.calls[0]?.[0]?.body.parts[0]?.text).not.toContain(
      "task_spec:",
    );
    expect(promptAsync.mock.calls[0]?.[0]?.body.parts[0]?.text).not.toContain(
      "task_spec_file:",
    );
  });

  it("reads session messages and returns idle for an explicitly completed assistant message", async () => {
    const messages = vi.fn().mockResolvedValue({
      data: [createCompletedAssistantMessage()],
    });

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
        messages,
        promptAsync: vi.fn(),
        status: vi.fn(),
      },
    });

    const { createOpenCodeSdkAdapter } = await import(
      "../src/opencode-sdk-adapter.js"
    );
    const adapter = createOpenCodeSdkAdapter(config);

    await expect(adapter.getSessionState("session-1", "/repo")).resolves.toBe(
      "idle",
    );
    expect(messages).toHaveBeenCalledWith({
      path: { id: "session-1" },
      query: {
        directory: "/repo",
      },
      throwOnError: true,
    });
  });

  it("returns running when message payload is ambiguous instead of exposing raw data", async () => {
    const messages = vi.fn().mockResolvedValue({
      data: [{ info: { role: "assistant" }, parts: [] }],
    });

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
        messages,
        promptAsync: vi.fn(),
        status: vi.fn(),
      },
    });

    const { createOpenCodeSdkAdapter } = await import(
      "../src/opencode-sdk-adapter.js"
    );
    const adapter = createOpenCodeSdkAdapter(config);

    await expect(adapter.getSessionState("session-1", "/repo")).resolves.toBe(
      "running",
    );
  });

  it("rethrows SDK message fetch failures", async () => {
    const sdkError = new Error("opencode unavailable");
    const messages = vi.fn().mockRejectedValue(sdkError);

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
        messages,
        promptAsync: vi.fn(),
        status: vi.fn(),
      },
    });

    const { createOpenCodeSdkAdapter } = await import(
      "../src/opencode-sdk-adapter.js"
    );
    const adapter = createOpenCodeSdkAdapter(config);

    await expect(adapter.getSessionState("session-1", "/repo")).rejects.toBe(
      sdkError,
    );
  });

  it("sends continue prompts through the SDK without extra behavior", async () => {
    const promptAsync = vi.fn().mockResolvedValue({});

    mockCreateOpencodeClient.mockReturnValue({
      session: {
        create: vi.fn(),
        messages: vi.fn(),
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
