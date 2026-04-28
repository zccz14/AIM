import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockServe = vi.fn();
const mockCreateApp = vi.fn();
const mockCreateApiLogger = vi.fn();
const mockCreateDimensionRepository = vi.fn();
const mockCreateOpenCodeSessionRepository = vi.fn();
const mockCreateOptimizerLaneStateRepository = vi.fn();
const mockCreateTaskRepository = vi.fn();
const mockCreateTaskScheduler = vi.fn();
const mockCreateTaskSessionCoordinator = vi.fn();
const mockCreateAgentSessionCoordinator = vi.fn();
const mockCreateAgentSessionLane = vi.fn();
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

vi.mock("../src/dimension-repository.js", () => ({
  createDimensionRepository: mockCreateDimensionRepository,
}));

vi.mock("../src/opencode-session-repository.js", () => ({
  createOpenCodeSessionRepository: mockCreateOpenCodeSessionRepository,
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

vi.mock("../src/task-session-coordinator.js", () => ({
  createTaskSessionCoordinator: mockCreateTaskSessionCoordinator,
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
    mockCreateOptimizerLaneStateRepository.mockReturnValue(
      createOptimizerLaneStateRepositoryMock(),
    );
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

    mockCreateApp.mockReturnValue(createAppMock());
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

    mockCreateApp.mockReturnValue(createAppMock());
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
    mockCreateApp.mockReturnValue(createAppMock());
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
    mockCreateApp.mockReturnValue(createAppMock());
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

    mockCreateApp.mockReturnValue(createAppMock());
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(
      createRepositoryMock([optimizerEnabledProject]),
    );
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionLane
      .mockReturnValueOnce(managerLane)
      .mockReturnValueOnce(coordinatorLane);

    const { startServer } = await import("../src/server.js");

    startServer();

    expect(managerLane.start).toHaveBeenCalledOnce();
    expect(coordinatorLane.start).toHaveBeenCalledOnce();
    expect(scheduler.start).toHaveBeenCalledOnce();
    expect(
      mockCreateApp.mock.calls[0]?.[0].optimizerRuntime.getStatus(),
    ).toMatchObject({
      running: true,
    });
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

    mockCreateApp.mockReturnValue(createAppMock());
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

  it("wires the coordinator lane to persisted plugin continuation state", async () => {
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

    mockCreateApp.mockReturnValue(createAppMock());
    mockServe.mockReturnValue(server);
    mockCreateTaskRepository.mockReturnValue(createRepositoryMock());
    mockCreateOpenCodeSessionRepository.mockReturnValue(
      openCodeSessionRepository,
    );
    mockCreateOptimizerLaneStateRepository.mockReturnValue(
      optimizerLaneStateRepository,
    );
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

    expect(coordinatorLaneConfig).toMatchObject({
      continuationSessionRepository: openCodeSessionRepository,
      laneName: "coordinator_task_pool",
      laneStateRepository: optimizerLaneStateRepository,
      projectId: configuredProject.id,
    });
    expect(coordinatorLaneConfig?.prompt).toContain(
      "Write Task Pool operations through AIM API Server",
    );
    expect(coordinatorLaneConfig?.prompt).toContain(
      "Resolve or reject only to terminate the OpenCode session promise",
    );
    expect(coordinatorLaneConfig?.prompt).toContain(
      "do not put Task Pool operations or other Coordinator business output in the resolved value",
    );
  });

  it("guards manager lane appends with README claim-to-evidence protocol", async () => {
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
    mockCreateAgentSessionLane.mockReturnValue({
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
    });

    const { startServer } = await import("../src/server.js");

    startServer();

    const managerLaneConfig = mockCreateAgentSessionLane.mock.calls.find(
      ([config]) => config.laneName === "manager_evaluation",
    )?.[0];

    expect(managerLaneConfig?.prompt).toContain(
      "Before every dimension_evaluations append",
    );
    expect(managerLaneConfig?.prompt).toContain(
      "README claim-to-evidence protocol",
    );
    expect(managerLaneConfig?.prompt).toMatch(
      /aligned[\s\S]*readme_ahead[\s\S]*baseline_ahead[\s\S]*conflicted[\s\S]*ambiguous[\s\S]*prerequisite_gap/,
    );
    expect(managerLaneConfig?.prompt).toContain("evidence source or limit");
    expect(managerLaneConfig?.prompt).toContain("confidence limit");
    expect(managerLaneConfig?.prompt).toContain(
      "Coordinator handoff implication",
    );
    expect(managerLaneConfig?.prompt).toContain(
      "append dimension_evaluations only",
    );
    expect(managerLaneConfig?.prompt).not.toContain("POST /tasks/batch");
    expect(managerLaneConfig?.prompt).not.toContain("manager_reports");
  });

  it("defers AIM-managed workspace creation until manager and coordinator lanes scan", async () => {
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
    mockCreateAgentSessionLane.mockReturnValue({
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
    });
    mockEnsureProjectWorkspace.mockResolvedValue("/aim/projects/main");

    const { startServer } = await import("../src/server.js");

    startServer();

    expect(mockEnsureProjectWorkspace).not.toHaveBeenCalled();

    const laneConfigs = mockCreateAgentSessionLane.mock.calls.map(
      ([config]) => config,
    );

    await laneConfigs[0].projectDirectory();
    await laneConfigs[1].projectDirectory();

    expect(mockEnsureProjectWorkspace).toHaveBeenCalledTimes(2);
    expect(mockEnsureProjectWorkspace).toHaveBeenCalledWith({
      git_origin_url: configuredProject.git_origin_url,
      project_id: configuredProject.id,
    });
  });

  it("creates manager and coordinator lanes for every configured project", async () => {
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
        configuredProject,
        secondConfiguredProject,
        unconfiguredProject,
      ]),
    );
    mockCreateTaskScheduler.mockReturnValue(scheduler);
    mockCreateTaskSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionCoordinator.mockReturnValue({});
    mockCreateAgentSessionLane.mockReturnValue({
      [Symbol.asyncDispose]: vi.fn(),
      scanOnce: vi.fn(),
      start: vi.fn(),
    });
    mockEnsureProjectWorkspace
      .mockResolvedValueOnce("/aim/projects/main")
      .mockResolvedValueOnce("/aim/projects/second")
      .mockResolvedValueOnce("/aim/projects/main")
      .mockResolvedValueOnce("/aim/projects/second");

    const { startServer } = await import("../src/server.js");

    startServer();

    const laneConfigs = mockCreateAgentSessionLane.mock.calls.map(
      ([config]) => config,
    );

    expect(laneConfigs.map((config) => config.laneName)).toEqual([
      "manager_evaluation",
      "manager_evaluation",
      "coordinator_task_pool",
      "coordinator_task_pool",
    ]);
    expect(laneConfigs.map((config) => config.providerId)).toEqual([
      configuredProject.global_provider_id,
      secondConfiguredProject.global_provider_id,
      configuredProject.global_provider_id,
      secondConfiguredProject.global_provider_id,
    ]);
    expect(laneConfigs.map((config) => config.modelId)).toEqual([
      configuredProject.global_model_id,
      secondConfiguredProject.global_model_id,
      configuredProject.global_model_id,
      secondConfiguredProject.global_model_id,
    ]);
    for (const project of [configuredProject, secondConfiguredProject]) {
      expect(
        laneConfigs.some(
          (config) =>
            config.prompt.includes(`project_id "${project.id}"`) &&
            config.title.includes(project.id),
        ),
      ).toBe(true);
    }

    for (const laneConfig of laneConfigs) {
      await laneConfig.projectDirectory();
    }

    expect(mockEnsureProjectWorkspace).toHaveBeenCalledTimes(4);
    expect(mockEnsureProjectWorkspace).toHaveBeenCalledWith({
      git_origin_url: configuredProject.git_origin_url,
      project_id: configuredProject.id,
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

  it("uses truthful missing-project lanes when no projects are configured", async () => {
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

    expect(mockCreateAgentSessionLane).not.toHaveBeenCalled();
    expect(optimizerRuntime.getStatus()).toMatchObject({
      lanes: {
        coordinator_task_pool: {
          last_error:
            "AIM optimizer lane requires at least one configured project",
          running: false,
        },
        developer_follow_up: { running: true },
        manager_evaluation: {
          last_error:
            "AIM optimizer lane requires at least one configured project",
          running: false,
        },
      },
      running: true,
    });

    await serverRuntime[Symbol.asyncDispose]();
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

    mockCreateApp.mockReturnValue(createAppMock());
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
    expect(coordinatorLaneConfig?.prompt).toContain(
      "Persist normalized Task Spec validation evidence in each passing create operation's source_metadata.task_spec_validation",
    );
    expect(coordinatorLaneConfig?.prompt).toContain(
      "classify each candidate as pass, waiting_assumptions, or failed",
    );
    expect(coordinatorLaneConfig?.prompt).toContain(
      "source_metadata.task_spec_validation",
    );
    expect(coordinatorLaneConfig?.prompt).toContain("conclusion = pass");
    expect(coordinatorLaneConfig?.prompt).toContain(
      "validation evidence cannot replace dependency or conflict planning evidence",
    );
    expect(coordinatorLaneConfig?.prompt).toContain(
      "current_task_pool_coverage, dependency_rationale, conflict_duplicate_assessment, and unfinished_task_non_conflict_rationale",
    );
    expect(coordinatorLaneConfig?.prompt).toContain(
      "delete_reason with stale/conflict/baseline absorbed rationale and worktree/PR classification",
    );
    expect(coordinatorLaneConfig?.prompt).toContain(
      "keep/noop decisions must retain an explicit rationale",
    );
    expect(coordinatorLaneConfig?.prompt).toContain(
      "blocking assumptions or failed validation reason",
    );
    expect(coordinatorLaneConfig?.prompt).toContain(
      "If validation fails or waits on assumptions, do not call POST /tasks/batch",
    );
    expect(coordinatorLaneConfig?.prompt).toContain(
      "Delete-only batches do not require Task Spec validation",
    );
    expect(coordinatorLaneConfig?.prompt).toContain(
      "Generic optimizer-loop placeholders are not validation evidence",
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

    mockCreateApp.mockReturnValue(createAppMock());
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

    mockCreateApp.mockReturnValue(createAppMock());
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

    mockCreateApp.mockReturnValue(createAppMock());
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
    await vi.waitFor(() => {
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
