import { afterEach, describe, expect, it, vi } from "vitest";

const mockServe = vi.fn();
const mockCreateApp = vi.fn();
const mockCreateApiLogger = vi.fn();
const mockCreateTaskRepository = vi.fn();
const mockCreateTaskScheduler = vi.fn();
const mockCreateTaskSessionCoordinator = vi.fn();
const mockCreateAgentSessionCoordinator = vi.fn();
const mockCreateAgentSessionLane = vi.fn();

const configuredProject = {
  created_at: "2026-04-26T00:00:00.000Z",
  global_model_id: "claude-sonnet-4-5",
  global_provider_id: "anthropic",
  id: "project-main",
  name: "Main project",
  project_path: "/repo/main",
  updated_at: "2026-04-26T00:00:00.000Z",
};

const createRepositoryMock = () => ({
  getFirstProject: () => configuredProject,
});

vi.mock("../src/agent-session-coordinator.js", () => ({
  createAgentSessionCoordinator: mockCreateAgentSessionCoordinator,
}));

vi.mock("../src/agent-session-lane.js", () => ({
  createAgentSessionLane: mockCreateAgentSessionLane,
}));

vi.mock("@hono/node-server", () => ({
  serve: mockServe,
}));

vi.mock("../src/app.js", () => ({
  createApp: mockCreateApp,
}));

vi.mock("../src/logger.js", () => ({
  createApiLogger: mockCreateApiLogger,
}));

vi.mock("../src/task-repository.js", () => ({
  createTaskRepository: mockCreateTaskRepository,
}));

vi.mock("../src/task-scheduler.js", () => ({
  createTaskScheduler: mockCreateTaskScheduler,
}));

vi.mock("../src/task-session-coordinator.js", () => ({
  createTaskSessionCoordinator: mockCreateTaskSessionCoordinator,
}));

describe("server startup", () => {
  afterEach(() => {
    delete process.env.OPENCODE_BASE_URL;
    delete process.env.OPENCODE_SESSION_IDLE_FALLBACK_TIMEOUT_MS;
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("passes explicit OpenCode config to all optimizer lane coordinators", async () => {
    process.env.OPENCODE_BASE_URL = "http://127.0.0.1:54321";
    process.env.OPENCODE_SESSION_IDLE_FALLBACK_TIMEOUT_MS = "60000";

    const server = {
      close: vi.fn(),
      once: vi.fn(),
    };
    const scheduler = {
      scanOnce: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    mockCreateApp.mockReturnValue({ fetch: vi.fn() });
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(createRepositoryMock());
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionLane.mockReturnValue({
      scanOnce: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    });

    const { startServer } = await import("../src/server.js");

    startServer();

    expect(mockCreateTaskSessionCoordinator).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:54321",
      sessionIdleFallbackTimeoutMs: 60000,
    });
    expect(mockCreateAgentSessionCoordinator).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:54321",
      sessionIdleFallbackTimeoutMs: 60000,
    });
  });

  it("defaults scheduler enablement and base url when env vars are unset", async () => {
    const server = {
      close: vi.fn(),
      once: vi.fn(),
    };
    const scheduler = {
      scanOnce: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    mockCreateApp.mockReturnValue({ fetch: vi.fn() });
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(createRepositoryMock());
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionLane.mockReturnValue({
      scanOnce: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    });

    const { startServer } = await import("../src/server.js");

    expect(() => startServer()).not.toThrow();
    expect(mockCreateTaskSessionCoordinator).toHaveBeenCalledWith({
      baseUrl: "http://localhost:4096",
      sessionIdleFallbackTimeoutMs: undefined,
    });
  });

  it("does not require provider or model env vars at optimizer startup", async () => {
    const server = {
      close: vi.fn(),
      once: vi.fn(),
    };
    const scheduler = {
      start: vi.fn(),
      stop: vi.fn(),
    };

    mockCreateApp.mockReturnValue({ fetch: vi.fn() });
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(createRepositoryMock());
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionLane.mockReturnValue({
      scanOnce: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    });

    const { startServer } = await import("../src/server.js");

    expect(() => startServer()).not.toThrow();
  });

  it("creates one api logger and passes it to app and scheduler", async () => {
    process.env.OPENCODE_BASE_URL = "http://127.0.0.1:54321";

    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const server = {
      close: vi.fn(),
      once: vi.fn(),
    };
    const scheduler = {
      start: vi.fn(),
      stop: vi.fn(),
    };

    mockCreateApiLogger.mockReturnValue(logger);
    mockCreateApp.mockReturnValue({ fetch: vi.fn() });
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(createRepositoryMock());
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionLane.mockReturnValue({
      scanOnce: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    });

    const { startServer } = await import("../src/server.js");

    startServer();

    expect(mockCreateApiLogger).toHaveBeenCalledTimes(1);
    expect(mockCreateApp).toHaveBeenCalledWith(
      expect.objectContaining({
        logger,
        onTaskResolved: expect.any(Function),
        optimizerRuntime: expect.objectContaining({
          getStatus: expect.any(Function),
          handleEvent: expect.any(Function),
          start: expect.any(Function),
          stop: expect.any(Function),
        }),
      }),
    );
    expect(mockCreateTaskScheduler).toHaveBeenCalledWith(
      expect.objectContaining({ logger }),
    );
  });

  it("starts all optimizer lanes by default", async () => {
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const server = {
      close: vi.fn(),
      once: vi.fn(),
    };
    const scheduler = {
      scanOnce: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const managerLane = {
      scanOnce: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const coordinatorLane = {
      scanOnce: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    mockCreateApiLogger.mockReturnValue(logger);
    mockCreateApp.mockReturnValue({ fetch: vi.fn() });
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(createRepositoryMock());
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionLane
      .mockReturnValueOnce(managerLane)
      .mockReturnValueOnce(coordinatorLane);

    const { startServer } = await import("../src/server.js");

    startServer();

    expect(mockCreateApp).toHaveBeenCalledWith(
      expect.objectContaining({
        logger,
        onTaskResolved: expect.any(Function),
        optimizerRuntime: expect.objectContaining({
          getStatus: expect.any(Function),
          handleEvent: expect.any(Function),
          start: expect.any(Function),
          stop: expect.any(Function),
        }),
      }),
    );
    expect(managerLane.start).toHaveBeenCalledWith({ intervalMs: 5_000 });
    expect(coordinatorLane.start).toHaveBeenCalledWith({ intervalMs: 5_000 });
    expect(scheduler.start).toHaveBeenCalledWith({ intervalMs: 5_000 });
  });

  it("creates manager, coordinator, and developer lanes without a task producer", async () => {
    const server = {
      close: vi.fn(),
      once: vi.fn(),
    };
    const scheduler = {
      scanOnce: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    mockCreateApp.mockReturnValue({ fetch: vi.fn() });
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(createRepositoryMock());
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionLane.mockReturnValue({
      scanOnce: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    });

    const { startServer } = await import("../src/server.js");

    expect(() => startServer()).not.toThrow();
    expect(mockCreateTaskScheduler).toHaveBeenCalledTimes(1);
    expect(mockCreateTaskScheduler).toHaveBeenCalledWith(
      expect.not.objectContaining({ taskProducer: expect.anything() }),
    );
    expect(mockCreateAgentSessionLane).toHaveBeenCalledWith(
      expect.objectContaining({ laneName: "manager_evaluation" }),
    );
    expect(mockCreateAgentSessionLane).toHaveBeenCalledWith(
      expect.objectContaining({ laneName: "coordinator_task_pool" }),
    );
    expect(scheduler.start).toHaveBeenCalledWith({ intervalMs: 5_000 });
  });

  it("instructs the coordinator lane to use concrete Task Write Bulk intent instead of optimizer-loop placeholders", async () => {
    const server = {
      close: vi.fn(),
      once: vi.fn(),
    };
    const scheduler = {
      scanOnce: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    mockCreateApp.mockReturnValue({ fetch: vi.fn() });
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(createRepositoryMock());
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionLane.mockReturnValue({
      scanOnce: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    });

    const { startServer } = await import("../src/server.js");

    startServer();

    const coordinatorLaneConfig = mockCreateAgentSessionLane.mock.calls.find(
      ([config]) => config.laneName === "coordinator_task_pool",
    )?.[0];

    expect(coordinatorLaneConfig?.prompt).toContain(
      "form a concrete Task Write Bulk intent",
    );
    expect(coordinatorLaneConfig?.prompt).toContain(
      "Reject or record feedback for generic optimizer-loop Tasks",
    );
    expect(coordinatorLaneConfig?.prompt).toContain(
      'Do not create a "Continue AIM optimizer loop"',
    );
    expect(coordinatorLaneConfig?.prompt).toContain(
      "Do not bypass Task Write Bulk approval or independent Task Spec validation",
    );
  });

  it("does not leave the server listening when scheduler startup fails", async () => {
    process.env.OPENCODE_BASE_URL = "http://127.0.0.1:54321";

    let listening = false;
    const close = vi.fn(() => {
      listening = false;
    });
    const server = {
      close,
      once: vi.fn(),
    };

    mockCreateApp.mockReturnValue({ fetch: vi.fn() });
    mockServe.mockImplementation(() => {
      listening = true;
      return server;
    });
    mockCreateTaskRepository.mockImplementation(() => {
      throw new Error("tasks schema is incompatible");
    });

    const { startServer } = await import("../src/server.js");

    expect(() => startServer()).toThrow(/tasks schema is incompatible/);
    expect(listening).toBe(false);
  });
});
