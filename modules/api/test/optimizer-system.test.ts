import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateAgentSessionLane = vi.fn();
const mockCreateCoordinator = vi.fn();
const mockCreateManager = vi.fn();
const mockCreateOpenCodeSessionManager = vi.fn();
const mockCreateTaskScheduler = vi.fn();
const mockEnsureProjectWorkspace = vi.fn();
const mockPrepareManagerLaneScanInput = vi.fn();

vi.mock("../src/agent-session-lane.js", () => ({
  createAgentSessionLane: mockCreateAgentSessionLane,
}));

vi.mock("../src/coordinator.js", () => ({
  createCoordinator: mockCreateCoordinator,
}));

vi.mock("../src/manager.js", () => ({
  createManager: mockCreateManager,
}));

vi.mock("../src/task-scheduler.js", () => ({
  createTaskScheduler: mockCreateTaskScheduler,
}));

vi.mock("../src/opencode-session-manager.js", () => ({
  createOpenCodeSessionManager: mockCreateOpenCodeSessionManager,
}));

vi.mock("../src/project-workspace.js", () => ({
  ensureProjectWorkspace: mockEnsureProjectWorkspace,
}));

vi.mock("../src/manager-lane-targets.js", () => ({
  prepareManagerLaneScanInput: mockPrepareManagerLaneScanInput,
}));

const configuredProject = {
  created_at: "2026-04-26T00:00:00.000Z",
  global_model_id: "claude-sonnet-4-5",
  global_provider_id: "anthropic",
  git_origin_url: "https://github.com/example/main.git",
  id: "00000000-0000-4000-8000-000000000001",
  name: "Main project",
  optimizer_enabled: true,
  updated_at: "2026-04-26T00:00:00.000Z",
};

describe("optimizer system", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts enabled optimizer lanes immediately and disposes them through the system lifecycle", async () => {
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const taskRepository = { listProjects: vi.fn(() => [configuredProject]) };
    const continuationSessionRepository = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    };
    const dimensionRepository = {};
    const laneStateRepository = {};
    const managerStateRepository = {};
    const scheduler = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };
    const coordinator = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    };
    const oldCoordinatorLane = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
    };
    const manager = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn(() => ({
        last_error: null,
        last_scan_at: null,
        running: true,
      })),
    };

    const openCodeSessionManager = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      createSession: vi.fn(),
    };
    mockCreateOpenCodeSessionManager.mockReturnValue(openCodeSessionManager);
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateAgentSessionLane.mockReturnValueOnce(oldCoordinatorLane);
    mockCreateCoordinator.mockReturnValueOnce(coordinator);
    mockEnsureProjectWorkspace.mockResolvedValueOnce("/workspaces/project-1");
    mockCreateManager.mockReturnValueOnce(manager);

    const { createOptimizerSystem } = await import(
      "../src/optimizer-system.js"
    );

    const system = createOptimizerSystem({
      continuationSessionRepository,
      coordinatorConfig: {
        baseUrl: "http://localhost:4096",
        sessionIdleFallbackTimeoutMs: undefined,
      },
      dimensionRepository,
      intervalMs: 5_000,
      laneStateRepository,
      logger,
      managerStateRepository,
      taskRepository,
    });

    expect(system.optimizerRuntime.getStatus()).toMatchObject({
      running: true,
    });
    expect(scheduler.start).toHaveBeenCalledWith({ intervalMs: 5_000 });
    expect(mockCreateTaskScheduler).toHaveBeenCalledWith(
      expect.objectContaining({
        logger,
        sessionManager: openCodeSessionManager,
        taskRepository,
      }),
    );
    expect(mockCreateManager).toHaveBeenCalledWith(
      expect.objectContaining({
        dimensionRepository,
        managerStateRepository,
        project: configuredProject,
        sessionManager: openCodeSessionManager,
      }),
    );
    expect(mockCreateCoordinator).toHaveBeenCalledWith(
      configuredProject.id,
      expect.objectContaining({
        dimensionRepository,
        projectDirectory: expect.any(Function),
        sessionManager: openCodeSessionManager,
        taskRepository,
      }),
    );
    expect(mockCreateAgentSessionLane).not.toHaveBeenCalled();

    const coordinatorOptions = mockCreateCoordinator.mock.calls[0]?.[1];
    await expect(coordinatorOptions.projectDirectory()).resolves.toBe(
      "/workspaces/project-1",
    );
    expect(mockEnsureProjectWorkspace).toHaveBeenCalledWith({
      git_origin_url: configuredProject.git_origin_url,
      project_id: configuredProject.id,
    });

    await system[Symbol.asyncDispose]();

    expect(system.optimizerRuntime.getStatus()).toMatchObject({
      running: false,
    });
    expect(scheduler[Symbol.asyncDispose]).toHaveBeenCalledOnce();
    expect(coordinator[Symbol.asyncDispose]).toHaveBeenCalled();
    expect(manager[Symbol.asyncDispose]).toHaveBeenCalled();
    expect(openCodeSessionManager[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("does not create project optimizer lanes for configured projects when optimizer is disabled", async () => {
    const disabledProject = { ...configuredProject, optimizer_enabled: false };
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const taskRepository = { listProjects: vi.fn(() => [disabledProject]) };
    const continuationSessionRepository = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    };
    const dimensionRepository = {};
    const laneStateRepository = {};
    const managerStateRepository = {};
    const scheduler = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };

    const openCodeSessionManager = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      createSession: vi.fn(),
    };
    mockCreateOpenCodeSessionManager.mockReturnValue(openCodeSessionManager);
    mockCreateTaskScheduler.mockReturnValue(scheduler);

    const { createOptimizerSystem } = await import(
      "../src/optimizer-system.js"
    );

    const system = createOptimizerSystem({
      continuationSessionRepository,
      coordinatorConfig: {
        baseUrl: "http://localhost:4096",
        sessionIdleFallbackTimeoutMs: undefined,
      },
      dimensionRepository,
      intervalMs: 5_000,
      laneStateRepository,
      logger,
      managerStateRepository,
      taskRepository,
    });

    expect(system.optimizerRuntime.getStatus()).toMatchObject({
      running: false,
    });
    expect(mockCreateAgentSessionLane).not.toHaveBeenCalled();
    expect(mockCreateManager).not.toHaveBeenCalled();
    expect(scheduler.start).not.toHaveBeenCalled();

    await system[Symbol.asyncDispose]();

    expect(scheduler[Symbol.asyncDispose]).toHaveBeenCalledOnce();
    expect(openCodeSessionManager[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });
});
