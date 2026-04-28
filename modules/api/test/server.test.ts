import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockServe = vi.fn();
const mockCreateApp = vi.fn();
const mockCreateApiLogger = vi.fn();
const mockCreateDimensionRepository = vi.fn();
const mockCreateManagerStateRepository = vi.fn();
const mockCreateOpenCodeSessionRepository = vi.fn();
const mockCreateOpenCodeSessionManager = vi.fn();
const mockCreateOptimizerLaneStateRepository = vi.fn();
const mockCreateTaskRepository = vi.fn();
const mockCreateTaskScheduler = vi.fn();
const mockCreateTaskSessionCoordinator = vi.fn();
const mockCreateAgentSessionCoordinator = vi.fn();
const mockCreateCoordinator = vi.fn();
const mockCreateManager = vi.fn();
const mockEnsureProjectWorkspace = vi.fn();

const configuredProject = {
  created_at: "2026-04-26T00:00:00.000Z",
  global_model_id: "claude-sonnet-4-5",
  global_provider_id: "anthropic",
  git_origin_url: "https://github.com/example/main.git",
  id: "00000000-0000-4000-8000-000000000001",
  name: "Main project",
  optimizer_enabled: false,
  updated_at: "2026-04-26T00:00:00.000Z",
};
const secondConfiguredProject = {
  created_at: "2026-04-26T00:00:01.000Z",
  global_model_id: "gpt-5.1",
  global_provider_id: "openai",
  git_origin_url: "https://github.com/example/second.git",
  id: "00000000-0000-4000-8000-000000000002",
  name: "Second project",
  optimizer_enabled: false,
  updated_at: "2026-04-26T00:00:01.000Z",
};
const unconfiguredProject = {
  created_at: "2026-04-26T00:00:02.000Z",
  global_model_id: " ",
  global_provider_id: "anthropic",
  git_origin_url: "https://github.com/example/unconfigured.git",
  id: "00000000-0000-4000-8000-000000000003",
  name: "Unconfigured project",
  optimizer_enabled: false,
  updated_at: "2026-04-26T00:00:02.000Z",
};
const optimizerEnabledProject = {
  ...configuredProject,
  optimizer_enabled: true,
};

const createAppMock = () => ({
  [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
  fetch: vi.fn(),
});

const createRepositoryMock = (projects = [configuredProject]) => ({
  [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
  listProjects: () => projects,
});

const createDimensionRepositoryMock = () => ({
  [Symbol.asyncDispose]: vi.fn(),
  listUnevaluatedDimensionIds: vi.fn(),
});

const createOpenCodeSessionRepositoryMock = () => ({
  [Symbol.asyncDispose]: vi.fn(),
});

const createOptimizerLaneStateRepositoryMock = () => ({
  [Symbol.asyncDispose]: vi.fn(),
});

const createManagerStateRepositoryMock = () => ({
  [Symbol.asyncDispose]: vi.fn(),
  clearManagerState: vi.fn(),
  getManagerState: vi.fn(),
  upsertManagerState: vi.fn(),
});

vi.mock("../src/coordinator.js", () => ({
  createCoordinator: mockCreateCoordinator,
}));

vi.mock("../src/manager.js", () => ({
  createManager: mockCreateManager,
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

vi.mock("../src/dimension-repository.js", () => ({
  createDimensionRepository: mockCreateDimensionRepository,
}));

vi.mock("../src/manager-state-repository.js", () => ({
  createManagerStateRepository: mockCreateManagerStateRepository,
}));

vi.mock("../src/opencode-session-repository.js", () => ({
  createOpenCodeSessionRepository: mockCreateOpenCodeSessionRepository,
}));

vi.mock("../src/opencode-session-manager.js", () => ({
  createOpenCodeSessionManager: mockCreateOpenCodeSessionManager,
}));

vi.mock("../src/optimizer-lane-state-repository.js", () => ({
  createOptimizerLaneStateRepository: mockCreateOptimizerLaneStateRepository,
}));

vi.mock("../src/task-repository.js", () => ({
  createTaskRepository: mockCreateTaskRepository,
}));

vi.mock("../src/task-scheduler.js", () => ({
  createTaskScheduler: mockCreateTaskScheduler,
}));

vi.mock("../src/project-workspace.js", () => ({
  ensureProjectWorkspace: mockEnsureProjectWorkspace,
}));

describe("server startup", () => {
  beforeEach(() => {
    mockEnsureProjectWorkspace.mockResolvedValue("/aim/projects/main");
    mockCreateDimensionRepository.mockReturnValue(
      createDimensionRepositoryMock(),
    );
    mockCreateOpenCodeSessionRepository.mockReturnValue(
      createOpenCodeSessionRepositoryMock(),
    );
    mockCreateOpenCodeSessionManager.mockReturnValue({
      [Symbol.asyncDispose]: vi.fn(),
      createSession: vi.fn(),
    });
    mockCreateOptimizerLaneStateRepository.mockReturnValue(
      createOptimizerLaneStateRepositoryMock(),
    );
    mockCreateManagerStateRepository.mockReturnValue(
      createManagerStateRepositoryMock(),
    );
    mockCreateManager.mockReturnValue({
      [Symbol.asyncDispose]: vi.fn(),
      getStatus: vi.fn(() => ({
        last_error: null,
        last_scan_at: null,
        running: true,
      })),
    });
    mockCreateCoordinator.mockReturnValue({
      [Symbol.asyncDispose]: vi.fn(),
    });
  });

  afterEach(() => {
    delete process.env.OPENCODE_BASE_URL;
    delete process.env.OPENCODE_SESSION_IDLE_FALLBACK_TIMEOUT_MS;
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("uses the standard async disposable stack for api resource ownership", async () => {
    const serverSource = await readFile(
      new URL("../src/server.ts", import.meta.url),
      "utf8",
    );
    const appSource = await readFile(
      new URL("../src/app.ts", import.meta.url),
      "utf8",
    );

    expect(serverSource).toContain("new AsyncDisposableStack()");
    expect(appSource).toContain("new AsyncDisposableStack()");
    expect(`${serverSource}\n${appSource}`).not.toMatch(
      /createAsyncResourceScope|useResource/,
    );
  });

  it("only exposes startServer as an async disposable lifecycle contract", async () => {
    const source = await readFile(
      new URL("../src/server.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain(
      "export const startServer = (): AsyncDisposable =>",
    );
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

    mockCreateApp.mockReturnValue(createAppMock());
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(createRepositoryMock());
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});

    const { startServer } = await import("../src/server.js");

    startServer();

    expect(mockCreateOpenCodeSessionManager).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:54321",
      repository: expect.any(Object),
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

    mockCreateApp.mockReturnValue(createAppMock());
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(createRepositoryMock());
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});

    const { startServer } = await import("../src/server.js");

    expect(() => startServer()).not.toThrow();
    expect(mockCreateOpenCodeSessionManager).toHaveBeenCalledWith({
      baseUrl: "http://localhost:4096",
      repository: expect.any(Object),
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

    mockCreateApp.mockReturnValue(createAppMock());
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(createRepositoryMock());
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});

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
    mockCreateApp.mockReturnValue(createAppMock());
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(
      createRepositoryMock([optimizerEnabledProject]),
    );
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});

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
    const coordinatorLane = {
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };

    mockCreateApiLogger.mockReturnValue(logger);
    mockCreateApp.mockReturnValue(createAppMock());
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(createRepositoryMock());
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockCreateCoordinator.mockReturnValueOnce(coordinatorLane);

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
    expect(coordinatorLane.start).not.toHaveBeenCalled();
    expect(scheduler.start).not.toHaveBeenCalled();
  });

  it("starts optimizer lanes when a configured project has persisted optimizer enablement", async () => {
    const server = {
      close: vi.fn(),
      once: vi.fn(),
    };
    const scheduler = {
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };
    const coordinatorLane = {
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };

    mockCreateApp.mockReturnValue(createAppMock());
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(
      createRepositoryMock([optimizerEnabledProject]),
    );
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockCreateCoordinator.mockReturnValueOnce(coordinatorLane);

    const { startServer } = await import("../src/server.js");

    startServer();

    expect(mockCreateManager).toHaveBeenCalledWith(
      expect.objectContaining({ project: optimizerEnabledProject }),
    );
    expect(scheduler.start).toHaveBeenCalledOnce();
    expect(
      mockCreateApp.mock.calls[0]?.[0].optimizerRuntime.getStatus(),
    ).toMatchObject({
      running: true,
    });
  });

  it("creates coordinator and developer lanes without a task producer", async () => {
    const server = {
      close: vi.fn(),
      once: vi.fn(),
    };
    const scheduler = {
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };

    mockCreateApp.mockReturnValue(createAppMock());
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(
      createRepositoryMock([optimizerEnabledProject]),
    );
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});

    const { startServer } = await import("../src/server.js");

    expect(() => startServer()).not.toThrow();
    expect(mockCreateTaskScheduler).toHaveBeenCalledTimes(1);
    expect(mockCreateTaskScheduler).toHaveBeenCalledWith(
      expect.not.objectContaining({ taskProducer: expect.anything() }),
    );
    expect(mockCreateManager).toHaveBeenCalledWith(
      expect.objectContaining({ project: optimizerEnabledProject }),
    );
    expect(mockCreateCoordinator).toHaveBeenCalledWith(
      optimizerEnabledProject.id,
      expect.objectContaining({ taskRepository: expect.any(Object) }),
    );
    expect(scheduler.start).toHaveBeenCalledOnce();
  });

  it("wires the coordinator component to shared optimizer state", async () => {
    const server = {
      close: vi.fn(),
      once: vi.fn(),
    };
    const scheduler = {
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };
    const openCodeSessionRepository = createOpenCodeSessionRepositoryMock();
    const optimizerLaneStateRepository =
      createOptimizerLaneStateRepositoryMock();
    const taskRepository = createRepositoryMock([optimizerEnabledProject]);
    const dimensionRepository = createDimensionRepositoryMock();

    mockCreateApp.mockReturnValue(createAppMock());
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(taskRepository);
    mockCreateDimensionRepository.mockReturnValue(dimensionRepository);
    mockCreateOpenCodeSessionRepository.mockReturnValue(
      openCodeSessionRepository,
    );
    mockCreateOptimizerLaneStateRepository.mockReturnValue(
      optimizerLaneStateRepository,
    );
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});

    const { startServer } = await import("../src/server.js");

    startServer();

    const openCodeSessionManager =
      mockCreateOpenCodeSessionManager.mock.results[0]?.value;

    expect(mockCreateCoordinator).toHaveBeenCalledWith(
      optimizerEnabledProject.id,
      expect.objectContaining({
        dimensionRepository,
        projectDirectory: expect.any(Function),
        sessionManager: openCodeSessionManager,
        taskRepository,
      }),
    );
    expect(openCodeSessionRepository).toBeDefined();
    expect(optimizerLaneStateRepository).toBeDefined();
  });

  it("does not create stale manager evaluation lanes", async () => {
    const server = {
      close: vi.fn(),
      once: vi.fn(),
    };
    const scheduler = {
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };
    mockCreateApp.mockReturnValue(createAppMock());
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(createRepositoryMock());
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});

    const { startServer } = await import("../src/server.js");

    startServer();

    expect(mockCreateManager).not.toHaveBeenCalled();
  });

  it("defers coordinator AIM-managed workspace creation until the coordinator lane scans", async () => {
    const server = {
      close: vi.fn(),
      once: vi.fn(),
    };
    const scheduler = {
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };

    mockCreateApp.mockReturnValue(createAppMock());
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(
      createRepositoryMock([optimizerEnabledProject]),
    );
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockEnsureProjectWorkspace.mockResolvedValue("/aim/projects/main");

    const { startServer } = await import("../src/server.js");

    startServer();

    expect(mockEnsureProjectWorkspace).not.toHaveBeenCalled();

    const coordinatorConfigs = mockCreateCoordinator.mock.calls.map(
      ([, config]) => config,
    );

    await coordinatorConfigs[0].projectDirectory();

    expect(mockEnsureProjectWorkspace).toHaveBeenCalledTimes(1);
    expect(mockEnsureProjectWorkspace).toHaveBeenCalledWith({
      git_origin_url: optimizerEnabledProject.git_origin_url,
      project_id: optimizerEnabledProject.id,
    });
  });

  it("creates coordinator lanes for every configured project", async () => {
    const server = {
      close: vi.fn(),
      once: vi.fn(),
    };
    const scheduler = {
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };

    mockCreateApp.mockReturnValue(createAppMock());
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(
      createRepositoryMock([
        optimizerEnabledProject,
        { ...secondConfiguredProject, optimizer_enabled: true },
        unconfiguredProject,
      ]),
    );
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockEnsureProjectWorkspace
      .mockResolvedValueOnce("/aim/projects/main")
      .mockResolvedValueOnce("/aim/projects/second")
      .mockResolvedValueOnce("/aim/projects/main")
      .mockResolvedValueOnce("/aim/projects/second");

    const { startServer } = await import("../src/server.js");

    startServer();

    const coordinatorConfigs = mockCreateCoordinator.mock.calls.map(
      ([projectId, config]) => ({ config, projectId }),
    );

    expect(coordinatorConfigs.map(({ projectId }) => projectId)).toEqual([
      optimizerEnabledProject.id,
      secondConfiguredProject.id,
    ]);
    expect(mockCreateManager).toHaveBeenCalledTimes(2);

    for (const { config } of coordinatorConfigs) {
      await config.projectDirectory();
    }

    expect(mockEnsureProjectWorkspace).toHaveBeenCalledTimes(2);
    expect(mockEnsureProjectWorkspace).toHaveBeenCalledWith({
      git_origin_url: optimizerEnabledProject.git_origin_url,
      project_id: optimizerEnabledProject.id,
    });
    expect(mockEnsureProjectWorkspace).toHaveBeenCalledWith({
      git_origin_url: secondConfiguredProject.git_origin_url,
      project_id: secondConfiguredProject.id,
    });
    expect(mockEnsureProjectWorkspace).not.toHaveBeenCalledWith({
      git_origin_url: unconfiguredProject.git_origin_url,
      project_id: unconfiguredProject.id,
    });
  });

  it("uses empty project lanes when no projects are configured", async () => {
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const server = {
      close: vi.fn((callback?: () => void) => {
        callback?.();
      }),
      once: vi.fn(),
    };
    const scheduler = {
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };

    mockCreateApiLogger.mockReturnValue(logger);
    mockCreateApp.mockReturnValue(createAppMock());
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(
      createRepositoryMock([unconfiguredProject]),
    );
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});

    const { startServer } = await import("../src/server.js");

    const serverRuntime = startServer();
    const optimizerRuntime = mockCreateApp.mock.calls[0]?.[0].optimizerRuntime;

    optimizerRuntime.start();

    expect(optimizerRuntime.getStatus()).toMatchObject({
      lanes: {
        coordinator_task_pool: {
          last_error: null,
          running: false,
        },
        developer_follow_up: { running: true },
        manager_evaluation: {
          last_error: null,
          running: false,
        },
      },
      running: true,
    });

    await serverRuntime[Symbol.asyncDispose]();
  });

  it("wires the coordinator component instead of the legacy task-pool lane", async () => {
    const server = {
      close: vi.fn(),
      once: vi.fn(),
    };
    const scheduler = {
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };

    mockCreateApp.mockReturnValue(createAppMock());
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(
      createRepositoryMock([optimizerEnabledProject]),
    );
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});

    const { startServer } = await import("../src/server.js");

    startServer();

    expect(mockCreateCoordinator).toHaveBeenCalledWith(
      optimizerEnabledProject.id,
      expect.objectContaining({
        projectDirectory: expect.any(Function),
      }),
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

    mockCreateApp.mockReturnValue(createAppMock());
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
    const coordinatorLane = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };

    mockCreateApp.mockReturnValue(createAppMock());
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(
      createRepositoryMock([optimizerEnabledProject]),
    );
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockCreateCoordinator.mockReturnValueOnce(coordinatorLane);

    const { startServer } = await import("../src/server.js");

    await (async () => {
      await using _runtime = startServer();
    })();

    expect(close).toHaveBeenCalledOnce();
    expect(coordinatorLane[Symbol.asyncDispose]).toHaveBeenCalled();
    expect(scheduler[Symbol.asyncDispose]).toHaveBeenCalledOnce();
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
    mockCreateTaskRepository.mockReturnValue(
      createRepositoryMock([optimizerEnabledProject]),
    );
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});

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
      ...createRepositoryMock([optimizerEnabledProject]),
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
    const coordinatorLane = {
      [Symbol.asyncDispose]: vi.fn(async () => {
        cleanupOrder.push("coordinator:dispose");
      }),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };

    mockCreateApp.mockReturnValue(createAppMock());
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(taskRepository);
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockCreateCoordinator.mockReturnValueOnce(coordinatorLane);

    const { startServer } = await import("../src/server.js");

    await (async () => {
      await using _runtime = startServer();
    })();

    expect(cleanupOrder).toEqual([
      "server:close",
      "scheduler:dispose",
      "coordinator:dispose",
      "coordinator:dispose",
      "repository:dispose",
    ]);
    expect(taskRepository[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("eventually shares cleanup when the HTTP server closes before async disposal", async () => {
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
      ...createRepositoryMock([optimizerEnabledProject]),
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    };
    const scheduler = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };
    const coordinatorLane = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };

    mockCreateApp.mockReturnValue(createAppMock());
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(taskRepository);
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockCreateCoordinator.mockReturnValueOnce(coordinatorLane);

    const { startServer } = await import("../src/server.js");

    const runtime = startServer();
    server.close();
    await runtime[Symbol.asyncDispose]();

    expect(close).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(scheduler[Symbol.asyncDispose]).toHaveBeenCalledOnce();
      expect(coordinatorLane[Symbol.asyncDispose]).toHaveBeenCalled();
      expect(taskRepository[Symbol.asyncDispose]).toHaveBeenCalledOnce();
    });
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

    mockCreateApp.mockReturnValue(createAppMock());
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(taskRepository);
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});

    const { startServer } = await import("../src/server.js");

    const runtime = startServer();
    expect(process.listenerCount("SIGINT")).toBe(sigintListeners + 1);
    expect(process.listenerCount("SIGTERM")).toBe(sigtermListeners + 1);

    await runtime[Symbol.asyncDispose]();

    expect(process.listenerCount("SIGINT")).toBe(sigintListeners);
    expect(process.listenerCount("SIGTERM")).toBe(sigtermListeners);
  });
});
