import type { Task } from "@aim-ai/contract";
import { describe, expect, it, vi } from "vitest";

import {
  createTaskSessionCoordinator,
  type TaskSessionCoordinatorConfig,
} from "../src/task-session-coordinator.js";

const createTask = (overrides: Partial<Task> = {}): Task => ({
  created_at: "2026-04-20T00:00:00.000Z",
  developer_model_id: "claude-sonnet-4-5",
  developer_provider_id: "anthropic",
  dependencies: [],
  done: false,
  project_path: "/repo",
  pull_request_url: null,
  session_id: null,
  status: "created",
  task_id: "task-1",
  task_spec: "Implement the OpenCode SDK coordinator.",
  title: "Implement coordinator",
  updated_at: "2026-04-20T00:00:00.000Z",
  worktree_path: "/repo/.worktrees/task-1",
  ...overrides,
});

const config: TaskSessionCoordinatorConfig = {
  baseUrl: "http://127.0.0.1:54321",
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
      getSessionState: vi.fn(),
      sendPrompt: vi.fn(),
    });

    await expect(coordinator.createSession(createTask())).resolves.toEqual({
      sessionId: "session-1",
    });
  });

  it("passes the selected developer provider and model from the task to the adapter", async () => {
    const createSession = vi.fn().mockResolvedValue({ id: "session-1" });
    const coordinator = createTaskSessionCoordinator(config, {
      createSession,
      getSessionState: vi.fn(),
      sendPrompt: vi.fn(),
    });

    await coordinator.createSession(
      createTask({
        developer_model_id: "gpt-5.5",
        developer_provider_id: "openai",
      }),
    );

    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        developer_model_id: "gpt-5.5",
        developer_provider_id: "openai",
      }),
    );
  });

  it("wraps adapter createSession failures with coordinator context", async () => {
    const adapterError = new Error("adapter blew up");
    const coordinator = createTaskSessionCoordinator(config, {
      createSession: vi.fn().mockRejectedValue(adapterError),
      getSessionState: vi.fn(),
      sendPrompt: vi.fn(),
    });

    await expect(coordinator.createSession(createTask())).rejects.toMatchObject(
      {
        cause: adapterError,
        message: "Task session coordinator failed during createSession",
      },
    );
  });

  it("wraps synchronous createSession throws with coordinator context", async () => {
    const adapterError = new Error("sync adapter blew up");
    const coordinator = createTaskSessionCoordinator(config, {
      createSession: vi.fn(() => {
        throw adapterError;
      }),
      getSessionState: vi.fn(),
      sendPrompt: vi.fn(),
    });

    await expect(coordinator.createSession(createTask())).rejects.toMatchObject(
      {
        cause: adapterError,
        message: "Task session coordinator failed during createSession",
      },
    );
  });

  it("passes through idle session state from the adapter", async () => {
    const coordinator = createTaskSessionCoordinator(config, {
      createSession: vi.fn(),
      getSessionState: vi.fn().mockResolvedValue("idle"),
      sendPrompt: vi.fn(),
    });

    await expect(
      coordinator.getSessionState("session-1", "/repo"),
    ).resolves.toBe("idle");
  });

  it("passes through running session state from the adapter", async () => {
    const coordinator = createTaskSessionCoordinator(config, {
      createSession: vi.fn(),
      getSessionState: vi.fn().mockResolvedValue("running"),
      sendPrompt: vi.fn(),
    });

    await expect(
      coordinator.getSessionState("session-1", "/repo"),
    ).resolves.toBe("running");
  });

  it("wraps adapter getSessionState failures with coordinator context", async () => {
    const adapterError = new Error("adapter blew up");
    const coordinator = createTaskSessionCoordinator(config, {
      createSession: vi.fn(),
      getSessionState: vi.fn().mockRejectedValue(adapterError),
      sendPrompt: vi.fn(),
    });

    await expect(
      coordinator.getSessionState("session-1", "/repo"),
    ).rejects.toMatchObject({
      cause: adapterError,
      message: "Task session coordinator failed during getSessionState",
    });
  });

  it("wraps synchronous getSessionState throws with coordinator context", async () => {
    const adapterError = new Error("sync adapter blew up");
    const coordinator = createTaskSessionCoordinator(config, {
      createSession: vi.fn(),
      getSessionState: vi.fn(() => {
        throw adapterError;
      }),
      sendPrompt: vi.fn(),
    });

    await expect(
      coordinator.getSessionState("session-1", "/repo"),
    ).rejects.toMatchObject({
      cause: adapterError,
      message: "Task session coordinator failed during getSessionState",
    });
  });
  it("delegates continue prompts and resolves without a payload", async () => {
    const sendPrompt = vi.fn().mockResolvedValue({ ok: true });
    const coordinator = createTaskSessionCoordinator(config, {
      createSession: vi.fn(),
      getSessionState: vi.fn(),
      sendPrompt,
    });

    await expect(
      coordinator.sendContinuePrompt(
        "session-1",
        "Continue implementing task 2",
        createTask(),
      ),
    ).resolves.toBeUndefined();
    expect(sendPrompt).toHaveBeenCalledWith(
      "session-1",
      "Continue implementing task 2",
      expect.objectContaining({ task_id: "task-1" }),
    );
  });

  it("wraps adapter sendContinuePrompt failures with coordinator context", async () => {
    const adapterError = new Error("adapter blew up");
    const coordinator = createTaskSessionCoordinator(config, {
      createSession: vi.fn(),
      getSessionState: vi.fn(),
      sendPrompt: vi.fn().mockRejectedValue(adapterError),
    });

    await expect(
      coordinator.sendContinuePrompt(
        "session-1",
        "Continue implementing task 2",
        createTask(),
      ),
    ).rejects.toMatchObject({
      cause: adapterError,
      message: "Task session coordinator failed during sendContinuePrompt",
    });
  });

  it("wraps synchronous sendPrompt throws with coordinator context", async () => {
    const adapterError = new Error("sync adapter blew up");
    const coordinator = createTaskSessionCoordinator(config, {
      createSession: vi.fn(),
      getSessionState: vi.fn(),
      sendPrompt: vi.fn(() => {
        throw adapterError;
      }),
    });

    await expect(
      coordinator.sendContinuePrompt(
        "session-1",
        "Continue implementing task 2",
        createTask(),
      ),
    ).rejects.toMatchObject({
      cause: adapterError,
      message: "Task session coordinator failed during sendContinuePrompt",
    });
  });
});
