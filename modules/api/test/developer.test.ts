import type { Task } from "@aim-ai/contract";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDeveloper } from "../src/developer.js";
import { buildTaskSessionPrompt } from "../src/task-continue-prompt.js";

const createSessionHandle = (sessionId: string) => ({
  session_id: sessionId,
});

const createSessionManager = () => ({
  createSession: vi.fn().mockResolvedValue(createSessionHandle("session-1")),
});

const createOpenCodeSession = (
  overrides: NonNullable<Task["opencode_session"]>,
): NonNullable<Task["opencode_session"]> => ({
  continue_prompt: null,
  created_at: "2026-04-20T00:00:00.000Z",
  model_id: null,
  provider_id: null,
  reason: null,
  session_id: overrides.session_id,
  stale: false,
  state: overrides.state,
  updated_at: "2026-04-20T00:00:00.000Z",
  value: null,
  ...overrides,
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

type CreateDeveloperInput = Parameters<typeof createDeveloper>[0];

const createTestDeveloper = (
  options: Omit<CreateDeveloperInput, "sessionRepository"> & {
    sessionRepository?: CreateDeveloperInput["sessionRepository"];
  },
) =>
  createDeveloper({
    sessionRepository: {
      getSessionById: vi.fn(async (sessionId: string) => {
        const tasks = await options.taskRepository.listUnfinishedTasks();

        return (
          tasks.find((task) => task.session_id === sessionId)
            ?.opencode_session ?? null
        );
      }),
    },
    ...options,
  });

afterEach(() => {
  vi.useRealTimers();
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

    const developer = createTestDeveloper({
      sessionManager,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(repository.assignSessionIfUnassigned).toHaveBeenCalledWith(
        initialTask.task_id,
        "session-1",
      );
    });
    expect(sessionManager.createSession).toHaveBeenCalledWith({
      prompt: buildTaskSessionPrompt(initialTask),
      projectId: initialTask.project_id,
      title: `AIM Developer: ${initialTask.title}`,
    });

    await developer[Symbol.asyncDispose]();
  });

  it("binds unassigned tasks without dependency progression gating", async () => {
    vi.useFakeTimers();
    const blockedTask = createTask({
      dependencies: ["dependency-pending", "dependency-missing"],
      task_id: "task-with-dependencies",
    });
    const repository = {
      assignSessionIfUnassigned: vi
        .fn()
        .mockResolvedValue(createTask({ session_id: "session-1" })),
      listUnfinishedTasks: vi.fn().mockResolvedValue([blockedTask]),
    };
    const sessionManager = createSessionManager();

    const developer = createTestDeveloper({
      sessionManager,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(repository.assignSessionIfUnassigned).toHaveBeenCalledWith(
        blockedTask.task_id,
        "session-1",
      );
    });
    expect(sessionManager.createSession).toHaveBeenCalledOnce();

    await developer[Symbol.asyncDispose]();
  });

  it("creates the normal task prompt for PR-backed unassigned tasks", async () => {
    vi.useFakeTimers();
    const prTask = createTask({
      pull_request_url: "https://github.com/example/repo/pull/4",
      task_id: "task-pr-backed",
      title: "Continue PR-backed task",
      worktree_path: "/repo/.worktrees/task-pr-backed",
    });
    const repository = {
      assignSessionIfUnassigned: vi
        .fn()
        .mockResolvedValue(createTask({ session_id: "session-1" })),
      listUnfinishedTasks: vi.fn().mockResolvedValue([prTask]),
    };
    const sessionManager = createSessionManager();

    const developer = createTestDeveloper({
      sessionManager,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(repository.assignSessionIfUnassigned).toHaveBeenCalledWith(
        prTask.task_id,
        "session-1",
      );
    });
    const prompt = sessionManager.createSession.mock.calls[0]?.[0].prompt;
    expect(prompt).toBe(buildTaskSessionPrompt(prTask));
    expect(prompt).not.toContain("Merged PR settlement objective");
    expect(prompt).not.toContain("Confirm the GitHub PR is merged");

    await developer[Symbol.asyncDispose]();
  });

  it("keeps assigned tasks bound when their OpenCode session exists in any state", async () => {
    vi.useFakeTimers();
    const pendingTask = createTask({
      opencode_session: createOpenCodeSession({
        session_id: "session-pending",
        state: "pending",
      }),
      session_id: "session-pending",
      task_id: "task-pending-session",
    });
    const resolvedTask = createTask({
      opencode_session: createOpenCodeSession({
        session_id: "session-resolved",
        state: "resolved",
      }),
      session_id: "session-resolved",
      task_id: "task-resolved-session",
    });
    const rejectedTask = createTask({
      opencode_session: createOpenCodeSession({
        session_id: "session-rejected",
        state: "rejected",
      }),
      session_id: "session-rejected",
      task_id: "task-rejected-session",
    });
    const repository = {
      assignSessionIfUnassigned: vi.fn(),
      listUnfinishedTasks: vi
        .fn()
        .mockResolvedValue([pendingTask, resolvedTask, rejectedTask]),
      updateTask: vi.fn(),
    };
    const sessionManager = createSessionManager();
    const onLaneEvent = vi.fn();

    const developer = createTestDeveloper({
      onLaneEvent,
      sessionManager,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(onLaneEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "noop",
          session_id: "session-pending",
          task_id: pendingTask.task_id,
        }),
      );
    });
    expect(onLaneEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "noop",
        session_id: "session-resolved",
        task_id: resolvedTask.task_id,
      }),
    );
    expect(onLaneEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "noop",
        session_id: "session-rejected",
        task_id: rejectedTask.task_id,
      }),
    );
    expect(sessionManager.createSession).not.toHaveBeenCalled();
    expect(repository.updateTask).not.toHaveBeenCalled();
    expect(repository.assignSessionIfUnassigned).not.toHaveBeenCalled();

    await developer[Symbol.asyncDispose]();
  });

  it("recovers an assigned task whose OpenCode session record is unavailable", async () => {
    vi.useFakeTimers();
    const unavailableTask = createTask({
      session_id: "session-missing",
      task_id: "task-unavailable-session",
      worktree_path: "/repo/.worktrees/task-unavailable-session",
    });
    const recoveredTask = createTask({
      ...unavailableTask,
      opencode_session: createOpenCodeSession({
        session_id: "session-recovered",
        state: "pending",
      }),
      session_id: "session-recovered",
    });
    const repository = {
      assignSessionIfUnassigned: vi.fn(),
      listUnfinishedTasks: vi.fn().mockResolvedValue([unavailableTask]),
      updateTask: vi.fn().mockResolvedValue(recoveredTask),
    };
    const sessionManager = createSessionManager();
    sessionManager.createSession.mockResolvedValue(
      createSessionHandle("session-recovered"),
    );
    const onLaneEvent = vi.fn();

    const developer = createTestDeveloper({
      onLaneEvent,
      sessionManager,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(repository.updateTask).toHaveBeenCalledWith(
        unavailableTask.task_id,
        { session_id: "session-recovered" },
      );
    });
    expect(sessionManager.createSession).toHaveBeenCalledWith({
      prompt: buildTaskSessionPrompt(unavailableTask),
      projectId: unavailableTask.project_id,
      title: `AIM Developer Recovery: ${unavailableTask.title}`,
    });
    expect(repository.assignSessionIfUnassigned).not.toHaveBeenCalled();
    expect(onLaneEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "success",
        project_id: unavailableTask.project_id,
        session_id: "session-recovered",
        task_id: unavailableTask.task_id,
      }),
    );

    await developer[Symbol.asyncDispose]();
  });

  it("recovers unavailable assigned sessions without PR or dependency category gating", async () => {
    vi.useFakeTimers();
    const unavailableTask = createTask({
      dependencies: ["dependency-pending"],
      pull_request_url: "https://github.com/example/repo/pull/6",
      session_id: "session-missing-pr",
      task_id: "task-unavailable-pr",
    });
    const repository = {
      assignSessionIfUnassigned: vi.fn(),
      listUnfinishedTasks: vi.fn().mockResolvedValue([unavailableTask]),
      updateTask: vi.fn().mockResolvedValue(
        createTask({
          ...unavailableTask,
          session_id: "session-recovered",
        }),
      ),
    };
    const sessionManager = createSessionManager();
    sessionManager.createSession.mockResolvedValue(
      createSessionHandle("session-recovered"),
    );

    const developer = createTestDeveloper({
      sessionManager,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(repository.updateTask).toHaveBeenCalledWith(
        unavailableTask.task_id,
        { session_id: "session-recovered" },
      );
    });
    expect(sessionManager.createSession).toHaveBeenCalledOnce();

    await developer[Symbol.asyncDispose]();
  });

  it("emits a failure event when missing assigned session recovery is unsupported", async () => {
    vi.useFakeTimers();
    const assignedTask = createTask({
      session_id: "session-missing",
      worktree_path: "/repo/.worktrees/task-1",
    });
    const repository = {
      assignSessionIfUnassigned: vi.fn(),
      listUnfinishedTasks: vi.fn().mockResolvedValue([assignedTask]),
    };
    const sessionManager = createSessionManager();
    const onLaneEvent = vi.fn();

    const developer = createTestDeveloper({
      onLaneEvent,
      sessionManager,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(onLaneEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "failure",
          project_id: assignedTask.project_id,
          session_id: "session-missing",
          task_id: assignedTask.task_id,
        }),
      );
    });
    const event = onLaneEvent.mock.calls.find(
      ([laneEvent]) => laneEvent.event === "failure",
    )?.[0];
    expect(event?.summary).toContain(
      "Task repository does not support rebinding unavailable assigned sessions",
    );
    expect(sessionManager.createSession).not.toHaveBeenCalled();

    await developer[Symbol.asyncDispose]();
  });

  it("builds a lightweight bootstrap prompt without preloading baseline, active pool, or rejected feedback", async () => {
    vi.useFakeTimers();
    const initialTask = createTask();
    const activeTasks = Array.from({ length: 60 }, (_, index) =>
      createTask({
        session_id: `session-active-${index}`,
        source_baseline_freshness: {
          current_commit: "a9979ba9487edf2d822e10ae7b651c98be3d175d",
          source_commit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          status: "stale",
          summary:
            "Task source baseline bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb differs from current origin/main a9979ba9487edf2d822e10ae7b651c98be3d175d",
        },
        task_id: `task-active-${index}`,
        title: `Active overlapping work ${index}`,
        worktree_path: `/repo/.worktrees/task-active-${index}`,
      }),
    );
    const repository = {
      assignSessionIfUnassigned: vi
        .fn()
        .mockResolvedValue(createTask({ session_id: "session-1" })),
      listUnfinishedTasks: vi
        .fn()
        .mockResolvedValue([initialTask, ...activeTasks]),
    };
    const sessionManager = createSessionManager();

    const developer = createTestDeveloper({
      sessionManager,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(repository.assignSessionIfUnassigned).toHaveBeenCalledWith(
        initialTask.task_id,
        "session-1",
      );
    });

    const prompt = sessionManager.createSession.mock.calls[0]?.[0].prompt;
    expect(prompt).toContain("http://localhost:8192");
    expect(prompt).toContain(`task_id: ${initialTask.task_id}`);
    expect(prompt).toContain(`project_id: ${initialTask.project_id}`);
    expect(prompt).toContain(`GET /tasks/${initialTask.task_id}`);
    expect(prompt).toContain(`GET /tasks/${initialTask.task_id}/spec`);
    expect(prompt.length).toBeLessThan(1_800);
    expect(prompt).not.toContain("Current baseline facts");
    expect(prompt).not.toContain("Current Active Task Pool");
    expect(prompt).not.toContain("Rejected Task feedback");
    expect(prompt).not.toContain("task-active-59");

    await developer[Symbol.asyncDispose]();
  });

  it("disposing stops future heartbeats without owning OpenCode lifecycle handles", async () => {
    vi.useFakeTimers();
    const initialTask = createTask();
    const repository = {
      assignSessionIfUnassigned: vi
        .fn()
        .mockResolvedValue(createTask({ session_id: "session-1" })),
      listUnfinishedTasks: vi.fn().mockResolvedValue([initialTask]),
    };
    const sessionManager = createSessionManager();

    const developer = createTestDeveloper({
      sessionManager,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(repository.assignSessionIfUnassigned).toHaveBeenCalledOnce();
    });

    await developer[Symbol.asyncDispose]();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(repository.listUnfinishedTasks).toHaveBeenCalledOnce();
  });
});
