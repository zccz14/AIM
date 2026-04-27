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
  git_origin_url: "https://github.com/example/main.git",
  id: "00000000-0000-4000-8000-000000000001",
  name: "Main project",
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
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };

    mockCreateApp.mockReturnValue({ fetch: vi.fn() });
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(createRepositoryMock());
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionLane.mockReturnValue({
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
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
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };

    mockCreateApp.mockReturnValue({ fetch: vi.fn() });
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(createRepositoryMock());
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionLane.mockReturnValue({
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
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
      [Symbol.asyncDispose]: vi.fn(),
      start: vi.fn(),
    };

    mockCreateApp.mockReturnValue({ fetch: vi.fn() });
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(createRepositoryMock());
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionLane.mockReturnValue({
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
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
      [Symbol.asyncDispose]: vi.fn(),
      start: vi.fn(),
    };

    mockCreateApiLogger.mockReturnValue(logger);
    mockCreateApp.mockReturnValue({ fetch: vi.fn() });
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(createRepositoryMock());
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionLane.mockReturnValue({
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
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
          disable: expect.any(Function),
        }),
      }),
    );
    expect(mockCreateTaskScheduler).toHaveBeenCalledWith(
      expect.objectContaining({ logger }),
    );
  });

  it("does not start optimizer lanes by default when enablement is not persisted", async () => {
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
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };
    const managerLane = {
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };
    const coordinatorLane = {
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
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
          disable: expect.any(Function),
        }),
      }),
    );
    expect(managerLane.start).not.toHaveBeenCalled();
    expect(coordinatorLane.start).not.toHaveBeenCalled();
    expect(scheduler.start).not.toHaveBeenCalled();
  });

  it("creates manager, coordinator, and developer lanes without a task producer", async () => {
    const server = {
      close: vi.fn(),
      once: vi.fn(),
    };
    const scheduler = {
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };

    mockCreateApp.mockReturnValue({ fetch: vi.fn() });
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(createRepositoryMock());
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionLane.mockReturnValue({
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
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
    expect(scheduler.start).not.toHaveBeenCalled();
  });

  it("instructs the coordinator lane to use concrete task batch operations instead of optimizer-loop placeholders", async () => {
    const server = {
      close: vi.fn(),
      once: vi.fn(),
    };
    const scheduler = {
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };

    mockCreateApp.mockReturnValue({ fetch: vi.fn() });
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(createRepositoryMock());
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionLane.mockReturnValue({
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
    });

    const { startServer } = await import("../src/server.js");

    startServer();

    const coordinatorLaneConfig = mockCreateAgentSessionLane.mock.calls.find(
      ([config]) => config.laneName === "coordinator_task_pool",
    )?.[0];

    expect(coordinatorLaneConfig?.prompt).toContain(
      "form concrete POST /tasks/batch operations",
    );
    expect(coordinatorLaneConfig?.prompt).toContain(
      "Reject or record feedback for generic optimizer-loop Tasks",
    );
    expect(coordinatorLaneConfig?.prompt).toContain(
      'Do not create a "Continue AIM optimizer loop"',
    );
    expect(coordinatorLaneConfig?.prompt).toContain(
      "Do not bypass POST /tasks/batch approval or independent Task Spec validation",
    );
    expect(coordinatorLaneConfig?.prompt).toMatch(
      /Developer lane[\s\S]*actionable Tasks/i,
    );
    expect(coordinatorLaneConfig?.prompt).toMatch(
      /dimensions[\s\S]*dimension_evaluations[\s\S]*planning signal/i,
    );
    expect(coordinatorLaneConfig?.prompt).toMatch(
      /one dimension at a time[\s\S]*dimension source[\s\S]*priority/i,
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

  it("supports await using cleanup for the listening server and optimizer runtime", async () => {
    const close = vi.fn((callback?: () => void) => {
      callback?.();
    });
    const server = {
      close,
      once: vi.fn(),
    };
    const scheduler = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };
    const managerLane = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };
    const coordinatorLane = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };

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

    await (async () => {
      await using _runtime = startServer();
    })();

    expect(close).toHaveBeenCalledOnce();
    expect(managerLane[Symbol.asyncDispose]).not.toHaveBeenCalled();
    expect(coordinatorLane[Symbol.asyncDispose]).not.toHaveBeenCalled();
    expect(scheduler[Symbol.asyncDispose]).not.toHaveBeenCalled();
  });

  it("disposes the app resource during await using server cleanup", async () => {
    const app = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      fetch: vi.fn(),
    };
    const close = vi.fn((callback?: () => void) => {
      callback?.();
    });
    const server = {
      close,
      once: vi.fn(),
    };
    const scheduler = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };

    mockCreateApp.mockReturnValue(app);
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(createRepositoryMock());
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionLane.mockReturnValue({
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn(),
      start: vi.fn(),
    });

    const { startServer } = await import("../src/server.js");

    await (async () => {
      await using _server = startServer();
    })();

    expect(app[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("releases server-owned resources after closing traffic without disabling optimizer lanes twice", async () => {
    const cleanupOrder: string[] = [];
    const close = vi.fn((callback?: () => void) => {
      cleanupOrder.push("server:close");
      callback?.();
    });
    const server = {
      close,
      once: vi.fn(),
    };
    const taskRepository = {
      ...createRepositoryMock(),
      [Symbol.asyncDispose]: vi.fn(async () => {
        cleanupOrder.push("repository:dispose");
      }),
    };
    const scheduler = {
      [Symbol.asyncDispose]: vi.fn(async () => {
        cleanupOrder.push("scheduler:dispose");
      }),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };
    const managerLane = {
      [Symbol.asyncDispose]: vi.fn(async () => {
        cleanupOrder.push("manager:dispose");
      }),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };
    const coordinatorLane = {
      [Symbol.asyncDispose]: vi.fn(async () => {
        cleanupOrder.push("coordinator:dispose");
      }),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };

    mockCreateApp.mockReturnValue({ fetch: vi.fn() });
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(taskRepository);
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionLane
      .mockReturnValueOnce(managerLane)
      .mockReturnValueOnce(coordinatorLane);

    const { startServer } = await import("../src/server.js");

    await (async () => {
      await using _runtime = startServer();
    })();

    expect(cleanupOrder).toEqual(["server:close", "repository:dispose"]);
    expect(taskRepository[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("shares cleanup when the HTTP server closes before async disposal", async () => {
    let closeHandler: (() => void) | undefined;
    let closed = false;
    const close = vi.fn((callback?: () => void) => {
      if (!closed) {
        closed = true;
        closeHandler?.();
      }

      callback?.();
    });
    const server = {
      close,
      once: vi.fn((event: string, handler: () => void) => {
        if (event === "close") {
          closeHandler = handler;
        }
      }),
    };
    const taskRepository = {
      ...createRepositoryMock(),
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    };
    const scheduler = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };
    const managerLane = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };
    const coordinatorLane = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };

    mockCreateApp.mockReturnValue({ fetch: vi.fn() });
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(taskRepository);
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionLane
      .mockReturnValueOnce(managerLane)
      .mockReturnValueOnce(coordinatorLane);

    const { startServer } = await import("../src/server.js");

    const runtime = startServer();
    server.close();
    await runtime[Symbol.asyncDispose]();

    expect(close).toHaveBeenCalledOnce();
    expect(scheduler[Symbol.asyncDispose]).not.toHaveBeenCalled();
    expect(managerLane[Symbol.asyncDispose]).not.toHaveBeenCalled();
    expect(coordinatorLane[Symbol.asyncDispose]).not.toHaveBeenCalled();
    expect(taskRepository[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("removes startServer signal handlers during async disposal", async () => {
    const sigintListeners = process.listenerCount("SIGINT");
    const sigtermListeners = process.listenerCount("SIGTERM");
    const server = {
      close: vi.fn((callback?: () => void) => {
        callback?.();
      }),
      once: vi.fn(),
    };
    const taskRepository = {
      ...createRepositoryMock(),
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    };
    const scheduler = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };

    mockCreateApp.mockReturnValue({ fetch: vi.fn() });
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(taskRepository);
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionLane.mockReturnValue({
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn(),
      start: vi.fn(),
    });

    const { startServer } = await import("../src/server.js");

    const runtime = startServer();
    expect(process.listenerCount("SIGINT")).toBe(sigintListeners + 1);
    expect(process.listenerCount("SIGTERM")).toBe(sigtermListeners + 1);

    await runtime[Symbol.asyncDispose]();

    expect(process.listenerCount("SIGINT")).toBe(sigintListeners);
    expect(process.listenerCount("SIGTERM")).toBe(sigtermListeners);
  });
});
