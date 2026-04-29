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

const baselineFacts = {
  commitSha: "a9979ba9487edf2d822e10ae7b651c98be3d175d",
  fetchedAt: "2026-04-28T17:13:03.000Z",
  summary: "Refactor optimizer system startup lifecycle (#258)",
};

const createBaselineRepository = () => ({
  getLatestBaselineFacts: vi.fn().mockResolvedValue(baselineFacts),
});

const unknownSourceBaselineFreshness: Task["source_baseline_freshness"] = {
  current_commit: null,
  source_commit: null,
  status: "unknown",
  summary: "not set",
};

const createTask = (overrides: Partial<Task> = {}): Task => ({
  created_at: "2026-04-20T00:00:00.000Z",
  dependencies: [],
  done: false,
  git_origin_url: `https://github.com/example/${overrides.task_id ?? "task-1"}.git`,
  global_model_id: "claude-sonnet-4-5",
  global_provider_id: "anthropic",
  project_id: "00000000-0000-4000-8000-000000000001",
  pull_request_url: null,
  result: "",
  session_id: null,
  source_baseline_freshness: unknownSourceBaselineFreshness,
  source_metadata: {},
  status: "pending",
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
    const initialTaskWithoutFreshness = {
      ...initialTask,
      source_baseline_freshness: undefined,
    } as unknown as Task;
    const boundTask = createTask({ session_id: "session-1" });
    const repository = {
      assignSessionIfUnassigned: vi.fn().mockResolvedValue(boundTask),
      listRejectedTasksByProject: vi.fn().mockResolvedValue([]),
      listUnfinishedTasks: vi
        .fn()
        .mockResolvedValue([initialTaskWithoutFreshness]),
    };
    const sessionManager = createSessionManager();
    const baselineRepository = createBaselineRepository();

    const developer = createDeveloper({
      baselineRepository,
      sessionManager,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(repository.assignSessionIfUnassigned).toHaveBeenCalledWith(
        initialTask.task_id,
        "session-1",
      );
    });
    expect(mockEnsureProjectWorkspace).toHaveBeenCalledWith(
      initialTaskWithoutFreshness,
    );
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
      listRejectedTasksByProject: vi.fn().mockResolvedValue([]),
      listUnfinishedTasks: vi
        .fn()
        .mockResolvedValue([createTask({ session_id: "session-existing" })]),
    };
    const sessionManager = createSessionManager();
    const baselineRepository = createBaselineRepository();

    const developer = createDeveloper({
      baselineRepository,
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

  it("skips an unassigned task while a dependency is not resolved", async () => {
    vi.useFakeTimers();
    const blockedTask = createTask({
      dependencies: ["dependency-pending"],
      task_id: "task-blocked",
    });
    const dependencyTask = createTask({
      status: "pending",
      task_id: "dependency-pending",
    });
    const repository = {
      assignSessionIfUnassigned: vi
        .fn()
        .mockResolvedValue(createTask({ session_id: "session-1" })),
      getTaskById: vi.fn().mockResolvedValue(dependencyTask),
      listRejectedTasksByProject: vi.fn().mockResolvedValue([]),
      listUnfinishedTasks: vi.fn().mockResolvedValue([blockedTask]),
    };
    const sessionManager = createSessionManager();
    const onLaneEvent = vi.fn();

    const developer = createDeveloper({
      onLaneEvent,
      sessionManager,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(onLaneEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "noop",
          project_id: blockedTask.project_id,
          task_id: blockedTask.task_id,
        }),
      );
    });
    const event = onLaneEvent.mock.calls.find(
      ([laneEvent]) =>
        laneEvent.event === "noop" && laneEvent.task_id === blockedTask.task_id,
    )?.[0];
    expect(event?.summary).toContain(blockedTask.task_id);
    expect(event?.summary).toContain(blockedTask.project_id);
    expect(event?.summary).toContain("dependency-pending");
    expect(mockEnsureProjectWorkspace).not.toHaveBeenCalled();
    expect(sessionManager.createSession).not.toHaveBeenCalled();
    expect(repository.assignSessionIfUnassigned).not.toHaveBeenCalled();

    await developer[Symbol.asyncDispose]();
  });

  it("binds an unassigned task after all dependencies are resolved", async () => {
    vi.useFakeTimers();
    const eligibleTask = createTask({
      dependencies: ["dependency-resolved"],
      task_id: "task-eligible",
    });
    const resolvedDependency = createTask({
      done: true,
      status: "resolved",
      task_id: "dependency-resolved",
    });
    const repository = {
      assignSessionIfUnassigned: vi
        .fn()
        .mockResolvedValue(createTask({ session_id: "session-1" })),
      getTaskById: vi.fn().mockResolvedValue(resolvedDependency),
      listRejectedTasksByProject: vi.fn().mockResolvedValue([]),
      listUnfinishedTasks: vi.fn().mockResolvedValue([eligibleTask]),
    };
    const sessionManager = createSessionManager();

    const developer = createDeveloper({
      sessionManager,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(repository.assignSessionIfUnassigned).toHaveBeenCalledWith(
        eligibleTask.task_id,
        "session-1",
      );
    });
    expect(mockEnsureProjectWorkspace).toHaveBeenCalledWith(eligibleTask);
    expect(sessionManager.createSession).toHaveBeenCalledOnce();

    await developer[Symbol.asyncDispose]();
  });

  it("conservatively skips an unassigned task when a dependency is missing", async () => {
    vi.useFakeTimers();
    const blockedTask = createTask({
      dependencies: ["dependency-missing"],
      task_id: "task-missing-dependency",
    });
    const repository = {
      assignSessionIfUnassigned: vi
        .fn()
        .mockResolvedValue(createTask({ session_id: "session-1" })),
      getTaskById: vi.fn().mockResolvedValue(null),
      listRejectedTasksByProject: vi.fn().mockResolvedValue([]),
      listUnfinishedTasks: vi.fn().mockResolvedValue([blockedTask]),
    };
    const sessionManager = createSessionManager();
    const onLaneEvent = vi.fn();

    const developer = createDeveloper({
      onLaneEvent,
      sessionManager,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(onLaneEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "noop",
          project_id: blockedTask.project_id,
          task_id: blockedTask.task_id,
        }),
      );
    });
    const event = onLaneEvent.mock.calls.find(
      ([laneEvent]) =>
        laneEvent.event === "noop" && laneEvent.task_id === blockedTask.task_id,
    )?.[0];
    expect(event?.summary).toContain("dependency-missing");
    expect(mockEnsureProjectWorkspace).not.toHaveBeenCalled();
    expect(sessionManager.createSession).not.toHaveBeenCalled();
    expect(repository.assignSessionIfUnassigned).not.toHaveBeenCalled();

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
      listRejectedTasksByProject: vi.fn().mockResolvedValue([]),
      listUnfinishedTasks: vi.fn().mockResolvedValue([initialTask]),
    };
    const sessionManager = createSessionManager();
    sessionManager.createSession.mockResolvedValue(activeSession);
    const baselineRepository = createBaselineRepository();

    const developer = createDeveloper({
      baselineRepository,
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
      listRejectedTasksByProject: vi.fn().mockResolvedValue([]),
      listUnfinishedTasks: vi.fn().mockResolvedValue([createTask()]),
    };
    const sessionManager = createSessionManager();
    sessionManager.createSession.mockResolvedValue(lostRaceSession);
    const baselineRepository = createBaselineRepository();

    const developer = createDeveloper({
      baselineRepository,
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

  it("builds a lightweight bootstrap prompt without preloading baseline, active pool, or rejected feedback", async () => {
    vi.useFakeTimers();
    const initialTask = createTask();
    const activeTask = createTask({
      session_id: "session-active",
      source_baseline_freshness: {
        current_commit: "a9979ba9487edf2d822e10ae7b651c98be3d175d",
        source_commit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        status: "stale",
        summary:
          "Task source baseline bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb differs from current origin/main a9979ba9487edf2d822e10ae7b651c98be3d175d",
      },
      task_id: "task-active",
      title: "Active overlapping work",
      worktree_path: "/repo/.worktrees/task-active",
    });
    const rejectedTask = createTask({
      done: true,
      result: "Rejected because origin/main moved.",
      status: "rejected",
      task_id: "task-rejected",
      title: "Rejected stale work",
    });
    const repository = {
      assignSessionIfUnassigned: vi
        .fn()
        .mockResolvedValue(createTask({ session_id: "session-1" })),
      listRejectedTasksByProject: vi.fn().mockResolvedValue([rejectedTask]),
      listUnfinishedTasks: vi.fn().mockResolvedValue([initialTask, activeTask]),
    };
    const sessionManager = createSessionManager();
    const baselineRepository = createBaselineRepository();

    const developer = createDeveloper({
      baselineRepository,
      sessionManager,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(repository.assignSessionIfUnassigned).toHaveBeenCalledWith(
        initialTask.task_id,
        "session-1",
      );
    });

    expect(baselineRepository.getLatestBaselineFacts).not.toHaveBeenCalled();
    expect(repository.listRejectedTasksByProject).not.toHaveBeenCalled();
    expect(sessionManager.createSession).toHaveBeenCalledBefore(
      repository.assignSessionIfUnassigned,
    );
    const prompt = sessionManager.createSession.mock.calls[0]?.[0].prompt;
    expect(prompt).toContain("http://localhost:8192");
    expect(prompt).toContain(`task_id: ${initialTask.task_id}`);
    expect(prompt).toContain(`project_id: ${initialTask.project_id}`);
    expect(prompt).toContain(`GET /tasks/${initialTask.task_id}`);
    expect(prompt).toContain(`GET /tasks/${initialTask.task_id}/spec`);
    expect(prompt).not.toContain("Current baseline facts");
    expect(prompt).not.toContain("Current Active Task Pool");
    expect(prompt).not.toContain("Rejected Task feedback");
    expect(prompt).not.toContain("task-active");
    expect(prompt).not.toContain("task-rejected");

    await developer[Symbol.asyncDispose]();
  });
});
