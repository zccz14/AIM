import type { Task } from "@aim-ai/contract";
import { describe, expect, it, vi } from "vitest";

import {
  createTaskSessionCoordinator,
  type TaskSessionCoordinatorConfig,
} from "../src/task-session-coordinator.js";

const createTask = (overrides: Partial<Task> = {}): Task => ({
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
  ...overrides,
});

const config: TaskSessionCoordinatorConfig = {
  baseUrl: "http://127.0.0.1:54321",
  modelId: "claude-sonnet-4-5",
  providerId: "anthropic",
};

describe("task session coordinator", () => {
  it("fails fast when baseUrl is blank", () => {
    expect(() =>
      createTaskSessionCoordinator({
        ...config,
        baseUrl: "   ",
      }),
    ).toThrow("Task session coordinator requires a non-empty baseUrl");
  });

  it("returns only the injected session id shape", async () => {
    const coordinator = createTaskSessionCoordinator(config, {
      createSession: vi.fn().mockResolvedValue({ id: "session-1" }),
      getSession: vi.fn(),
      sendPrompt: vi.fn(),
    });

    await expect(coordinator.createSession(createTask())).resolves.toEqual({
      sessionId: "session-1",
    });
  });

  it("preserves unavailable createSession errors without an adapter", async () => {
    const coordinator = createTaskSessionCoordinator(config);

    await expect(coordinator.createSession(createTask())).rejects.toThrow(
      "Task session coordinator is unavailable for createSession",
    );
  });

  it("wraps adapter createSession failures with coordinator context", async () => {
    const adapterError = new Error("adapter blew up");
    const coordinator = createTaskSessionCoordinator(config, {
      createSession: vi.fn().mockRejectedValue(adapterError),
      getSession: vi.fn(),
      sendPrompt: vi.fn(),
    });

    await expect(coordinator.createSession(createTask())).rejects.toMatchObject({
      cause: adapterError,
      message: "Task session coordinator failed during createSession",
    });
  });

  it("wraps synchronous createSession throws with coordinator context", async () => {
    const adapterError = new Error("sync adapter blew up");
    const coordinator = createTaskSessionCoordinator(config, {
      createSession: vi.fn(() => {
        throw adapterError;
      }),
      getSession: vi.fn(),
      sendPrompt: vi.fn(),
    });

    await expect(coordinator.createSession(createTask())).rejects.toMatchObject({
      cause: adapterError,
      message: "Task session coordinator failed during createSession",
    });
  });

  it("delegates continue prompts and resolves without a payload", async () => {
    const sendPrompt = vi.fn().mockResolvedValue({ ok: true });
    const coordinator = createTaskSessionCoordinator(config, {
      createSession: vi.fn(),
      getSession: vi.fn(),
      sendPrompt,
    });

    await expect(
      coordinator.sendContinuePrompt("session-1", "Continue implementing task 2"),
    ).resolves.toBeUndefined();
    expect(sendPrompt).toHaveBeenCalledWith(
      "session-1",
      "Continue implementing task 2",
    );
  });

  it("preserves unavailable sendContinuePrompt errors without an adapter", async () => {
    const coordinator = createTaskSessionCoordinator(config);

    await expect(
      coordinator.sendContinuePrompt("session-1", "Continue implementing task 2"),
    ).rejects.toThrow(
      "Task session coordinator is unavailable for sendContinuePrompt",
    );
  });

  it("wraps adapter sendContinuePrompt failures with coordinator context", async () => {
    const adapterError = new Error("adapter blew up");
    const coordinator = createTaskSessionCoordinator(config, {
      createSession: vi.fn(),
      getSession: vi.fn(),
      sendPrompt: vi.fn().mockRejectedValue(adapterError),
    });

    await expect(
      coordinator.sendContinuePrompt("session-1", "Continue implementing task 2"),
    ).rejects.toMatchObject({
      cause: adapterError,
      message: "Task session coordinator failed during sendContinuePrompt",
    });
  });

  it("wraps synchronous sendPrompt throws with coordinator context", async () => {
    const adapterError = new Error("sync adapter blew up");
    const coordinator = createTaskSessionCoordinator(config, {
      createSession: vi.fn(),
      getSession: vi.fn(),
      sendPrompt: vi.fn(() => {
        throw adapterError;
      }),
    });

    await expect(
      coordinator.sendContinuePrompt("session-1", "Continue implementing task 2"),
    ).rejects.toMatchObject({
      cause: adapterError,
      message: "Task session coordinator failed during sendContinuePrompt",
    });
  });
});
