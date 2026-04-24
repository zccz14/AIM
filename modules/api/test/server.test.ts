import { afterEach, describe, expect, it, vi } from "vitest";

const mockServe = vi.fn();
const mockCreateApp = vi.fn();
const mockCreateApiLogger = vi.fn();
const mockCreateTaskRepository = vi.fn();
const mockCreateTaskScheduler = vi.fn();
const mockCreateTaskSessionCoordinator = vi.fn();

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
    delete process.env.TASK_SCHEDULER_ENABLED;
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("passes explicit coordinator config when scheduler is enabled", async () => {
    process.env.TASK_SCHEDULER_ENABLED = "true";
    process.env.OPENCODE_BASE_URL = "http://127.0.0.1:54321";
    process.env.OPENCODE_SESSION_IDLE_FALLBACK_TIMEOUT_MS = "60000";

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
    mockCreateTaskRepository.mockReturnValue({});
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});

    const { startServer } = await import("../src/server.js");

    startServer();

    expect(mockCreateTaskSessionCoordinator).toHaveBeenCalledWith({
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
      start: vi.fn(),
      stop: vi.fn(),
    };

    mockCreateApp.mockReturnValue({ fetch: vi.fn() });
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue({});
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});

    const { startServer } = await import("../src/server.js");

    expect(() => startServer()).not.toThrow();
    expect(mockCreateTaskSessionCoordinator).toHaveBeenCalledWith({
      baseUrl: "http://localhost:4096",
      sessionIdleFallbackTimeoutMs: undefined,
    });
  });

  it("does not require provider or model env vars when scheduler is enabled", async () => {
    process.env.TASK_SCHEDULER_ENABLED = "true";

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
    mockCreateTaskRepository.mockReturnValue({});
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});

    const { startServer } = await import("../src/server.js");

    expect(() => startServer()).not.toThrow();
  });

  it("creates one api logger and passes it to app and scheduler", async () => {
    process.env.TASK_SCHEDULER_ENABLED = "true";
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
    mockCreateTaskRepository.mockReturnValue({});
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});

    const { startServer } = await import("../src/server.js");

    startServer();

    expect(mockCreateApiLogger).toHaveBeenCalledTimes(1);
    expect(mockCreateApp).toHaveBeenCalledWith({ logger });
    expect(mockCreateTaskScheduler).toHaveBeenCalledWith(
      expect.objectContaining({ logger }),
    );
  });

  it("does not read config or construct scheduler dependencies when disabled", async () => {
    process.env.TASK_SCHEDULER_ENABLED = "false";

    const server = {
      close: vi.fn(),
      once: vi.fn(),
    };

    mockCreateApp.mockReturnValue({ fetch: vi.fn() });
    mockServe.mockReturnValue(server);

    const { startServer } = await import("../src/server.js");

    expect(() => startServer()).not.toThrow();
    expect(mockCreateTaskRepository).not.toHaveBeenCalled();
    expect(mockCreateTaskSessionCoordinator).not.toHaveBeenCalled();
    expect(mockCreateTaskScheduler).not.toHaveBeenCalled();
  });
  it("does not leave the server listening when scheduler startup fails", async () => {
    process.env.TASK_SCHEDULER_ENABLED = "true";
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
