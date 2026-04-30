import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateCoordinator = vi.fn();
const mockCreateDeveloper = vi.fn();
const mockCreateManager = vi.fn();
const mockCreateOpenCodeSessionManager = vi.fn();
const mockEnsureProjectWorkspace = vi.fn();
const mockPrepareManagerLaneScanInput = vi.fn();

vi.mock("../src/coordinator.js", () => ({
  createCoordinator: mockCreateCoordinator,
}));

vi.mock("../src/manager.js", () => ({
  createManager: mockCreateManager,
}));

vi.mock("../src/developer.js", () => ({
  createDeveloper: mockCreateDeveloper,
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

  it("resolves to an owned async disposable system without disposing setup resources", async () => {
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const taskRepository = { listProjects: vi.fn(() => [configuredProject]) };
    const continuationSessionRepository = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    };
    const dimensionRepository = {};
    const managerStateRepository = {};
    const developer = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    };
    const coordinator = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
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
    mockCreateDeveloper.mockReturnValue(developer);
    mockCreateManager.mockReturnValueOnce(manager);
    mockCreateCoordinator.mockReturnValueOnce(coordinator);

    const { createOptimizerSystem } = await import(
      "../src/optimizer-system.js"
    );

    const systemPromise = createOptimizerSystem({
      continuationSessionRepository,
      coordinatorConfig: {
        baseUrl: "http://localhost:4096",
        sessionIdleFallbackTimeoutMs: undefined,
      },
      dimensionRepository,
      intervalMs: 5_000,
      logger,
      managerStateRepository,
      taskRepository,
    });

    expect(systemPromise).toBeInstanceOf(Promise);

    const system = await systemPromise;

    expect(developer[Symbol.asyncDispose]).not.toHaveBeenCalled();
    expect(coordinator[Symbol.asyncDispose]).not.toHaveBeenCalled();
    expect(manager[Symbol.asyncDispose]).not.toHaveBeenCalled();
    expect(openCodeSessionManager[Symbol.asyncDispose]).not.toHaveBeenCalled();

    await system[Symbol.asyncDispose]();

    expect(developer[Symbol.asyncDispose]).toHaveBeenCalledOnce();
    expect(coordinator[Symbol.asyncDispose]).toHaveBeenCalledOnce();
    expect(manager[Symbol.asyncDispose]).toHaveBeenCalledOnce();
    expect(openCodeSessionManager[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("creates heartbeat components for enabled projects and disposes them through the system lifecycle", async () => {
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const taskRepository = { listProjects: vi.fn(() => [configuredProject]) };
    const continuationSessionRepository = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    };
    const dimensionRepository = {};
    const managerStateRepository = {};
    const developer = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    };
    const coordinator = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
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
    mockCreateDeveloper.mockReturnValue(developer);
    mockCreateCoordinator.mockReturnValueOnce(coordinator);
    mockEnsureProjectWorkspace.mockResolvedValueOnce("/workspaces/project-1");
    mockCreateManager.mockReturnValueOnce(manager);

    const { createOptimizerSystem } = await import(
      "../src/optimizer-system.js"
    );

    const system = await createOptimizerSystem({
      continuationSessionRepository,
      coordinatorConfig: {
        baseUrl: "http://localhost:4096",
        sessionIdleFallbackTimeoutMs: undefined,
      },
      dimensionRepository,
      intervalMs: 5_000,
      logger,
      managerStateRepository,
      taskRepository,
    });

    expect(mockCreateDeveloper).toHaveBeenCalledWith(
      expect.objectContaining({
        logger,
        sessionManager: openCodeSessionManager,
        sessionRepository: continuationSessionRepository,
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
    const coordinatorOptions = mockCreateCoordinator.mock.calls[0]?.[1];
    await expect(coordinatorOptions.projectDirectory()).resolves.toBe(
      "/workspaces/project-1",
    );
    expect(mockEnsureProjectWorkspace).toHaveBeenCalledWith({
      git_origin_url: configuredProject.git_origin_url,
      project_id: configuredProject.id,
    });

    await system[Symbol.asyncDispose]();

    expect(developer[Symbol.asyncDispose]).toHaveBeenCalledOnce();
    expect(coordinator[Symbol.asyncDispose]).toHaveBeenCalled();
    expect(manager[Symbol.asyncDispose]).toHaveBeenCalled();
    expect(openCodeSessionManager[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("reports optimizer status from the enabled project's manager lane", async () => {
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const taskRepository = { listProjects: vi.fn(() => [configuredProject]) };
    const continuationSessionRepository = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    };
    const dimensionRepository = {};
    const managerStateRepository = {};
    const manager = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn(() => ({
        last_error: null,
        last_scan_at: "2026-04-29T10:15:30.000Z",
        running: true,
      })),
    };
    const developer = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    };
    const coordinator = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    };
    const openCodeSessionManager = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      createSession: vi.fn(),
    };
    mockCreateOpenCodeSessionManager.mockReturnValue(openCodeSessionManager);
    mockCreateDeveloper.mockReturnValue(developer);
    mockCreateManager.mockReturnValueOnce(manager);
    mockCreateCoordinator.mockReturnValueOnce(coordinator);

    const { createOptimizerSystem } = await import(
      "../src/optimizer-system.js"
    );

    const system = await createOptimizerSystem({
      continuationSessionRepository,
      coordinatorConfig: {
        baseUrl: "http://localhost:4096",
        sessionIdleFallbackTimeoutMs: undefined,
      },
      dimensionRepository,
      intervalMs: 5_000,
      logger,
      managerStateRepository,
      taskRepository,
    });

    expect(system.getProjectStatus).toBeTypeOf("function");
    expect(system.getProjectStatus?.(configuredProject.id)).toMatchObject({
      blocker_summary:
        "Manager lane active; recent scan at 2026-04-29T10:15:30.000Z",
    });

    await system[Symbol.asyncDispose]();
  });

  it("summarizes the most recent non-manager lane failure when the manager lane is healthy", async () => {
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const project = {
      ...configuredProject,
      id: "00000000-0000-4000-8000-000000000101",
    };
    const taskRepository = { listProjects: vi.fn(() => [project]) };
    const continuationSessionRepository = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    };
    const dimensionRepository = {};
    const managerStateRepository = {};
    const manager = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn(() => ({
        last_error: null,
        last_scan_at: "2026-04-29T10:15:30.000Z",
        running: true,
      })),
    };
    const developer = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    };
    const coordinator = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    };
    const openCodeSessionManager = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      createSession: vi.fn(),
    };
    mockCreateOpenCodeSessionManager.mockReturnValue(openCodeSessionManager);
    mockCreateDeveloper.mockReturnValue(developer);
    mockCreateManager.mockReturnValueOnce(manager);
    mockCreateCoordinator.mockReturnValueOnce(coordinator);

    const { createOptimizerSystem } = await import(
      "../src/optimizer-system.js"
    );

    const system = await createOptimizerSystem({
      continuationSessionRepository,
      coordinatorConfig: {
        baseUrl: "http://localhost:4096",
        sessionIdleFallbackTimeoutMs: undefined,
      },
      dimensionRepository,
      intervalMs: 5_000,
      logger,
      managerStateRepository,
      taskRepository,
    });

    mockCreateCoordinator.mock.calls[0]?.[1].onLaneEvent({
      event: "failure",
      lane_name: "coordinator",
      project_id: project.id,
      summary: "Task batch dry-run failed: stale baseline",
    });

    expect(system.getProjectStatus?.(project.id)).toMatchObject({
      blocker_summary:
        "Coordinator lane failed: Task batch dry-run failed: stale baseline",
    });

    await system[Symbol.asyncDispose]();
  });

  it("summarizes a non-manager idle reason before generic manager activity", async () => {
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const project = {
      ...configuredProject,
      id: "00000000-0000-4000-8000-000000000102",
    };
    const taskRepository = { listProjects: vi.fn(() => [project]) };
    const continuationSessionRepository = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    };
    const dimensionRepository = {};
    const managerStateRepository = {};
    const manager = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn(() => ({
        last_error: null,
        last_scan_at: "2026-04-29T10:15:30.000Z",
        running: true,
      })),
    };
    const developer = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    };
    const coordinator = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    };
    const openCodeSessionManager = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      createSession: vi.fn(),
    };
    mockCreateOpenCodeSessionManager.mockReturnValue(openCodeSessionManager);
    mockCreateDeveloper.mockReturnValue(developer);
    mockCreateManager.mockReturnValueOnce(manager);
    mockCreateCoordinator.mockReturnValueOnce(coordinator);

    const { createOptimizerSystem } = await import(
      "../src/optimizer-system.js"
    );

    const system = await createOptimizerSystem({
      continuationSessionRepository,
      coordinatorConfig: {
        baseUrl: "http://localhost:4096",
        sessionIdleFallbackTimeoutMs: undefined,
      },
      dimensionRepository,
      intervalMs: 5_000,
      logger,
      managerStateRepository,
      taskRepository,
    });

    mockCreateDeveloper.mock.calls[0]?.[0].onLaneEvent({
      event: "idle",
      lane_name: "developer",
      project_id: project.id,
      summary: "No unassigned tasks are available to continue",
    });

    expect(system.getProjectStatus?.(project.id)).toMatchObject({
      blocker_summary:
        "Developer lane idle: No unassigned tasks are available to continue",
    });

    await system[Symbol.asyncDispose]();
  });

  it("keeps manager failure as the highest blocker summary priority", async () => {
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const project = {
      ...configuredProject,
      id: "00000000-0000-4000-8000-000000000103",
    };
    const taskRepository = { listProjects: vi.fn(() => [project]) };
    const continuationSessionRepository = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    };
    const dimensionRepository = {};
    const managerStateRepository = {};
    const manager = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn(() => ({
        last_error: "README evaluation failed",
        last_scan_at: "2026-04-29T10:15:30.000Z",
        running: true,
      })),
    };
    const developer = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    };
    const coordinator = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    };
    const openCodeSessionManager = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      createSession: vi.fn(),
    };
    mockCreateOpenCodeSessionManager.mockReturnValue(openCodeSessionManager);
    mockCreateDeveloper.mockReturnValue(developer);
    mockCreateManager.mockReturnValueOnce(manager);
    mockCreateCoordinator.mockReturnValueOnce(coordinator);

    const { createOptimizerSystem } = await import(
      "../src/optimizer-system.js"
    );

    const system = await createOptimizerSystem({
      continuationSessionRepository,
      coordinatorConfig: {
        baseUrl: "http://localhost:4096",
        sessionIdleFallbackTimeoutMs: undefined,
      },
      dimensionRepository,
      intervalMs: 5_000,
      logger,
      managerStateRepository,
      taskRepository,
    });

    mockCreateDeveloper.mock.calls[0]?.[0].onLaneEvent({
      event: "failure",
      lane_name: "developer",
      project_id: project.id,
      summary: "OpenCode continuation failed",
    });

    expect(system.getProjectStatus?.(project.id)).toMatchObject({
      blocker_summary: "Manager lane failed: README evaluation failed",
    });

    await system[Symbol.asyncDispose]();
  });

  it("does not create project optimizer lanes for configured projects when optimizer is disabled", async () => {
    const disabledProject = { ...configuredProject, optimizer_enabled: false };
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const taskRepository = { listProjects: vi.fn(() => [disabledProject]) };
    const continuationSessionRepository = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    };
    const dimensionRepository = {};
    const managerStateRepository = {};
    const developer = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    };

    const openCodeSessionManager = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      createSession: vi.fn(),
    };
    mockCreateOpenCodeSessionManager.mockReturnValue(openCodeSessionManager);
    mockCreateDeveloper.mockReturnValue(developer);

    const { createOptimizerSystem } = await import(
      "../src/optimizer-system.js"
    );

    const system = await createOptimizerSystem({
      continuationSessionRepository,
      coordinatorConfig: {
        baseUrl: "http://localhost:4096",
        sessionIdleFallbackTimeoutMs: undefined,
      },
      dimensionRepository,
      intervalMs: 5_000,
      logger,
      managerStateRepository,
      taskRepository,
    });

    expect(mockCreateManager).not.toHaveBeenCalled();
    expect(mockCreateDeveloper).toHaveBeenCalledOnce();

    await system[Symbol.asyncDispose]();

    expect(developer[Symbol.asyncDispose]).toHaveBeenCalledOnce();
    expect(openCodeSessionManager[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("disposes the developer scheduler when later optimizer setup fails", async () => {
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const taskRepository = { listProjects: vi.fn(() => [configuredProject]) };
    const continuationSessionRepository = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    };
    const dimensionRepository = {};
    const managerStateRepository = {};
    const developer = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
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
    const setupError = new Error("coordinator setup failed");
    mockCreateOpenCodeSessionManager.mockReturnValue(openCodeSessionManager);
    mockCreateDeveloper.mockReturnValue(developer);
    mockCreateManager.mockReturnValueOnce(manager);
    mockCreateCoordinator.mockImplementationOnce(() => {
      throw setupError;
    });

    const { createOptimizerSystem } = await import(
      "../src/optimizer-system.js"
    );

    await expect(
      createOptimizerSystem({
        continuationSessionRepository,
        coordinatorConfig: {
          baseUrl: "http://localhost:4096",
          sessionIdleFallbackTimeoutMs: undefined,
        },
        dimensionRepository,
        intervalMs: 5_000,
        logger,
        managerStateRepository,
        taskRepository,
      }),
    ).rejects.toThrow(setupError);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        component: "coordinator",
        configured_project_count: 1,
        enabled_configured_project_count: 1,
        error_summary: "coordinator setup failed",
        lane: "coordinator",
        optimizer_configured_stage: "configured_projects_filter",
        optimizer_enabled: true,
        optimizer_enabled_stage: "enabled_projects_filter",
        project_id: configuredProject.id,
        total_project_count: 1,
      }),
      "Optimizer setup failed while creating coordinator lane",
    );
    expect(developer[Symbol.asyncDispose]).toHaveBeenCalledOnce();
    expect(manager[Symbol.asyncDispose]).toHaveBeenCalledOnce();
    expect(openCodeSessionManager[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });
});
