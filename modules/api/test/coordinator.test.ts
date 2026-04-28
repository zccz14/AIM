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
  developer_model_id: "claude-sonnet-4-5",
  developer_provider_id: "anthropic",
  done: false,
  git_origin_url: "https://github.com/example/project.git",
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

const createDimension = (id: string) => ({
  created_at: "2026-04-27T00:00:00.000Z",
  evaluation_method: "score the README goal",
  goal: "Improve the project",
  id,
  name: `Dimension ${id}`,
  project_id: project.id,
  updated_at: "2026-04-27T00:00:00.000Z",
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

    const { createCoordinator } = await import("../src/coordinator.js");
    const coordinator = createCoordinator(project.id, {
      dimensionRepository,
      projectDirectory: "/repo/workspace/project-1",
      sessionManager,
      taskRepository,
    });

    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(1000);

    expect(dimensionRepository.listDimensions).toHaveBeenCalledWith(project.id);
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
    expect(prompt).toContain("append Tasks");
    expect(prompt).toContain(
      "Latest gap: missing coordinator-created task coverage.",
    );

    await coordinator[Symbol.asyncDispose]();

    expect(sessionHandle[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("keeps the heartbeat loop alive after a transient repository failure", async () => {
    const taskRepository = {
      getProjectById: vi.fn(() => project),
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
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { createCoordinator } = await import("../src/coordinator.js");
    const coordinator = createCoordinator(project.id, {
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
});
