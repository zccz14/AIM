import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { Task } from "@aim-ai/contract";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildTaskSessionPrompt } from "../src/task-continue-prompt.js";
import { createTaskScheduler } from "../src/task-scheduler.js";

const createCoordinator = () => ({
  createSession: vi.fn().mockResolvedValue({ sessionId: "session-1" }),
  getSessionState: vi.fn().mockResolvedValue("idle"),
  sendContinuePrompt: vi.fn().mockResolvedValue(undefined),
});

const tempRoot = join(process.cwd(), ".tmp", "modules-api-task-scheduler");

const createTask = (overrides: Partial<Task> = {}): Task => ({
  created_at: "2026-04-20T00:00:00.000Z",
  developer_model_id: "claude-sonnet-4-5",
  developer_provider_id: "anthropic",
  dependencies: [],
  done: false,
  project_path: join(tempRoot, overrides.task_id ?? "task-1"),
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

afterEach(async () => {
  vi.useRealTimers();
  await rm(tempRoot, { force: true, recursive: true });
});

describe("task scheduler", () => {
  it("stops a sleeping scheduler loop when an await using scope exits", async () => {
    vi.useFakeTimers();
    const repository = {
      assignSessionIfUnassigned: vi.fn(),
      listUnfinishedTasks: vi.fn().mockResolvedValue([]),
    };
    const schedulerPromise = (async () => {
      await using scheduler = createTaskScheduler({
        coordinator: createCoordinator(),
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
      coordinator: createCoordinator(),
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
      coordinator,
      logger,
      taskRepository: repository,
    });

    await scheduler.scanOnce();

    expect(logger.info).toHaveBeenCalledWith({
      event: "task_session_bound",
      project_path: boundTask.project_path,
      session_id: "session-1",
      status: "processing",
      task_id: boundTask.task_id,
    });
  });

  it("logs task_session_continued only after continue prompt succeeds", async () => {
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
      coordinator,
      logger,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks: vi.fn().mockResolvedValue([task]),
      },
    });

    await scheduler.scanOnce();

    expect(logger.info).toHaveBeenCalledWith({
      event: "task_session_continued",
      project_path: task.project_path,
      session_id: "session-1",
      status: "processing",
      task_id: task.task_id,
    });
  });

  it("does not log task_session_bound when assignment does not return a bound snapshot", async () => {
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const coordinator = createCoordinator();
    const scheduler = createTaskScheduler({
      coordinator,
      logger,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn().mockResolvedValue(null),
        listUnfinishedTasks: vi.fn().mockResolvedValue([createTask()]),
      },
    });

    await scheduler.scanOnce();

    expect(coordinator.getSessionState).not.toHaveBeenCalled();
    expect(coordinator.sendContinuePrompt).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

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

    await scheduler.scanOnce();

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
    expect(coordinator.sendContinuePrompt.mock.calls[0]?.[2]).toMatchObject({
      developer_model_id: "claude-sonnet-4-5",
      developer_provider_id: "anthropic",
    });
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

    await scheduler.scanOnce();

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

    await scheduler.scanOnce();

    expect(coordinator.sendContinuePrompt).toHaveBeenCalledTimes(1);
    expect(coordinator.sendContinuePrompt).toHaveBeenCalledWith(
      "session-1",
      expect.stringContaining(
        `Read the task spec by GET /tasks/${task.task_id}/spec.`,
      ),
      task,
    );
    expect(coordinator.sendContinuePrompt.mock.calls[0]?.[0]).toBe("session-1");
    expect(coordinator.sendContinuePrompt.mock.calls[0]?.[1]).not.toContain(
      "task_spec_file:",
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

    await scheduler.scanOnce();
    await scheduler.scanOnce();

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

    await scheduler.scanOnce();
    await scheduler.scanOnce();

    expect(coordinator.getSessionState).toHaveBeenCalledTimes(2);
    expect(coordinator.sendContinuePrompt).toHaveBeenCalledTimes(1);
    expect(coordinator.sendContinuePrompt).toHaveBeenCalledWith(
      "session-1",
      expect.stringContaining(
        `Read the task spec by GET /tasks/${task.task_id}/spec.`,
      ),
      task,
    );
    expect(coordinator.sendContinuePrompt.mock.calls[0]?.[1]).not.toContain(
      "task_spec_file:",
    );
  });

  it("does not write a task spec markdown file before continuing an idle session even when worktree_path is set", async () => {
    const task = createTask({
      session_id: "session-1",
      task_id: "task-no-spec-file",
      worktree_path: "/repo/.worktrees/task-no-spec-file",
    });
    const coordinator = createCoordinator();
    const scheduler = createTaskScheduler({
      coordinator,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks: vi.fn().mockResolvedValue([task]),
      },
    });

    await scheduler.scanOnce();

    await expect(
      rm(join(task.project_path, ".aim"), {
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
    const sendContinuePrompt = vi
      .fn()
      .mockRejectedValueOnce(new Error("session unavailable"))
      .mockResolvedValueOnce(undefined);
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
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

    await expect(scheduler.scanOnce()).resolves.toBeUndefined();
    expect(sendContinuePrompt).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        taskId: firstTask.task_id,
      }),
      expect.stringContaining(firstTask.task_id),
    );
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith({
      event: "task_session_continued",
      project_path: secondTask.project_path,
      session_id: secondTask.session_id,
      status: secondTask.status,
      task_id: secondTask.task_id,
    });
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
    let releaseFirstSend: (() => void) | undefined;
    const coordinator = createCoordinator();
    coordinator.getSessionState.mockImplementation(async (sessionId) => {
      events.push(`state:${sessionId}`);
      return "idle";
    });
    coordinator.sendContinuePrompt.mockImplementation(async (sessionId) => {
      events.push(`send:start:${sessionId}`);

      if (sessionId === "session-1") {
        await new Promise<void>((resolve) => {
          releaseFirstSend = () => {
            events.push(`send:end:${sessionId}`);
            resolve();
          };
        });
        return;
      }

      events.push(`send:end:${sessionId}`);
    });
    const scheduler = createTaskScheduler({
      coordinator,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks: vi.fn().mockResolvedValue([firstTask, secondTask]),
      },
    });

    const scanPromise = scheduler.scanOnce();

    await vi.waitFor(() => {
      expect(events).toEqual(["state:session-1", "send:start:session-1"]);
    });

    releaseFirstSend?.();
    await scanPromise;

    expect(events).toEqual([
      "state:session-1",
      "send:start:session-1",
      "send:end:session-1",
      "state:session-2",
      "send:start:session-2",
      "send:end:session-2",
    ]);
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
    coordinator.createSession.mockImplementation(async (task) => {
      events.push(`create:${task.task_id}`);
      return { sessionId: `new-${task.task_id}` };
    });
    coordinator.getSessionState.mockImplementation(async (sessionId) => {
      events.push(`state:${sessionId}`);
      return "idle";
    });
    coordinator.sendContinuePrompt.mockImplementation(async (sessionId) => {
      events.push(`send:${sessionId}`);
    });
    const scheduler = createTaskScheduler({
      coordinator,
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
      "state:session-2",
      "send:session-2",
      "state:session-4",
      "send:session-4",
      "create:task-1",
      "assign:task-1",
      "create:task-3",
      "assign:task-3",
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
    coordinator.getSessionState.mockImplementation(async (sessionId) => {
      events.push(`state:${sessionId}`);
      return "running";
    });
    const scheduler = createTaskScheduler({
      coordinator,
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
      "state:session-2",
      "state:session-1",
      "assign:task-3",
      "assign:task-5",
      "assign:task-4",
      "assign:task-6",
    ]);
  });

  it("keeps an empty unfinished task pool as a no-op", async () => {
    const coordinator = createCoordinator();
    const scheduler = createTaskScheduler({
      coordinator,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks: vi.fn().mockResolvedValue([]),
      },
    });

    await scheduler.scanOnce();

    expect(coordinator.createSession).not.toHaveBeenCalled();
    expect(coordinator.getSessionState).not.toHaveBeenCalled();
    expect(coordinator.sendContinuePrompt).not.toHaveBeenCalled();
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
    coordinator.createSession.mockResolvedValue({ sessionId: "new-session" });
    const scheduler = createTaskScheduler({
      coordinator,
      logger,
      taskRepository: {
        assignSessionIfUnassigned: vi.fn().mockResolvedValue(latestSnapshot),
        listUnfinishedTasks: vi.fn().mockResolvedValue([initialTask]),
      },
    });

    await scheduler.scanOnce();

    expect(coordinator.getSessionState).toHaveBeenCalledWith(
      "existing-session",
      latestSnapshot.project_path,
    );
    expect(coordinator.sendContinuePrompt).toHaveBeenCalledWith(
      "existing-session",
      expect.stringContaining(latestSnapshot.task_id),
      latestSnapshot,
    );
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith({
      event: "task_session_continued",
      project_path: latestSnapshot.project_path,
      session_id: "existing-session",
      status: latestSnapshot.status,
      task_id: latestSnapshot.task_id,
    });
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
      coordinator,
      taskRepository: repository,
    });

    await scheduler.scanOnce();

    expect(coordinator.getSessionState).not.toHaveBeenCalled();
    expect(coordinator.sendContinuePrompt).not.toHaveBeenCalled();
  });

  it("starts with an immediate scan and repeated start calls stay idempotent", async () => {
    vi.useFakeTimers();
    const listUnfinishedTasks = vi.fn().mockResolvedValue([]);
    const scheduler = createTaskScheduler({
      coordinator: createCoordinator(),
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

    await scheduler.stop();
    vi.useRealTimers();
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
    await scheduler.stop();
    vi.useRealTimers();
  });

  it("waits for an in-flight scan to finish before stop resolves", async () => {
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

    let stopped = false;
    const stopPromise = scheduler.stop().then(() => {
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
      coordinator: createCoordinator(),
      taskRepository: {
        assignSessionIfUnassigned: vi.fn(),
        listUnfinishedTasks,
      },
    });

    scheduler.start({ intervalMs: 1_000 });

    expect(listUnfinishedTasks).toHaveBeenCalledTimes(1);

    await scheduler.stop();
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
        expect.objectContaining({ err: expect.any(Error) }),
        "Task scheduler failed while scanning unfinished tasks",
      );
    });

    await vi.advanceTimersByTimeAsync(1_000);

    expect(listUnfinishedTasks).toHaveBeenCalledTimes(2);
    expect(logger.info).not.toHaveBeenCalled();
    await scheduler.stop();
    vi.useRealTimers();
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
    expect(schedulerSource).not.toMatch(/node:fs/i);
    expect(schedulerSource).not.toMatch(/node:path/i);
    expect(schedulerSource).not.toMatch(/writeFile/i);
    expect(schedulerSource).not.toMatch(/mkdir/i);
    expect(schedulerSource).not.toMatch(/\.aim/i);
    expect(schedulerSource).not.toMatch(/task-specs/i);
    expect(schedulerSource).not.toContain("worktree_path");
    expect(coordinatorSource).toContain("createTaskSessionCoordinator");
  });

  it("continue prompt contains task metadata and API-based spec lookup instructions", () => {
    const prompt = buildTaskSessionPrompt(
      createTask({
        project_path: "/repo",
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
        project_path: "/repo",
        session_id: "session-1",
        worktree_path: "/repo/.worktrees/task-1",
      }),
    );

    expect(prompt).toContain("Read the task spec by GET /tasks/task-1/spec.");
    expect(prompt).not.toContain("task_spec:");
    expect(prompt).not.toContain("task_spec_file:");
  });
});
