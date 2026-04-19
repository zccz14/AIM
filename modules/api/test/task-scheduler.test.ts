import type { Task } from "@aim-ai/contract";
import { describe, expect, it, vi } from "vitest";

import { buildContinuePrompt } from "../src/task-continue-prompt.js";
import { createTaskScheduler } from "../src/task-scheduler.js";

const createTask = (overrides: Partial<Task> = {}): Task => ({
  created_at: "2026-04-20T00:00:00.000Z",
  dependencies: [],
  done: false,
  pull_request_url: null,
  session_id: null,
  status: "created",
  task_id: "task-1",
  task_spec: "Continue implementing the scheduler.",
  updated_at: "2026-04-20T00:00:00.000Z",
  worktree_path: null,
  ...overrides,
});

describe("task scheduler", () => {
  it("creates and binds a session for an unbound unfinished task, then continues if idle", async () => {
    const initialTask = createTask();
    const boundTask = createTask({ session_id: "session-1" });
    const repository = {
      assignSessionIfUnassigned: vi.fn().mockResolvedValue(boundTask),
      listUnfinishedTasks: vi.fn().mockResolvedValue([initialTask]),
    };
    const createSession = vi.fn().mockResolvedValue("session-1");
    const getSessionState = vi.fn().mockResolvedValue("idle");
    const sendContinuePrompt = vi.fn().mockResolvedValue(undefined);
    const scheduler = createTaskScheduler({
      createSession,
      getSessionState,
      sendContinuePrompt,
      taskRepository: repository,
    });

    await scheduler.runRound();

    expect(createSession).toHaveBeenCalledWith(initialTask);
    expect(repository.assignSessionIfUnassigned).toHaveBeenCalledWith(
      initialTask.task_id,
      "session-1",
    );
    expect(getSessionState).toHaveBeenCalledWith("session-1");
    expect(sendContinuePrompt).toHaveBeenCalledTimes(1);
    expect(sendContinuePrompt.mock.calls[0]?.[0]).toBe("session-1");
    expect(sendContinuePrompt.mock.calls[0]?.[1]).toContain(
      initialTask.task_id,
    );
  });

  it("skips a task whose bound session is running", async () => {
    const task = createTask({ session_id: "session-1" });
    const sendContinuePrompt = vi.fn();
    const repository = {
      assignSessionIfUnassigned: vi.fn(),
      listUnfinishedTasks: vi.fn().mockResolvedValue([task]),
    };
    const scheduler = createTaskScheduler({
      createSession: vi.fn(),
      getSessionState: vi.fn().mockResolvedValue("running"),
      sendContinuePrompt,
      taskRepository: repository,
    });

    await scheduler.runRound();

    expect(repository.assignSessionIfUnassigned).not.toHaveBeenCalled();
    expect(sendContinuePrompt).not.toHaveBeenCalled();
  });

  it("sends one continue prompt to an idle session", async () => {
    const task = createTask({ session_id: "session-1" });
    const sendContinuePrompt = vi.fn().mockResolvedValue(undefined);
    const scheduler = createTaskScheduler({
      createSession: vi.fn(),
      getSessionState: vi.fn().mockResolvedValue("idle"),
      sendContinuePrompt,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks: vi.fn().mockResolvedValue([task]),
      },
    });

    await scheduler.runRound();

    expect(sendContinuePrompt).toHaveBeenCalledTimes(1);
    expect(sendContinuePrompt).toHaveBeenCalledWith(
      "session-1",
      expect.stringContaining(task.task_spec),
    );
  });

  it("isolates per-task failures without aborting the round", async () => {
    const firstTask = createTask({
      task_id: "task-1",
      session_id: "session-1",
    });
    const secondTask = createTask({
      task_id: "task-2",
      session_id: "session-2",
    });
    const sendContinuePrompt = vi
      .fn()
      .mockRejectedValueOnce(new Error("session unavailable"))
      .mockResolvedValueOnce(undefined);
    const scheduler = createTaskScheduler({
      createSession: vi.fn(),
      getSessionState: vi.fn().mockResolvedValue("idle"),
      sendContinuePrompt,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks: vi.fn().mockResolvedValue([firstTask, secondTask]),
      },
    });

    await expect(scheduler.runRound()).resolves.toBeUndefined();
    expect(sendContinuePrompt).toHaveBeenCalledTimes(2);
  });

  it("refuses duplicate unfinished tasks that share one session_id", async () => {
    const firstTask = createTask({
      task_id: "task-1",
      session_id: "shared-session",
    });
    const secondTask = createTask({
      task_id: "task-2",
      session_id: "shared-session",
    });
    const getSessionState = vi.fn();
    const sendContinuePrompt = vi.fn();
    const scheduler = createTaskScheduler({
      createSession: vi.fn(),
      getSessionState,
      sendContinuePrompt,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks: vi.fn().mockResolvedValue([firstTask, secondTask]),
      },
    });

    await scheduler.runRound();

    expect(getSessionState).not.toHaveBeenCalled();
    expect(sendContinuePrompt).not.toHaveBeenCalled();
  });

  it("does not allow overlapping rounds after start", async () => {
    vi.useFakeTimers();
    const task = createTask({ session_id: "session-1" });
    let resolveList: (() => void) | undefined;
    const listUnfinishedTasks = vi.fn(
      () =>
        new Promise<Task[]>((resolve) => {
          resolveList = () => resolve([task]);
        }),
    );
    const scheduler = createTaskScheduler({
      createSession: vi.fn(),
      getSessionState: vi.fn().mockResolvedValue("running"),
      sendContinuePrompt: vi.fn(),
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks,
      },
    });

    scheduler.start({ intervalMs: 1_000 });
    scheduler.start({ intervalMs: 1_000 });
    await vi.advanceTimersByTimeAsync(2_000);

    expect(listUnfinishedTasks).toHaveBeenCalledTimes(1);

    resolveList?.();
    await Promise.resolve();
    await Promise.resolve();
    scheduler.stop();
    vi.useRealTimers();
  });

  it("continue prompt contains task_id, task_spec, status and avoids database implementation details", () => {
    const prompt = buildContinuePrompt(
      createTask({
        pull_request_url: "https://example.test/pr/123",
        session_id: "session-1",
        status: "running",
        worktree_path: "/repo/.worktrees/task-1",
      }),
    );

    expect(prompt).toContain("task_id: task-1");
    expect(prompt).toContain("task_spec: Continue implementing the scheduler.");
    expect(prompt).toContain("status: running");
    expect(prompt).toContain("worktree_path: /repo/.worktrees/task-1");
    expect(prompt).toContain("pull_request_url: https://example.test/pr/123");
    expect(prompt).not.toMatch(/aim\.sqlite/i);
    expect(prompt).not.toMatch(/\bSELECT\b/i);
    expect(prompt).not.toMatch(/\bUPDATE tasks\b/i);
  });
});
