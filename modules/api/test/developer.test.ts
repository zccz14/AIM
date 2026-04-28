import type { Task } from "@aim-ai/contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDeveloper } from "../src/developer.js";
import { buildTaskSessionPrompt } from "../src/task-continue-prompt.js";

const mockEnsureProjectWorkspace = vi.hoisted(() => vi.fn());

vi.mock("../src/project-workspace.js", () => ({
  ensureProjectWorkspace: mockEnsureProjectWorkspace,
}));

const createSessionHandle = (sessionId: string) => ({
  [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
  sessionId,
});

const createSessionManager = () => ({
  createSession: vi.fn().mockResolvedValue(createSessionHandle("session-1")),
});

const createTask = (overrides: Partial<Task> = {}): Task => ({
  created_at: "2026-04-20T00:00:00.000Z",
  dependencies: [],
  done: false,
  git_origin_url: `https://github.com/example/${overrides.task_id ?? "task-1"}.git`,
  global_model_id: "claude-sonnet-4-5",
  global_provider_id: "anthropic",
  project_id: "00000000-0000-4000-8000-000000000001",
  pull_request_url: null,
  session_id: null,
  source_metadata: {},
  status: "processing",
  task_id: "task-1",
  task_spec: "Implement the assigned task.",
  title: "Implement task",
  updated_at: "2026-04-20T00:00:00.000Z",
  worktree_path: null,
  ...overrides,
});

beforeEach(() => {
  mockEnsureProjectWorkspace.mockImplementation((task: Task) =>
    Promise.resolve(`/repo/.worktrees/${task.task_id}`),
  );
});

afterEach(() => {
  vi.useRealTimers();
  mockEnsureProjectWorkspace.mockReset();
});

describe("developer", () => {
  it("immediately scans and binds an unassigned unfinished task", async () => {
    vi.useFakeTimers();
    const initialTask = createTask();
    const boundTask = createTask({ session_id: "session-1" });
    const repository = {
      assignSessionIfUnassigned: vi.fn().mockResolvedValue(boundTask),
      listUnfinishedTasks: vi.fn().mockResolvedValue([initialTask]),
    };
    const sessionManager = createSessionManager();

    const developer = createDeveloper({
      sessionManager,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(repository.assignSessionIfUnassigned).toHaveBeenCalledWith(
        initialTask.task_id,
        "session-1",
      );
    });
    expect(mockEnsureProjectWorkspace).toHaveBeenCalledWith(initialTask);
    expect(sessionManager.createSession).toHaveBeenCalledWith({
      directory: `/repo/.worktrees/${initialTask.task_id}`,
      model: {
        modelID: initialTask.global_model_id,
        providerID: initialTask.global_provider_id,
      },
      prompt: buildTaskSessionPrompt(initialTask),
      title: `AIM Developer: ${initialTask.title}`,
    });

    await developer[Symbol.asyncDispose]();
  });

  it("does not create a session when active tasks are already assigned", async () => {
    vi.useFakeTimers();
    const repository = {
      assignSessionIfUnassigned: vi.fn(),
      listUnfinishedTasks: vi
        .fn()
        .mockResolvedValue([createTask({ session_id: "session-existing" })]),
    };
    const sessionManager = createSessionManager();

    const developer = createDeveloper({
      sessionManager,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(repository.listUnfinishedTasks).toHaveBeenCalledOnce();
    });
    expect(sessionManager.createSession).not.toHaveBeenCalled();
    expect(repository.assignSessionIfUnassigned).not.toHaveBeenCalled();
    expect("start" in developer).toBe(false);
    expect("stop" in developer).toBe(false);
    expect("scanOnce" in developer).toBe(false);

    await developer[Symbol.asyncDispose]();
  });

  it("disposing stops future heartbeats and releases active session handles", async () => {
    vi.useFakeTimers();
    const activeSession = createSessionHandle("session-1");
    const initialTask = createTask();
    const repository = {
      assignSessionIfUnassigned: vi
        .fn()
        .mockResolvedValue(createTask({ session_id: "session-1" })),
      listUnfinishedTasks: vi.fn().mockResolvedValue([initialTask]),
    };
    const sessionManager = createSessionManager();
    sessionManager.createSession.mockResolvedValue(activeSession);

    const developer = createDeveloper({
      sessionManager,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(repository.assignSessionIfUnassigned).toHaveBeenCalledOnce();
    });

    await developer[Symbol.asyncDispose]();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(repository.listUnfinishedTasks).toHaveBeenCalledOnce();
    expect(activeSession[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("releases a created session when atomic assignment loses the race", async () => {
    vi.useFakeTimers();
    const lostRaceSession = createSessionHandle("new-session");
    const repository = {
      assignSessionIfUnassigned: vi.fn().mockResolvedValue(
        createTask({
          session_id: "existing-session",
        }),
      ),
      listUnfinishedTasks: vi.fn().mockResolvedValue([createTask()]),
    };
    const sessionManager = createSessionManager();
    sessionManager.createSession.mockResolvedValue(lostRaceSession);

    const developer = createDeveloper({
      sessionManager,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(repository.assignSessionIfUnassigned).toHaveBeenCalledWith(
        "task-1",
        "new-session",
      );
    });

    expect(lostRaceSession[Symbol.asyncDispose]).toHaveBeenCalledOnce();

    await developer[Symbol.asyncDispose]();
  });
});
