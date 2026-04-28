import { describe, expect, it, vi } from "vitest";

const mockCreateAgentSessionCoordinator = vi.fn();
const mockCreateAgentSessionLane = vi.fn();
const mockCreateManager = vi.fn();
const mockCreateTaskScheduler = vi.fn();
const mockCreateTaskSessionCoordinator = vi.fn();
const mockEnsureProjectWorkspace = vi.fn();
const mockPrepareManagerLaneScanInput = vi.fn();

vi.mock("../src/agent-session-coordinator.js", () => ({
  createAgentSessionCoordinator: mockCreateAgentSessionCoordinator,
}));

vi.mock("../src/agent-session-lane.js", () => ({
  createAgentSessionLane: mockCreateAgentSessionLane,
}));

vi.mock("../src/manager.js", () => ({
  createManager: mockCreateManager,
}));

vi.mock("../src/task-scheduler.js", () => ({
  createTaskScheduler: mockCreateTaskScheduler,
}));

vi.mock("../src/task-session-coordinator.js", () => ({
  createTaskSessionCoordinator: mockCreateTaskSessionCoordinator,
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
  it("starts enabled optimizer lanes immediately and disposes them through the system lifecycle", async () => {
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const taskRepository = { listProjects: vi.fn(() => [configuredProject]) };
    const continuationSessionRepository = {};
    const dimensionRepository = {};
    const laneStateRepository = {};
    const scheduler = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };
    const managerLane = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn(),
      getStatus: vi.fn(() => ({
        last_error: null,
        last_scan_at: null,
        running: true,
      })),
    };
    const coordinatorLane = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };

    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockCreateManager.mockReturnValue(managerLane);
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateAgentSessionLane.mockReturnValueOnce(coordinatorLane);

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
      taskRepository,
    });

    expect(system.optimizerRuntime.getStatus()).toMatchObject({
      running: true,
    });
    expect(coordinatorLane.start).toHaveBeenCalledWith({ intervalMs: 5_000 });
    expect(scheduler.start).toHaveBeenCalledWith({ intervalMs: 5_000 });
    expect(mockCreateManager).toHaveBeenCalledWith(
      expect.objectContaining({
        coordinator: {},
        dimensionRepository,
        logger,
        project: configuredProject,
      }),
    );
    expect(mockCreateAgentSessionLane).not.toHaveBeenCalledWith(
      expect.objectContaining({ laneName: "manager_evaluation" }),
    );
    expect(mockCreateAgentSessionLane).toHaveBeenCalledWith(
      expect.objectContaining({
        continuationSessionRepository,
        laneName: "coordinator_task_pool",
        laneStateRepository,
        projectId: configuredProject.id,
      }),
    );

    await system[Symbol.asyncDispose]();

    expect(system.optimizerRuntime.getStatus()).toMatchObject({
      running: false,
    });
    expect(scheduler[Symbol.asyncDispose]).toHaveBeenCalledOnce();
    expect(managerLane[Symbol.asyncDispose]).toHaveBeenCalledOnce();
    expect(coordinatorLane[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });
});
