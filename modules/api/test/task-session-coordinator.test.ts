import type { Task } from "@aim-ai/contract";
import { describe, expect, it, vi } from "vitest";

import {
  createTaskSessionCoordinator,
  type TaskSessionCoordinatorConfig,
} from "../src/task-session-coordinator.js";

const createAdapterSession = (id = "session-1") => ({
  [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
  id,
});

const createTask = (overrides: Partial<Task> = {}): Task => ({
  created_at: "2026-04-20T00:00:00.000Z",
  developer_model_id: "claude-sonnet-4-5",
  developer_provider_id: "anthropic",
  dependencies: [],
  done: false,
  git_origin_url: "https://github.com/example/repo.git",
  project_id: "00000000-0000-4000-8000-000000000001",
  pull_request_url: null,
  session_id: null,
  status: "processing",
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

  it("returns a disposable session with the injected session id", async () => {
    const coordinator = createTaskSessionCoordinator(config, {
      createSession: vi.fn().mockResolvedValue(createAdapterSession()),
    });

    const session = await coordinator.createSession(createTask());

    expect(session).toMatchObject({ sessionId: "session-1" });
    expect(session[Symbol.asyncDispose]).toEqual(expect.any(Function));
  });

  it("releases the adapter session when the returned coordinator session is disposed", async () => {
    const adapterSession = createAdapterSession();
    const coordinator = createTaskSessionCoordinator(config, {
      createSession: vi.fn().mockResolvedValue(adapterSession),
    });

    const session = await coordinator.createSession(createTask());
    await session[Symbol.asyncDispose]();

    expect(adapterSession[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("passes the selected developer provider and model from the task to the adapter", async () => {
    const createSession = vi.fn().mockResolvedValue(createAdapterSession());
    const coordinator = createTaskSessionCoordinator(config, {
      createSession,
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
    });

    await expect(coordinator.createSession(createTask())).rejects.toMatchObject(
      {
        cause: adapterError,
        message: "Task session coordinator failed during createSession",
      },
    );
  });
});
