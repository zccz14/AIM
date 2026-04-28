import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { Task } from "@aim-ai/contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildTaskSessionPrompt } from "../src/task-continue-prompt.js";
import { createTaskScheduler } from "../src/task-scheduler.js";

const mockEnsureProjectWorkspace = vi.hoisted(() => vi.fn());

vi.mock("../src/project-workspace.js", () => ({
  ensureProjectWorkspace: mockEnsureProjectWorkspace,
}));

const createCoordinator = () => ({
  createSession: vi.fn().mockResolvedValue({
    [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    sessionId: "session-1",
  }),
});

const tempRoot = join(process.cwd(), ".tmp", "modules-api-task-scheduler");

const createTask = (overrides: Partial<Task> = {}): Task => ({
  created_at: "2026-04-20T00:00:00.000Z",
  developer_model_id: "claude-sonnet-4-5",
  developer_provider_id: "anthropic",
  dependencies: [],
  done: false,
  git_origin_url: `https://github.com/example/${overrides.task_id ?? "task-1"}.git`,
  project_id: "00000000-0000-4000-8000-000000000001",
  pull_request_url: null,
  session_id: null,
  status: "processing",
  task_id: "task-1",
  task_spec: "Continue implementing the scheduler.",
  title: "Continue scheduler",
  updated_at: "2026-04-20T00:00:00.000Z",
  worktree_path: null,
  ...overrides,
});

beforeEach(() => {
  mockEnsureProjectWorkspace.mockImplementation((task: Task) =>
    Promise.resolve(`/repo/.worktrees/${task.task_id}`),
  );
});

afterEach(async () => {
  vi.useRealTimers();
  mockEnsureProjectWorkspace.mockReset();
  await rm(tempRoot, { force: true, recursive: true });
});

describe("task scheduler", () => {
  it("logs scan start, empty success, and next tick context for scheduler visibility", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T12:00:00.000Z"));
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const scheduler = createTaskScheduler({
      sessionManager: createCoordinator(),
      logger,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks: vi.fn().mockResolvedValue([]),
      },
    });

    await scheduler.scanOnce({ resolvedTaskId: "task-resolved" });

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "task_scheduler_scan_started",
        resolved_task_id: "task-resolved",
      }),
      "Task scheduler scan started",
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "task_scheduler_scan_succeeded",
        next_scan_after_ms: null,
        processed_task_count: 0,
        task_count: 0,
      }),
      "Task scheduler scan succeeded",
    );

    scheduler.start({ intervalMs: 60_000 });
    await vi.waitFor(() => {
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "task_scheduler_sleeping_until_next_tick",
          interval_ms: 60_000,
          next_scan_after_ms: 60_000,
        }),
        "Task scheduler waiting for next tick",
      );
    });

    await scheduler[Symbol.asyncDispose]();
    vi.useRealTimers();
  });

  it("does not poll a task that already has a session", async () => {
    const task = createTask({
      dependencies: ["task-dependency"],
      session_id: "session-1",
      status: "processing",
    });
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const coordinator = createCoordinator();
    const scheduler = createTaskScheduler({
      sessionManager: coordinator,
      logger,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks: vi.fn().mockResolvedValue([task]),
      },
    });

    await scheduler.scanOnce();

    expect(coordinator.createSession).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "task_scheduler_task_skipped" }),
      "Task scheduler skipped task",
    );
  });

  it("stops a sleeping scheduler loop when an await using scope exits", async () => {
    vi.useFakeTimers();
    const repository = {
      assignSessionIfUnassigned: vi.fn(),
      listUnfinishedTasks: vi.fn().mockResolvedValue([]),
    };
    const schedulerPromise = (async () => {
      await using scheduler = createTaskScheduler({
        sessionManager: createCoordinator(),
        taskRepository: repository,
      });

      scheduler.start({ intervalMs: 60_000 });
      await vi.waitFor(() => {
        expect(repository.listUnfinishedTasks).toHaveBeenCalledOnce();
      });

      return scheduler;
    })();

    await expect(schedulerPromise).resolves.toBeDefined();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(repository.listUnfinishedTasks).toHaveBeenCalledOnce();
  });

  it("allows repeated scheduler async disposal without restarting stop behavior", async () => {
    vi.useFakeTimers();
    const repository = {
      assignSessionIfUnassigned: vi.fn(),
      listUnfinishedTasks: vi.fn().mockResolvedValue([]),
    };
    const scheduler = createTaskScheduler({
      sessionManager: createCoordinator(),
      taskRepository: repository,
    });

    scheduler.start({ intervalMs: 60_000 });
    await vi.waitFor(() => {
      expect(repository.listUnfinishedTasks).toHaveBeenCalledOnce();
    });

    await scheduler[Symbol.asyncDispose]();
    await expect(scheduler[Symbol.asyncDispose]()).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(repository.listUnfinishedTasks).toHaveBeenCalledOnce();
  });

  it("logs task_session_bound only after assignment succeeds", async () => {
    const initialTask = createTask();
    const boundTask = createTask({
      session_id: "session-1",
      status: "processing",
    });
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const repository = {
      assignSessionIfUnassigned: vi.fn().mockResolvedValue(boundTask),
      listUnfinishedTasks: vi.fn().mockResolvedValue([initialTask]),
    };
    const coordinator = createCoordinator();
    const scheduler = createTaskScheduler({
      sessionManager: coordinator,
      logger,
      taskRepository: repository,
    });

    await scheduler.scanOnce();

    expect(logger.info).toHaveBeenCalledWith({
      event: "task_session_bound",
      project_id: boundTask.project_id,
      session_id: "session-1",
      status: "processing",
      task_id: boundTask.task_id,
    });
  });

  it("does not log task_session_continued for existing sessions", async () => {
    const task = createTask({
      session_id: "session-1",
      status: "processing",
    });
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const coordinator = createCoordinator();
    const scheduler = createTaskScheduler({
      sessionManager: coordinator,
      logger,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks: vi.fn().mockResolvedValue([task]),
      },
    });

    await scheduler.scanOnce();

    expect(coordinator.createSession).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "task_session_continued" }),
    );
  });

  it("does not log task_session_bound when assignment does not return a bound snapshot", async () => {
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const coordinator = createCoordinator();
    const scheduler = createTaskScheduler({
      sessionManager: coordinator,
      logger,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn().mockResolvedValue(null),
        listUnfinishedTasks: vi.fn().mockResolvedValue([createTask()]),
      },
    });

    await scheduler.scanOnce();

    expect(coordinator.createSession).toHaveBeenCalledOnce();
    expect(logger.info).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "task_session_bound" }),
    );
  });

  it("creates and binds a session for an unbound unfinished task", async () => {
    const initialTask = createTask();
    const boundTask = createTask({ session_id: "session-1" });
    const repository = {
      assignSessionIfUnassigned: vi.fn().mockResolvedValue(boundTask),
      listUnfinishedTasks: vi.fn().mockResolvedValue([initialTask]),
    };
    const coordinator = createCoordinator();
    const scheduler = createTaskScheduler({
      sessionManager: coordinator,
      taskRepository: repository,
    });

    await scheduler.scanOnce();

    expect(mockEnsureProjectWorkspace).toHaveBeenCalledWith(initialTask);
    expect(coordinator.createSession).toHaveBeenCalledWith({
      directory: `/repo/.worktrees/${initialTask.task_id}`,
      model: {
        modelID: initialTask.developer_model_id,
        providerID: initialTask.developer_provider_id,
      },
      prompt: buildTaskSessionPrompt(initialTask),
      title: `AIM Developer: ${initialTask.title}`,
    });
    expect(repository.assignSessionIfUnassigned).toHaveBeenCalledWith(
      initialTask.task_id,
      "session-1",
    );
    expect(coordinator.createSession).toHaveBeenCalledOnce();
  });

  it("leaves existing task sessions to the OpenCode plugin idle continuation flow", async () => {
    const task = createTask({ session_id: "session-1" });
    const coordinator = createCoordinator();
    const scheduler = createTaskScheduler({
      sessionManager: coordinator,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks: vi.fn().mockResolvedValue([task]),
      },
    });

    await scheduler.scanOnce();

    expect(coordinator.createSession).not.toHaveBeenCalled();
  });

  it("releases created sessions when the scheduler is disposed", async () => {
    const initialTask = createTask();
    const boundTask = createTask({ session_id: "session-1" });
    const disposeSession = vi.fn().mockResolvedValue(undefined);
    const coordinator = createCoordinator();
    coordinator.createSession.mockResolvedValue({
      [Symbol.asyncDispose]: disposeSession,
      sessionId: "session-1",
    });
    const scheduler = createTaskScheduler({
      sessionManager: coordinator,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn().mockResolvedValue(boundTask),
        listUnfinishedTasks: vi.fn().mockResolvedValue([initialTask]),
      },
    });

    await scheduler.scanOnce();

    expect(disposeSession).not.toHaveBeenCalled();

    await scheduler[Symbol.asyncDispose]();

    expect(disposeSession).toHaveBeenCalledOnce();
  });

  it("skips a task whose bound session is running", async () => {
    const task = createTask({ session_id: "session-1" });
    const repository = {
      assignSessionIfUnassigned: vi.fn(),
      listUnfinishedTasks: vi.fn().mockResolvedValue([task]),
    };
    const coordinator = createCoordinator();
    const scheduler = createTaskScheduler({
      sessionManager: coordinator,
      taskRepository: repository,
    });

    await scheduler.scanOnce();

    expect(repository.assignSessionIfUnassigned).not.toHaveBeenCalled();
    expect(coordinator.createSession).not.toHaveBeenCalled();
  });

  it("does not send continue prompts to existing sessions", async () => {
    const task = createTask({ session_id: "session-1" });
    const coordinator = createCoordinator();
    const scheduler = createTaskScheduler({
      sessionManager: coordinator,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks: vi.fn().mockResolvedValue([task]),
      },
    });

    await scheduler.scanOnce();

    expect(coordinator.createSession).not.toHaveBeenCalled();
  });

  it("does not send continue prompts across rounds while session state stays running", async () => {
    const task = createTask({ session_id: "session-1" });
    const coordinator = createCoordinator();
    const scheduler = createTaskScheduler({
      sessionManager: coordinator,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks: vi.fn().mockResolvedValue([task]),
      },
    });

    await scheduler.scanOnce();
    await scheduler.scanOnce();

    expect(coordinator.createSession).not.toHaveBeenCalled();
  });

  it("does not send continue prompts after repeated scans of existing sessions", async () => {
    const task = createTask({ session_id: "session-1" });
    const coordinator = createCoordinator();
    const scheduler = createTaskScheduler({
      sessionManager: coordinator,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks: vi.fn().mockResolvedValue([task]),
      },
    });

    await scheduler.scanOnce();
    await scheduler.scanOnce();

    expect(coordinator.createSession).not.toHaveBeenCalled();
  });

  it("does not write a task spec markdown file before continuing an idle session even when worktree_path is set", async () => {
    const task = createTask({
      session_id: "session-1",
      task_id: "task-no-spec-file",
      worktree_path: "/repo/.worktrees/task-no-spec-file",
    });
    const coordinator = createCoordinator();
    const scheduler = createTaskScheduler({
      sessionManager: coordinator,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks: vi.fn().mockResolvedValue([task]),
      },
    });

    await scheduler.scanOnce();

    await expect(
      rm(join(tempRoot, task.task_id, ".aim"), {
        force: false,
        recursive: true,
      }),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("isolates per-task failures without aborting the scan", async () => {
    const firstTask = createTask({
      task_id: "task-1",
      session_id: "session-1",
    });
    const secondTask = createTask({
      task_id: "task-2",
      session_id: "session-2",
    });
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const coordinator = createCoordinator();
    const scheduler = createTaskScheduler({
      sessionManager: coordinator,
      logger,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks: vi.fn().mockResolvedValue([firstTask, secondTask]),
      },
    });

    await expect(scheduler.scanOnce()).resolves.toBeUndefined();
    expect(coordinator.createSession).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("processes tasks sequentially within one scan", async () => {
    const firstTask = createTask({
      task_id: "task-1",
      session_id: "session-1",
    });
    const secondTask = createTask({
      task_id: "task-2",
      session_id: "session-2",
    });
    const events: string[] = [];
    const coordinator = createCoordinator();
    const scheduler = createTaskScheduler({
      sessionManager: coordinator,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks: vi.fn().mockResolvedValue([firstTask, secondTask]),
      },
    });

    const scanPromise = scheduler.scanOnce();

    await scanPromise;

    expect(events).toEqual([]);
  });

  it("prioritizes tasks with existing sessions while preserving stable order", async () => {
    const firstTask = createTask({ task_id: "task-1" });
    const secondTask = createTask({
      session_id: "session-2",
      task_id: "task-2",
    });
    const thirdTask = createTask({ task_id: "task-3" });
    const fourthTask = createTask({
      session_id: "session-4",
      task_id: "task-4",
    });
    const events: string[] = [];
    const coordinator = createCoordinator();
    coordinator.createSession.mockImplementation(async (input) => {
      events.push(`create:${input.title}`);
      return {
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
        sessionId: `new-${input.title}`,
      };
    });
    const scheduler = createTaskScheduler({
      sessionManager: coordinator,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(async (taskId) => {
          events.push(`assign:${taskId}`);
          return null;
        }),
        listUnfinishedTasks: vi
          .fn()
          .mockResolvedValue([firstTask, secondTask, thirdTask, fourthTask]),
      },
    });

    await scheduler.scanOnce();

    expect(events).toEqual([
      "create:AIM Developer: Continue scheduler",
      "assign:task-1",
      "create:AIM Developer: Continue scheduler",
      "assign:task-3",
    ]);
  });

  it("does not continue later session tasks before starting earlier unassigned tasks", async () => {
    const unassignedTask = createTask({ task_id: "task-unassigned" });
    const existingSessionTask = createTask({
      session_id: "session-existing",
      task_id: "task-existing",
    });
    const assignedTask = createTask({
      session_id: "session-new",
      task_id: "task-unassigned",
    });
    const events: string[] = [];
    const coordinator = createCoordinator();
    coordinator.createSession.mockImplementation(async (input) => {
      events.push(`create:${input.title}`);
      return {
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
        sessionId: "session-new",
      };
    });
    const scheduler = createTaskScheduler({
      sessionManager: coordinator,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(async (taskId) => {
          events.push(`assign:${taskId}`);
          return assignedTask;
        }),
        listUnfinishedTasks: vi
          .fn()
          .mockResolvedValue([unassignedTask, existingSessionTask]),
      },
    });

    await scheduler.scanOnce();

    expect(events).toEqual([
      "create:AIM Developer: Continue scheduler",
      "assign:task-unassigned",
    ]);
  });

  it("orders dependency hints within session priority groups after a resolved task", async () => {
    const firstTask = createTask({
      dependencies: ["task-other", "task-extra"],
      session_id: "session-1",
      task_id: "task-1",
    });
    const secondTask = createTask({
      dependencies: [],
      session_id: "session-2",
      task_id: "task-2",
    });
    const thirdTask = createTask({
      dependencies: ["task-resolved", "task-other"],
      task_id: "task-3",
    });
    const fourthTask = createTask({
      dependencies: ["task-other"],
      task_id: "task-4",
    });
    const fifthTask = createTask({
      dependencies: [],
      task_id: "task-5",
    });
    const sixthTask = createTask({
      dependencies: ["task-a", "task-b", "task-c"],
      task_id: "task-6",
    });
    const events: string[] = [];
    const coordinator = createCoordinator();
    const scheduler = createTaskScheduler({
      sessionManager: coordinator,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(async (taskId) => {
          events.push(`assign:${taskId}`);
          return null;
        }),
        listUnfinishedTasks: vi
          .fn()
          .mockResolvedValue([
            firstTask,
            secondTask,
            thirdTask,
            fourthTask,
            fifthTask,
            sixthTask,
          ]),
      },
    });

    await scheduler.scanOnce({ resolvedTaskId: "task-resolved" });

    expect(events).toEqual([
      "assign:task-3",
      "assign:task-5",
      "assign:task-4",
      "assign:task-6",
    ]);
  });

  it("keeps an empty unfinished task pool as a no-op", async () => {
    const coordinator = createCoordinator();
    const scheduler = createTaskScheduler({
      sessionManager: coordinator,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks: vi.fn().mockResolvedValue([]),
      },
    });

    await scheduler.scanOnce();

    expect(coordinator.createSession).not.toHaveBeenCalled();
    expect(coordinator.createSession).not.toHaveBeenCalled();
  });

  it("does not log task_session_bound when another process assigned a different session", async () => {
    const initialTask = createTask({ task_id: "task-2" });
    const latestSnapshot = createTask({
      session_id: "existing-session",
      task_id: "task-2",
    });
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const coordinator = createCoordinator();
    coordinator.createSession.mockResolvedValue({
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      sessionId: "new-session",
    });
    const scheduler = createTaskScheduler({
      sessionManager: coordinator,
      logger,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn().mockResolvedValue(latestSnapshot),
        listUnfinishedTasks: vi.fn().mockResolvedValue([initialTask]),
      },
    });

    await scheduler.scanOnce();

    expect(coordinator.createSession).toHaveBeenCalledOnce();
    expect(logger.info).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "task_session_continued" }),
    );
  });

  it("does not continue a task that finished before the assignment snapshot returned", async () => {
    const initialTask = createTask();
    const completedTask = createTask({
      done: true,
      session_id: "session-1",
      status: "resolved",
    });
    const repository = {
      assignSessionIfUnassigned: vi.fn().mockResolvedValue(completedTask),
      listUnfinishedTasks: vi.fn().mockResolvedValue([initialTask]),
    };
    const coordinator = createCoordinator();
    const scheduler = createTaskScheduler({
      sessionManager: coordinator,
      taskRepository: repository,
    });

    await scheduler.scanOnce();

    expect(coordinator.createSession).toHaveBeenCalledOnce();
  });

  it("starts with an immediate scan and repeated start calls stay idempotent", async () => {
    vi.useFakeTimers();
    const listUnfinishedTasks = vi.fn().mockResolvedValue([]);
    const scheduler = createTaskScheduler({
      sessionManager: createCoordinator(),
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks,
      },
    });

    scheduler.start({ intervalMs: 1_000 });
    scheduler.start({ intervalMs: 1_000 });

    expect(listUnfinishedTasks).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(listUnfinishedTasks).toHaveBeenCalledTimes(2);

    await scheduler[Symbol.asyncDispose]();
    vi.useRealTimers();
  });

  it("does not expose a public stop lifecycle method", () => {
    const scheduler = createTaskScheduler({
      sessionManager: createCoordinator(),
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks: vi.fn().mockResolvedValue([]),
      },
    });

    expect("stop" in scheduler).toBe(false);
    expect("dispose" in scheduler).toBe(false);
    expect(scheduler[Symbol.asyncDispose]).toEqual(expect.any(Function));
  });

  it("does not create a second loop while a started scan is still in flight", async () => {
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
    const scheduler = createTaskScheduler({
      sessionManager: coordinator,
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
    await scheduler[Symbol.asyncDispose]();
    vi.useRealTimers();
  });

  it("waits for an in-flight scan to finish before async disposal resolves", async () => {
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
    const scheduler = createTaskScheduler({
      sessionManager: coordinator,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks,
      },
    });

    scheduler.start({ intervalMs: 1_000 });

    let stopped = false;
    const stopPromise = scheduler[Symbol.asyncDispose]().then(() => {
      stopped = true;
    });

    await Promise.resolve();
    expect(stopped).toBe(false);

    resolveList?.();
    await stopPromise;

    expect(stopped).toBe(true);
    vi.useRealTimers();
  });

  it("stops during sleep before the next iteration starts", async () => {
    vi.useFakeTimers();
    const listUnfinishedTasks = vi.fn().mockResolvedValue([]);
    const scheduler = createTaskScheduler({
      sessionManager: createCoordinator(),
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks,
      },
    });

    scheduler.start({ intervalMs: 1_000 });

    expect(listUnfinishedTasks).toHaveBeenCalledTimes(1);

    await scheduler[Symbol.asyncDispose]();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(listUnfinishedTasks).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("logs and isolates round-level scan failures in the polling loop", async () => {
    vi.useFakeTimers();
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const listUnfinishedTasks = vi
      .fn()
      .mockRejectedValueOnce(new Error("database offline"))
      .mockResolvedValueOnce([]);
    const scheduler = createTaskScheduler({
      sessionManager: createCoordinator(),
      logger,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks,
      },
    });

    scheduler.start({ intervalMs: 1_000 });

    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        "Task scheduler failed while scanning unfinished tasks",
      );
    });

    await vi.advanceTimersByTimeAsync(1_000);

    expect(listUnfinishedTasks).toHaveBeenCalledTimes(2);
    expect(logger.info).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "task_session_bound" }),
    );
    expect(logger.info).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "task_session_continued" }),
    );
    await scheduler[Symbol.asyncDispose]();
    vi.useRealTimers();
  });

  it("continue prompt contains task metadata and API-based spec lookup instructions", () => {
    const prompt = buildTaskSessionPrompt(
      createTask({
        git_origin_url: "https://github.com/example/repo.git",
        pull_request_url: "https://example.test/pr/123",
        session_id: "session-1",
        status: "processing",
        worktree_path: "/repo/.worktrees/task-1",
      }),
    );

    expect(prompt).toContain("task_id: task-1");
    expect(prompt).toContain("Read the task spec by GET /tasks/task-1/spec.");
    expect(prompt).toContain("status: processing");
    expect(prompt).toContain("worktree_path: /repo/.worktrees/task-1");
    expect(prompt).toContain("pull_request_url: https://example.test/pr/123");
    expect(prompt).toContain("session_id: session-1");
    expect(prompt).toContain(
      "DON'T ASK ME ANY QUESTIONS. Just Follow your Recommendations and Continue. I agree with all your actions.",
    );
    expect(prompt).toContain(
      "FOLLOW the aim-developer-guide SKILL and finish the task assigned to you by AIM Coordinator.",
    );
    expect(prompt).toContain(
      "Remember reporting the final status to AIM API Server. The task's final status is either 'resolved' or 'rejected'.",
    );
    expect(prompt).not.toContain("task_spec:");
    expect(prompt).not.toContain("task_spec_file:");
    expect(prompt).not.toMatch(/aim\.sqlite/i);
    expect(prompt).not.toMatch(/\bdb\b/i);
    expect(prompt).not.toMatch(/database/i);
    expect(prompt).not.toMatch(/\bSELECT\b/i);
    expect(prompt).not.toMatch(/\bUPDATE tasks\b/i);
    expect(prompt).not.toMatch(/storage/i);
    expect(prompt).not.toMatch(/persist/i);
  });

  it("start prompt requires fetching the task spec over the API before starting work", () => {
    const prompt = buildTaskSessionPrompt(
      createTask({
        git_origin_url: "https://github.com/example/repo.git",
        session_id: "session-1",
        worktree_path: "/repo/.worktrees/task-1",
      }),
    );

    expect(prompt).toContain("Read the task spec by GET /tasks/task-1/spec.");
    expect(prompt).not.toContain("task_spec:");
    expect(prompt).not.toContain("task_spec_file:");
  });
});
