import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const project = {
  created_at: "2026-04-26T00:00:00.000Z",
  global_model_id: "claude-sonnet-4-5",
  global_provider_id: "anthropic",
  git_origin_url: "https://github.com/example/project.git",
  id: "project-1",
  name: "Project One",
  optimizer_enabled: true,
  updated_at: "2026-04-26T00:00:00.000Z",
};

const createTask = (index: number, projectId = project.id) => ({
  created_at: "2026-04-27T00:00:00.000Z",
  dependencies: [],
  done: false,
  git_origin_url: "https://github.com/example/project.git",
  global_model_id: project.global_model_id,
  global_provider_id: project.global_provider_id,
  opencode_session: null,
  project_id: projectId,
  pull_request_url: null,
  result: "",
  session_id: null,
  source_metadata: {},
  status: "pending" as const,
  task_id: `task-${projectId}-${index}`,
  task_spec: `Task spec ${index}`,
  title: `Task ${index}`,
  updated_at: "2026-04-27T00:00:00.000Z",
  worktree_path: null,
});

const createRejectedTask = (index: number, projectId = project.id) => ({
  ...createTask(index, projectId),
  done: true,
  result:
    "Task Spec validation failed because coverage duplicated current Active Task Pool and used stale baseline facts.",
  source_metadata: {
    task_spec_validation: {
      conclusion: "failed",
      failure_reason:
        "waiting_assumptions and stale baseline blocked POST /tasks/batch",
    },
  },
  status: "rejected" as const,
  task_id: `rejected-${projectId}-${index}`,
  title: `Rejected Task ${index}`,
});

const createDimension = (id: string) => ({
  created_at: "2026-04-27T00:00:00.000Z",
  evaluation_method: "score the README goal",
  goal: "Improve the project",
  id,
  name: `Dimension ${id}`,
  project_id: project.id,
  updated_at: "2026-04-27T00:00:00.000Z",
});

const createBelowThresholdRepositories = () => ({
  baselineRepository: {
    getLatestBaselineFacts: vi.fn(async () => ({
      commitSha: "baseline-retry",
      fetchedAt: "2026-04-28T12:00:00.000Z",
      summary: "Retry baseline",
    })),
  },
  dimensionRepository: {
    listDimensionEvaluations: vi.fn(async () => []),
    listDimensions: vi.fn(async () => []),
  },
  taskRepository: {
    getProjectById: vi.fn(() => project),
    listRejectedTasksByProject: vi.fn(async () => []),
    listUnfinishedTasks: vi.fn(async () => []),
  },
});

describe("coordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("starts immediately and does nothing when this project's Active Task Pool is sufficient", async () => {
    const taskRepository = {
      getProjectById: vi.fn(() => project),
      listRejectedTasksByProject: vi.fn(),
      listUnfinishedTasks: vi.fn(async () => [
        ...Array.from({ length: 10 }, (_, index) => createTask(index)),
        createTask(99, "other-project"),
      ]),
    };
    const dimensionRepository = {
      listDimensionEvaluations: vi.fn(),
      listDimensions: vi.fn(),
    };
    const sessionManager = {
      createSession: vi.fn(),
    };

    const { createCoordinator } = await import("../src/coordinator.js");
    const coordinator = createCoordinator(project.id, {
      dimensionRepository,
      projectDirectory: "/repo/workspace/project-1",
      sessionManager,
      taskRepository,
    });

    await vi.advanceTimersByTimeAsync(1);

    expect(taskRepository.getProjectById).toHaveBeenCalledWith(project.id);
    expect(taskRepository.listUnfinishedTasks).toHaveBeenCalledOnce();
    expect(dimensionRepository.listDimensions).not.toHaveBeenCalled();
    expect(sessionManager.createSession).not.toHaveBeenCalled();

    await coordinator[Symbol.asyncDispose]();
  });

  it("creates one project-scoped OpenCode session through the session manager when the Active Task Pool is below threshold", async () => {
    const dimension = createDimension("dimension-1");
    const taskRepository = {
      getProjectById: vi.fn(() => project),
      listRejectedTasksByProject: vi.fn(async (projectId: string) => [
        createRejectedTask(1, projectId),
        createRejectedTask(2, "other-project"),
      ]),
      listUnfinishedTasks: vi.fn(async () => [
        createTask(1),
        createTask(2, "other-project"),
      ]),
    };
    const dimensionRepository = {
      listDimensionEvaluations: vi.fn(async (dimensionId: string) => [
        {
          commit_sha: "abc123",
          created_at: "2026-04-28T10:00:00.000Z",
          dimension_id: dimensionId,
          evaluation: "Latest gap: missing coordinator-created task coverage.",
          evaluator_model: "claude-sonnet-4-5",
          id: "evaluation-1",
          project_id: project.id,
          score: 42,
        },
      ]),
      listDimensions: vi.fn(async () => [dimension]),
    };
    const sessionHandle = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      sessionId: "coordinator-session-1",
    };
    const sessionManager = {
      createSession: vi.fn(async () => sessionHandle),
    };
    const baselineRepository = {
      getLatestBaselineFacts: vi.fn(async () => ({
        commitSha: "baseline-123",
        fetchedAt: "2026-04-28T12:00:00.000Z",
        summary: "Fix optimizer scheduler setup cleanup (#245)",
      })),
    };

    const { createCoordinator } = await import("../src/coordinator.js");
    const coordinator = createCoordinator(project.id, {
      baselineRepository,
      dimensionRepository,
      projectDirectory: "/repo/workspace/project-1",
      sessionManager,
      taskRepository,
    });

    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(1000);

    expect(dimensionRepository.listDimensions).toHaveBeenCalledWith(project.id);
    expect(taskRepository.listRejectedTasksByProject).toHaveBeenCalledWith(
      project.id,
    );
    expect(baselineRepository.getLatestBaselineFacts).toHaveBeenCalledWith(
      "/repo/workspace/project-1",
    );
    expect(sessionManager.createSession).toHaveBeenCalledTimes(1);
    expect(sessionManager.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: "/repo/workspace/project-1",
        model: { modelID: "claude-sonnet-4-5", providerID: "anthropic" },
        title: "AIM Coordinator task-pool session (project-1)",
      }),
    );
    const prompt = sessionManager.createSession.mock.calls[0]?.[0].prompt;
    expect(prompt).toContain('project_id "project-1"');
    expect(prompt).toContain("Active Task Pool: 1 unfinished Tasks");
    expect(prompt).toContain("Current baseline facts");
    expect(prompt).toContain('commit "baseline-123"');
    expect(prompt).toContain("Fix optimizer scheduler setup cleanup (#245)");
    expect(prompt).toContain("Rejected Task feedback for this project");
    expect(prompt).toContain("rejected-project-1-1");
    expect(prompt).toContain(
      "Task Spec validation failed because coverage duplicated current Active Task Pool",
    );
    expect(prompt).not.toContain("rejected-other-project-2");
    expect(prompt).toContain("append Tasks");
    expect(prompt).toContain("POST /tasks/batch");
    expect(prompt).toContain("source_metadata.task_spec_validation");
    expect(prompt).toContain("waiting_assumptions");
    expect(prompt).toContain("failed Task Spec validation");
    expect(prompt).toContain("self-overlap");
    expect(prompt).toContain("duplicate coverage");
    expect(prompt).toContain(
      "Latest gap: missing coordinator-created task coverage.",
    );

    await coordinator[Symbol.asyncDispose]();

    expect(sessionHandle[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("keeps the heartbeat loop alive after a transient repository failure", async () => {
    const taskRepository = {
      getProjectById: vi.fn(() => project),
      listRejectedTasksByProject: vi.fn(async () => []),
      listUnfinishedTasks: vi
        .fn()
        .mockRejectedValueOnce(new Error("temporary database lock"))
        .mockResolvedValue([]),
    };
    const dimensionRepository = {
      listDimensionEvaluations: vi.fn(async () => []),
      listDimensions: vi.fn(async () => []),
    };
    const sessionHandle = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      sessionId: "coordinator-session-after-retry",
    };
    const sessionManager = {
      createSession: vi.fn(async () => sessionHandle),
    };
    const baselineRepository = {
      getLatestBaselineFacts: vi.fn(async () => ({
        commitSha: "baseline-after-retry",
        fetchedAt: "2026-04-28T12:00:00.000Z",
        summary: "Retry baseline",
      })),
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { createCoordinator } = await import("../src/coordinator.js");
    const coordinator = createCoordinator(project.id, {
      baselineRepository,
      dimensionRepository,
      projectDirectory: "/repo/workspace/project-1",
      sessionManager,
      taskRepository,
    });

    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(1000);

    expect(warn).toHaveBeenCalledWith(
      "Coordinator heartbeat failed",
      expect.objectContaining({ error: "temporary database lock" }),
    );
    expect(sessionManager.createSession).toHaveBeenCalledOnce();

    await coordinator[Symbol.asyncDispose]();
  });

  it("does not start a second Coordinator session while one is pending, then starts another after settlement", async () => {
    const repositories = createBelowThresholdRepositories();
    const sessions = new Map<
      string,
      { session_id: string; state: "pending" | "rejected" | "resolved" }
    >();
    const sessionHandles = [
      {
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
        sessionId: "coordinator-session-1",
      },
      {
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
        sessionId: "coordinator-session-2",
      },
    ];
    const sessionManager = {
      createSession: vi.fn(async () => {
        const session = sessionHandles[sessions.size];
        if (!session) {
          throw new Error("unexpected session create");
        }

        sessions.set(session.sessionId, {
          session_id: session.sessionId,
          state: "pending",
        });
        return session;
      }),
    };
    const continuationSessionRepository = {
      getSessionById: vi.fn((sessionId: string) => sessions.get(sessionId)),
    };

    const { createCoordinator } = await import("../src/coordinator.js");
    const coordinator = createCoordinator(project.id, {
      ...repositories,
      continuationSessionRepository,
      heartbeatMs: 100,
      projectDirectory: "/repo/workspace/project-1",
      sessionManager,
    });

    await vi.advanceTimersByTimeAsync(1);
    expect(sessionManager.createSession).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(continuationSessionRepository.getSessionById).toHaveBeenCalledWith(
      "coordinator-session-1",
    );
    expect(sessionManager.createSession).toHaveBeenCalledTimes(1);

    const firstSession = sessions.get("coordinator-session-1");
    expect(firstSession).toBeDefined();
    if (firstSession) {
      firstSession.state = "resolved";
    }
    await vi.advanceTimersByTimeAsync(100);

    expect(sessionManager.createSession).toHaveBeenCalledTimes(2);
    expect(sessions.get("coordinator-session-2")?.state).toBe("pending");

    await coordinator[Symbol.asyncDispose]();

    expect(sessionHandles[0][Symbol.asyncDispose]).not.toHaveBeenCalled();
    expect(sessionHandles[1][Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("does not permanently stall the Coordinator lane after createSession fails", async () => {
    const repositories = createBelowThresholdRepositories();
    const sessionHandle = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      sessionId: "coordinator-session-after-create-failure",
    };
    const sessionManager = {
      createSession: vi
        .fn()
        .mockRejectedValueOnce(new Error("OpenCode create failed"))
        .mockResolvedValue(sessionHandle),
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { createCoordinator } = await import("../src/coordinator.js");
    const coordinator = createCoordinator(project.id, {
      ...repositories,
      heartbeatMs: 100,
      projectDirectory: "/repo/workspace/project-1",
      sessionManager,
    });

    await vi.advanceTimersByTimeAsync(1);
    expect(sessionManager.createSession).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "Coordinator heartbeat failed",
      expect.objectContaining({ error: "OpenCode create failed" }),
    );

    await vi.advanceTimersByTimeAsync(100);
    expect(sessionManager.createSession).toHaveBeenCalledTimes(2);

    await coordinator[Symbol.asyncDispose]();
    expect(sessionHandle[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("clears the active Coordinator session after settlement observation fails", async () => {
    const repositories = createBelowThresholdRepositories();
    const sessionHandles = [
      {
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
        sessionId: "coordinator-session-observation-fails",
      },
      {
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
        sessionId: "coordinator-session-after-observation-failure",
      },
    ];
    let sessionsCreated = 0;
    const sessionManager = {
      createSession: vi.fn(async () => {
        const session = sessionHandles[sessionsCreated++];
        if (!session) {
          throw new Error("unexpected session create");
        }

        return session;
      }),
    };
    const continuationSessionRepository = {
      getSessionById: vi
        .fn()
        .mockRejectedValueOnce(new Error("settlement lookup failed")),
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { createCoordinator } = await import("../src/coordinator.js");
    const coordinator = createCoordinator(project.id, {
      ...repositories,
      continuationSessionRepository,
      heartbeatMs: 100,
      projectDirectory: "/repo/workspace/project-1",
      sessionManager,
    });

    await vi.advanceTimersByTimeAsync(1);
    expect(sessionManager.createSession).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(warn).toHaveBeenCalledWith(
      "Coordinator heartbeat failed",
      expect.objectContaining({ error: "settlement lookup failed" }),
    );

    await vi.advanceTimersByTimeAsync(100);
    expect(sessionManager.createSession).toHaveBeenCalledTimes(2);

    await coordinator[Symbol.asyncDispose]();

    expect(sessionHandles[0][Symbol.asyncDispose]).not.toHaveBeenCalled();
    expect(sessionHandles[1][Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });
});
