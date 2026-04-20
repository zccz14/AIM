import { readFileSync } from "node:fs";
import type { Task } from "@aim-ai/contract";
import { describe, expect, it, vi } from "vitest";

import { buildContinuePrompt } from "../src/task-continue-prompt.js";
import { createTaskScheduler } from "../src/task-scheduler.js";

const createCoordinator = () => ({
  createSession: vi.fn().mockResolvedValue({ sessionId: "session-1" }),
  getSessionState: vi.fn().mockResolvedValue("idle"),
  sendContinuePrompt: vi.fn().mockResolvedValue(undefined),
});

const createTask = (overrides: Partial<Task> = {}): Task => ({
  created_at: "2026-04-20T00:00:00.000Z",
  dependencies: [],
  done: false,
  project_path: "/repo",
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
    const coordinator = createCoordinator();
    const scheduler = createTaskScheduler({
      coordinator,
      taskRepository: repository,
    });

    await scheduler.runRound();

    expect(coordinator.createSession).toHaveBeenCalledWith(initialTask);
    expect(repository.assignSessionIfUnassigned).toHaveBeenCalledWith(
      initialTask.task_id,
      "session-1",
    );
    expect(coordinator.getSessionState).toHaveBeenCalledWith(
      "session-1",
      initialTask.project_path,
    );
    expect(coordinator.sendContinuePrompt).toHaveBeenCalledTimes(1);
    expect(coordinator.sendContinuePrompt.mock.calls[0]?.[0]).toBe("session-1");
    expect(coordinator.sendContinuePrompt.mock.calls[0]?.[1]).toContain(
      initialTask.task_id,
    );
  });

  it("skips a task whose bound session is running", async () => {
    const task = createTask({ session_id: "session-1" });
    const repository = {
      assignSessionIfUnassigned: vi.fn(),
      listUnfinishedTasks: vi.fn().mockResolvedValue([task]),
    };
    const coordinator = createCoordinator();
    coordinator.getSessionState.mockResolvedValue("running");
    const scheduler = createTaskScheduler({
      coordinator,
      taskRepository: repository,
    });

    await scheduler.runRound();

    expect(repository.assignSessionIfUnassigned).not.toHaveBeenCalled();
    expect(coordinator.sendContinuePrompt).not.toHaveBeenCalled();
  });

  it("sends one continue prompt to an idle session", async () => {
    const task = createTask({ session_id: "session-1" });
    const coordinator = createCoordinator();
    const scheduler = createTaskScheduler({
      coordinator,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks: vi.fn().mockResolvedValue([task]),
      },
    });

    await scheduler.runRound();

    expect(coordinator.sendContinuePrompt).toHaveBeenCalledTimes(1);
    expect(coordinator.sendContinuePrompt).toHaveBeenCalledWith(
      "session-1",
      expect.stringContaining(task.task_spec),
    );
  });

  it("does not send continue prompts across rounds while session state stays running", async () => {
    const task = createTask({ session_id: "session-1" });
    const coordinator = createCoordinator();
    coordinator.getSessionState.mockResolvedValue("running");
    const scheduler = createTaskScheduler({
      coordinator,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks: vi.fn().mockResolvedValue([task]),
      },
    });

    await scheduler.runRound();
    await scheduler.runRound();

    expect(coordinator.getSessionState).toHaveBeenCalledTimes(2);
    expect(coordinator.sendContinuePrompt).not.toHaveBeenCalled();
  });

  it("sends only one continue prompt after state changes from running to idle", async () => {
    const task = createTask({ session_id: "session-1" });
    const coordinator = createCoordinator();
    coordinator.getSessionState
      .mockResolvedValueOnce("running")
      .mockResolvedValueOnce("idle");
    const scheduler = createTaskScheduler({
      coordinator,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks: vi.fn().mockResolvedValue([task]),
      },
    });

    await scheduler.runRound();
    await scheduler.runRound();

    expect(coordinator.getSessionState).toHaveBeenCalledTimes(2);
    expect(coordinator.sendContinuePrompt).toHaveBeenCalledTimes(1);
    expect(coordinator.sendContinuePrompt).toHaveBeenCalledWith(
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
    const logger = {
      error: vi.fn(),
      warn: vi.fn(),
    };
    const coordinator = createCoordinator();
    coordinator.sendContinuePrompt = sendContinuePrompt;
    const scheduler = createTaskScheduler({
      coordinator,
      logger,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks: vi.fn().mockResolvedValue([firstTask, secondTask]),
      },
    });

    await expect(scheduler.runRound()).resolves.toBeUndefined();
    expect(sendContinuePrompt).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining(firstTask.task_id),
      expect.objectContaining({
        error: expect.any(Error),
        taskId: firstTask.task_id,
      }),
    );
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
    const logger = {
      error: vi.fn(),
      warn: vi.fn(),
    };
    const coordinator = createCoordinator();
    const scheduler = createTaskScheduler({
      coordinator,
      logger,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks: vi.fn().mockResolvedValue([firstTask, secondTask]),
      },
    });

    await scheduler.runRound();

    expect(coordinator.getSessionState).not.toHaveBeenCalled();
    expect(coordinator.sendContinuePrompt).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("shared-session"),
      expect.objectContaining({ sessionId: "shared-session" }),
    );
  });

  it("warns and skips when assignment returns a duplicate session snapshot", async () => {
    const firstTask = createTask({
      task_id: "task-1",
      session_id: "shared-session",
    });
    const secondTask = createTask({
      task_id: "task-2",
    });
    const latestSnapshot = createTask({
      task_id: "task-2",
      session_id: "shared-session",
    });
    const logger = {
      error: vi.fn(),
      warn: vi.fn(),
    };
    const coordinator = createCoordinator();
    coordinator.createSession.mockResolvedValue({ sessionId: "new-session" });
    const scheduler = createTaskScheduler({
      coordinator,
      logger,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn().mockResolvedValue(latestSnapshot),
        listUnfinishedTasks: vi.fn().mockResolvedValue([firstTask, secondTask]),
      },
    });

    await scheduler.runRound();

    expect(coordinator.getSessionState).toHaveBeenCalledTimes(1);
    expect(coordinator.getSessionState).toHaveBeenCalledWith(
      "shared-session",
      firstTask.project_path,
    );
    expect(coordinator.sendContinuePrompt).toHaveBeenCalledTimes(1);
    expect(coordinator.sendContinuePrompt).toHaveBeenCalledWith(
      "shared-session",
      expect.stringContaining(firstTask.task_id),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("shared-session"),
      expect.objectContaining({
        sessionId: "shared-session",
        taskId: secondTask.task_id,
      }),
    );
  });

  it("does not continue a task that finished before the assignment snapshot returned", async () => {
    const initialTask = createTask();
    const completedTask = createTask({
      done: true,
      session_id: "session-1",
      status: "succeeded",
    });
    const repository = {
      assignSessionIfUnassigned: vi.fn().mockResolvedValue(completedTask),
      listUnfinishedTasks: vi.fn().mockResolvedValue([initialTask]),
    };
    const coordinator = createCoordinator();
    const scheduler = createTaskScheduler({
      coordinator,
      taskRepository: repository,
    });

    await scheduler.runRound();

    expect(coordinator.getSessionState).not.toHaveBeenCalled();
    expect(coordinator.sendContinuePrompt).not.toHaveBeenCalled();
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
    const coordinator = createCoordinator();
    coordinator.getSessionState.mockResolvedValue("running");
    const scheduler = createTaskScheduler({
      coordinator,
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

  it("starts polling immediately and stops cleanly without scheduling more rounds", async () => {
    vi.useFakeTimers();
    const task = createTask({ session_id: "session-1" });
    let resolveList: (() => void) | undefined;
    const listUnfinishedTasks = vi.fn(
      () =>
        new Promise<Task[]>((resolve) => {
          resolveList = () => resolve([task]);
        }),
    );
    const coordinator = createCoordinator();
    coordinator.getSessionState.mockResolvedValue("running");
    const scheduler = createTaskScheduler({
      coordinator,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks,
      },
    });

    scheduler.start({ intervalMs: 1_000 });

    expect(listUnfinishedTasks).toHaveBeenCalledTimes(1);

    const stopPromise = scheduler.stop();
    resolveList?.();
    await stopPromise;
    await vi.advanceTimersByTimeAsync(5_000);

    expect(listUnfinishedTasks).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("logs and isolates round-level scan failures in the polling loop", async () => {
    vi.useFakeTimers();
    const logger = {
      error: vi.fn(),
      warn: vi.fn(),
    };
    const listUnfinishedTasks = vi
      .fn()
      .mockRejectedValueOnce(new Error("database offline"))
      .mockResolvedValueOnce([]);
    const scheduler = createTaskScheduler({
      coordinator: createCoordinator(),
      logger,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks,
      },
    });

    scheduler.start({ intervalMs: 1_000 });

    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        "Task scheduler failed while scanning unfinished tasks",
        expect.objectContaining({ error: expect.any(Error) }),
      );
    });

    await vi.advanceTimersByTimeAsync(1_000);

    expect(listUnfinishedTasks).toHaveBeenCalledTimes(2);
    scheduler.stop();
    vi.useRealTimers();
  });

  it("keeps scheduler startup disabled until explicitly enabled", () => {
    const serverSource = readFileSync(
      new URL("../src/server.ts", import.meta.url),
      "utf8",
    );

    expect(serverSource).toContain("TASK_SCHEDULER_ENABLED");
    expect(serverSource).toMatch(/if \(isTaskSchedulerEnabled\)/);
  });

  it("keeps OpenCode integration behind task-session-coordinator", () => {
    const schedulerSource = readFileSync(
      new URL("../src/task-scheduler.ts", import.meta.url),
      "utf8",
    );
    const coordinatorSource = readFileSync(
      new URL("../src/task-session-coordinator.ts", import.meta.url),
      "utf8",
    );

    expect(schedulerSource).not.toMatch(/opencode/i);
    expect(schedulerSource).not.toMatch(/spawn\(/i);
    expect(schedulerSource).not.toMatch(/child_process/i);
    expect(coordinatorSource).toContain("createTaskSessionCoordinator");
  });

  it("continue prompt contains task metadata and terminal ownership without storage wording", () => {
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
    expect(prompt).toContain("If you cannot continue");
    expect(prompt).toContain("write the task's failure state");
    expect(prompt).toContain("When the task is complete");
    expect(prompt).toContain("write done=true");
    expect(prompt).not.toMatch(/aim\.sqlite/i);
    expect(prompt).not.toMatch(/\bdb\b/i);
    expect(prompt).not.toMatch(/database/i);
    expect(prompt).not.toMatch(/\bSELECT\b/i);
    expect(prompt).not.toMatch(/\bUPDATE tasks\b/i);
    expect(prompt).not.toMatch(/storage/i);
    expect(prompt).not.toMatch(/persist/i);
  });
});
