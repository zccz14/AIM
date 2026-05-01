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
  pushContinuationPrompt: vi.fn().mockResolvedValue(undefined),
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

    const developer = createTestDeveloper({
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
      projectId: initialTask.project_id,
      title: `AIM Developer: ${initialTask.title}`,
    });

    await developer[Symbol.asyncDispose]();
  });

  it("continues merged unresolved PR-backed tasks before assigning a new task", async () => {
    vi.useFakeTimers();
    const mergedTask = createTask({
      pull_request_url: "https://github.com/example/repo/pull/1",
      session_id: "session-merged",
      task_id: "task-merged",
      title: "Settle merged PR",
      worktree_path: "/repo/.worktrees/task-merged",
    });
    const newTask = createTask({
      task_id: "task-new",
      title: "New task",
    });
    const repository = {
      assignSessionIfUnassigned: vi.fn().mockResolvedValue(
        createTask({
          session_id: "session-1",
          task_id: "task-new",
        }),
      ),
      listRejectedTasksByProject: vi.fn().mockResolvedValue([]),
      listUnfinishedTasks: vi.fn().mockResolvedValue([newTask, mergedTask]),
    };
    const sessionManager = createSessionManager();
    const baselineRepository = createBaselineRepository();
    const pullRequestStatusProvider = {
      getTaskPullRequestStatus: vi.fn().mockResolvedValue({
        category: "merged_but_not_resolved",
      }),
    };

    const developer = createTestDeveloper({
      baselineRepository,
      pullRequestStatusProvider,
      sessionManager,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(sessionManager.pushContinuationPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-merged",
        }),
      );
    });
    expect(repository.assignSessionIfUnassigned).not.toHaveBeenCalled();
    expect(sessionManager.createSession).not.toHaveBeenCalled();

    await developer[Symbol.asyncDispose]();
  });

  it("does not steal unresolved PR tasks that are not merged settlement work", async () => {
    vi.useFakeTimers();
    const failedChecksTask = createTask({
      pull_request_url: "https://github.com/example/repo/pull/2",
      session_id: "session-failed-checks",
      task_id: "task-failed-checks",
    });
    const reviewBlockedTask = createTask({
      pull_request_url: "https://github.com/example/repo/pull/3",
      session_id: "session-review-blocked",
      task_id: "task-review-blocked",
    });
    const newTask = createTask({ task_id: "task-new" });
    const repository = {
      assignSessionIfUnassigned: vi.fn().mockResolvedValue(
        createTask({
          session_id: "session-1",
          task_id: "task-new",
        }),
      ),
      listRejectedTasksByProject: vi.fn().mockResolvedValue([]),
      listUnfinishedTasks: vi
        .fn()
        .mockResolvedValue([failedChecksTask, reviewBlockedTask, newTask]),
    };
    const sessionManager = createSessionManager();
    const baselineRepository = createBaselineRepository();
    const pullRequestStatusProvider = {
      getTaskPullRequestStatus: vi
        .fn()
        .mockResolvedValueOnce({ category: "failed_checks" })
        .mockResolvedValueOnce({ category: "review_blocked" }),
    };

    const developer = createTestDeveloper({
      baselineRepository,
      pullRequestStatusProvider,
      sessionManager,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(repository.assignSessionIfUnassigned).toHaveBeenCalledWith(
        "task-new",
        "session-1",
      );
    });
    expect(sessionManager.pushContinuationPrompt).not.toHaveBeenCalled();

    await developer[Symbol.asyncDispose]();
  });

  it("creates a settlement-only session for merged unresolved PR-backed tasks without an existing session", async () => {
    vi.useFakeTimers();
    const mergedTask = createTask({
      pull_request_url: "https://github.com/example/repo/pull/4",
      task_id: "task-merged",
      title: "Settle merged PR",
      worktree_path: "/repo/.worktrees/task-merged",
    });
    const repository = {
      assignSessionIfUnassigned: vi
        .fn()
        .mockResolvedValue(createTask({ session_id: "session-1" })),
      listRejectedTasksByProject: vi.fn().mockResolvedValue([]),
      listUnfinishedTasks: vi.fn().mockResolvedValue([mergedTask]),
    };
    const sessionManager = createSessionManager();
    const baselineRepository = createBaselineRepository();
    const pullRequestStatusProvider = {
      getTaskPullRequestStatus: vi.fn().mockResolvedValue({
        category: "merged_but_not_resolved",
      }),
    };

    const developer = createTestDeveloper({
      baselineRepository,
      pullRequestStatusProvider,
      sessionManager,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(repository.assignSessionIfUnassigned).toHaveBeenCalledWith(
        "task-merged",
        "session-1",
      );
    });
    expect(sessionManager.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Confirm the GitHub PR is merged"),
      }),
    );
    expect(sessionManager.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("clean up the task worktree"),
      }),
    );
    expect(sessionManager.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "refresh the main workspace to origin/main",
        ),
      }),
    );
    expect(sessionManager.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("AIM Session Settlement Protocol"),
      }),
    );
    const settlementPrompt = sessionManager.createSession.mock.calls.find(
      ([input]) => input.prompt.includes("Merged PR settlement objective"),
    )?.[0].prompt;
    expect(settlementPrompt).not.toContain("aim_session_resolve");
    expect(settlementPrompt).not.toContain("aim_session_reject");
    expect(sessionManager.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("actionable rejected reason"),
      }),
    );

    await developer[Symbol.asyncDispose]();
  });

  it("continues an assigned pending session when no unassigned task is available", async () => {
    vi.useFakeTimers();
    const assignedTask = createTask({
      opencode_session: createOpenCodeSession({
        session_id: "session-existing",
        state: "pending",
      }),
      session_id: "session-existing",
      worktree_path: "/repo/.worktrees/task-1",
    });
    const repository = {
      assignSessionIfUnassigned: vi.fn(),
      listRejectedTasksByProject: vi.fn().mockResolvedValue([]),
      listUnfinishedTasks: vi.fn().mockResolvedValue([assignedTask]),
    };
    const sessionManager = createSessionManager();
    const baselineRepository = createBaselineRepository();
    const onLaneEvent = vi.fn();

    const developer = createTestDeveloper({
      baselineRepository,
      onLaneEvent,
      sessionManager,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(sessionManager.pushContinuationPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          model: {
            modelID: assignedTask.global_model_id,
            providerID: assignedTask.global_provider_id,
          },
          sessionId: "session-existing",
        }),
      );
    });
    expect(sessionManager.pushContinuationPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(`task_id: ${assignedTask.task_id}`),
      }),
    );
    expect(sessionManager.createSession).not.toHaveBeenCalled();
    expect(repository.assignSessionIfUnassigned).not.toHaveBeenCalled();
    expect(onLaneEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "success",
        project_id: assignedTask.project_id,
        session_id: "session-existing",
        task_id: assignedTask.task_id,
      }),
    );

    await developer[Symbol.asyncDispose]();
  });

  it("continues an assigned pending session found by explicit session lookup", async () => {
    vi.useFakeTimers();
    const assignedTask = createTask({
      session_id: "session-existing",
      worktree_path: "/repo/.worktrees/task-1",
    });
    const repository = {
      assignSessionIfUnassigned: vi.fn(),
      listRejectedTasksByProject: vi.fn().mockResolvedValue([]),
      listUnfinishedTasks: vi.fn().mockResolvedValue([assignedTask]),
      updateTask: vi.fn(),
    };
    const sessionRepository = {
      getSessionById: vi.fn().mockResolvedValue(
        createOpenCodeSession({
          session_id: "session-existing",
          state: "pending",
        }),
      ),
    };
    const sessionManager = createSessionManager();

    const developer = createTestDeveloper({
      sessionManager,
      sessionRepository,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(sessionManager.pushContinuationPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-existing",
        }),
      );
    });
    expect(sessionRepository.getSessionById).toHaveBeenCalledWith(
      "session-existing",
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
      listRejectedTasksByProject: vi.fn().mockResolvedValue([]),
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
    expect(mockEnsureProjectWorkspace).toHaveBeenCalledWith(unavailableTask);
    expect(sessionManager.createSession).toHaveBeenCalledWith({
      directory: unavailableTask.worktree_path,
      model: {
        modelID: unavailableTask.global_model_id,
        providerID: unavailableTask.global_provider_id,
      },
      prompt: buildTaskSessionPrompt(unavailableTask),
      projectId: unavailableTask.project_id,
      title: `AIM Developer Recovery: ${unavailableTask.title}`,
    });
    expect(sessionManager.pushContinuationPrompt).not.toHaveBeenCalled();
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

  it("skips unavailable assigned sessions for PR follow-up work", async () => {
    vi.useFakeTimers();
    const prTask = createTask({
      pull_request_url: "https://github.com/example/repo/pull/6",
      session_id: "session-missing-pr",
      task_id: "task-unavailable-pr",
    });
    const repository = {
      assignSessionIfUnassigned: vi.fn(),
      listRejectedTasksByProject: vi.fn().mockResolvedValue([]),
      listUnfinishedTasks: vi.fn().mockResolvedValue([prTask]),
      updateTask: vi.fn(),
    };
    const sessionManager = createSessionManager();
    const onLaneEvent = vi.fn();
    const pullRequestStatusProvider = {
      getTaskPullRequestStatus: vi.fn().mockResolvedValue({
        category: "waiting_checks",
      }),
    };

    const developer = createTestDeveloper({
      onLaneEvent,
      pullRequestStatusProvider,
      sessionManager,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(onLaneEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "noop",
          project_id: prTask.project_id,
          session_id: "session-missing-pr",
          task_id: prTask.task_id,
        }),
      );
    });
    const event = onLaneEvent.mock.calls.find(
      ([laneEvent]) =>
        laneEvent.event === "noop" && laneEvent.task_id === prTask.task_id,
    )?.[0];
    expect(event?.summary).toContain(
      "pull request follow-up category waiting_checks",
    );
    expect(sessionManager.createSession).not.toHaveBeenCalled();
    expect(repository.updateTask).not.toHaveBeenCalled();

    await developer[Symbol.asyncDispose]();
  });

  it("skips unavailable assigned sessions while a dependency is not resolved", async () => {
    vi.useFakeTimers();
    const blockedTask = createTask({
      dependencies: ["dependency-pending"],
      session_id: "session-missing-blocked",
      task_id: "task-unavailable-blocked",
    });
    const dependencyTask = createTask({
      status: "pending",
      task_id: "dependency-pending",
    });
    const repository = {
      assignSessionIfUnassigned: vi.fn(),
      getTaskById: vi.fn().mockResolvedValue(dependencyTask),
      listRejectedTasksByProject: vi.fn().mockResolvedValue([]),
      listUnfinishedTasks: vi.fn().mockResolvedValue([blockedTask]),
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
          project_id: blockedTask.project_id,
          session_id: "session-missing-blocked",
          task_id: blockedTask.task_id,
        }),
      );
    });
    const event = onLaneEvent.mock.calls.find(
      ([laneEvent]) =>
        laneEvent.event === "noop" && laneEvent.task_id === blockedTask.task_id,
    )?.[0];
    expect(event?.summary).toContain("dependency-pending");
    expect(sessionManager.createSession).not.toHaveBeenCalled();
    expect(repository.updateTask).not.toHaveBeenCalled();

    await developer[Symbol.asyncDispose]();
  });

  it("skips assigned tasks whose OpenCode session is already settled", async () => {
    vi.useFakeTimers();
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
      listRejectedTasksByProject: vi.fn().mockResolvedValue([]),
      listUnfinishedTasks: vi
        .fn()
        .mockResolvedValue([resolvedTask, rejectedTask]),
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
          project_id: resolvedTask.project_id,
          session_id: "session-resolved",
          task_id: resolvedTask.task_id,
        }),
      );
    });
    expect(onLaneEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "noop",
        project_id: rejectedTask.project_id,
        session_id: "session-rejected",
        task_id: rejectedTask.task_id,
      }),
    );
    expect(sessionManager.pushContinuationPrompt).not.toHaveBeenCalled();
    expect(sessionManager.createSession).not.toHaveBeenCalled();
    expect(repository.assignSessionIfUnassigned).not.toHaveBeenCalled();

    await developer[Symbol.asyncDispose]();
  });

  it("skips assigned pending sessions for PR follow-up work that is not merged settlement", async () => {
    vi.useFakeTimers();
    const prTask = createTask({
      opencode_session: createOpenCodeSession({
        session_id: "session-pr-follow-up",
        state: "pending",
      }),
      pull_request_url: "https://github.com/example/repo/pull/5",
      session_id: "session-pr-follow-up",
      task_id: "task-pr-follow-up",
    });
    const repository = {
      assignSessionIfUnassigned: vi.fn(),
      listRejectedTasksByProject: vi.fn().mockResolvedValue([]),
      listUnfinishedTasks: vi.fn().mockResolvedValue([prTask]),
    };
    const sessionManager = createSessionManager();
    const onLaneEvent = vi.fn();
    const pullRequestStatusProvider = {
      getTaskPullRequestStatus: vi.fn().mockResolvedValue({
        category: "waiting_checks",
      }),
    };

    const developer = createTestDeveloper({
      onLaneEvent,
      pullRequestStatusProvider,
      sessionManager,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(onLaneEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "noop",
          project_id: prTask.project_id,
          session_id: "session-pr-follow-up",
          task_id: prTask.task_id,
        }),
      );
    });
    expect(sessionManager.pushContinuationPrompt).not.toHaveBeenCalled();
    expect(sessionManager.createSession).not.toHaveBeenCalled();
    expect(repository.assignSessionIfUnassigned).not.toHaveBeenCalled();

    await developer[Symbol.asyncDispose]();
  });

  it("skips assigned pending sessions while a dependency is not resolved", async () => {
    vi.useFakeTimers();
    const blockedTask = createTask({
      dependencies: ["dependency-pending"],
      opencode_session: createOpenCodeSession({
        session_id: "session-blocked",
        state: "pending",
      }),
      session_id: "session-blocked",
      task_id: "task-blocked-session",
    });
    const dependencyTask = createTask({
      status: "pending",
      task_id: "dependency-pending",
    });
    const repository = {
      assignSessionIfUnassigned: vi.fn(),
      getTaskById: vi.fn().mockResolvedValue(dependencyTask),
      listRejectedTasksByProject: vi.fn().mockResolvedValue([]),
      listUnfinishedTasks: vi.fn().mockResolvedValue([blockedTask]),
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
          project_id: blockedTask.project_id,
          session_id: "session-blocked",
          task_id: blockedTask.task_id,
        }),
      );
    });
    const event = onLaneEvent.mock.calls.find(
      ([laneEvent]) =>
        laneEvent.event === "noop" && laneEvent.task_id === blockedTask.task_id,
    )?.[0];
    expect(event?.summary).toContain("dependency-pending");
    expect(sessionManager.pushContinuationPrompt).not.toHaveBeenCalled();
    expect(sessionManager.createSession).not.toHaveBeenCalled();
    expect(repository.assignSessionIfUnassigned).not.toHaveBeenCalled();

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

    const developer = createTestDeveloper({
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

  it("skips starting a new session when the project token budget is exhausted", async () => {
    vi.useFakeTimers();
    const budgetExhaustedTask = createTask({
      task_id: "task-budget-exhausted",
    });
    const repository = {
      assignSessionIfUnassigned: vi.fn(),
      listRejectedTasksByProject: vi.fn().mockResolvedValue([]),
      listUnfinishedTasks: vi.fn().mockResolvedValue([budgetExhaustedTask]),
    };
    const sessionManager = createSessionManager();
    const onLaneEvent = vi.fn();

    const developer = createDeveloper({
      canStartTask: vi.fn().mockResolvedValue({
        ok: false,
        reason: "Project token budget exhausted: 1100 used of 1000 granted.",
      }),
      onLaneEvent,
      sessionManager,
      taskRepository: repository,
    });

    await vi.waitFor(() => {
      expect(onLaneEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "idle",
          project_id: budgetExhaustedTask.project_id,
          task_id: budgetExhaustedTask.task_id,
        }),
      );
    });
    const event = onLaneEvent.mock.calls.find(
      ([laneEvent]) => laneEvent.task_id === budgetExhaustedTask.task_id,
    )?.[0];
    expect(event?.summary).toContain("Project token budget exhausted");
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

    const developer = createTestDeveloper({
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

    const developer = createTestDeveloper({
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

    const developer = createTestDeveloper({
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

    const developer = createTestDeveloper({
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

    const developer = createTestDeveloper({
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
