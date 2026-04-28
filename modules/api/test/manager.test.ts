import { afterEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());
const mockEnsureProjectWorkspace = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

vi.mock("../src/project-workspace.js", () => ({
  ensureProjectWorkspace: mockEnsureProjectWorkspace,
}));

const project = {
  global_model_id: "claude-sonnet-4-5",
  global_provider_id: "anthropic",
  git_origin_url: "https://github.com/example/main.git",
  id: "project-1",
};

const createCoordinator = () => ({
  createSession: vi.fn().mockResolvedValue({
    [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    sessionId: "session-1",
  }),
});

const mockGit = (commitSha = "abc1234") => {
  execFileMock.mockImplementation(
    (
      _command: string,
      args: string[],
      _options: unknown,
      callback: (error: null, stdout: string) => void,
    ) => {
      callback(null, args[0] === "rev-parse" ? `${commitSha}\n` : "");
    },
  );
};

describe("manager", () => {
  afterEach(() => {
    vi.useRealTimers();
    execFileMock.mockReset();
    mockEnsureProjectWorkspace.mockReset();
    vi.resetModules();
  });

  it("starts a live heartbeat on creation and creates an OpenCode session for missing latest-baseline evaluations", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T12:00:00.000Z"));
    mockEnsureProjectWorkspace.mockResolvedValue("/repo/project-1");
    mockGit("def5678");
    const coordinator = createCoordinator();
    const dimensionRepository = {
      listUnevaluatedDimensionIds: vi
        .fn()
        .mockResolvedValue(["dimension-api", "dimension-docs"]),
    };
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const { createManager } = await import("../src/manager.js");

    const manager = createManager({
      coordinator,
      dimensionRepository,
      logger,
      project,
    });

    await vi.waitFor(() => {
      expect(coordinator.createSession).toHaveBeenCalledOnce();
    });

    expect(mockEnsureProjectWorkspace).toHaveBeenCalledWith({
      git_origin_url: project.git_origin_url,
      project_id: project.id,
    });
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["fetch", "origin", "main"],
      { cwd: "/repo/project-1" },
      expect.any(Function),
    );
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["checkout", "origin/main"],
      { cwd: "/repo/project-1" },
      expect.any(Function),
    );
    expect(
      dimensionRepository.listUnevaluatedDimensionIds,
    ).toHaveBeenCalledWith(project.id, "def5678");
    expect(coordinator.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: project.global_model_id,
        projectDirectory: "/repo/project-1",
        providerId: project.global_provider_id,
        title: `AIM Manager evaluation (${project.id})`,
      }),
    );
    expect(coordinator.createSession.mock.calls[0]?.[0].prompt).toContain(
      'Evaluate only these dimension_id values for this baseline commit: "dimension-api", "dimension-docs".',
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "manager_started",
        project_id: project.id,
      }),
      "Manager started",
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "manager_session_succeeded",
        project_id: project.id,
        session_id: "session-1",
      }),
      "Manager session succeeded",
    );
    expect(manager.getStatus()).toMatchObject({
      last_error: null,
      running: true,
    });

    await manager[Symbol.asyncDispose]();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "manager_disposed",
        project_id: project.id,
      }),
      "Manager disposed",
    );
  });

  it("does not overlap heartbeats while a previous heartbeat is still awaiting", async () => {
    vi.useFakeTimers();
    mockEnsureProjectWorkspace.mockResolvedValue("/repo/project-1");
    let releaseRevParse: (() => void) | undefined;
    let blockedFirstRevParse = false;
    execFileMock.mockImplementation(
      (
        _command: string,
        args: string[],
        _options: unknown,
        callback: (error: null, stdout: string) => void,
      ) => {
        if (args[0] === "rev-parse" && !blockedFirstRevParse) {
          blockedFirstRevParse = true;
          releaseRevParse = () => callback(null, "abc1234\n");
          return;
        }

        callback(null, "");
      },
    );
    const { createManager } = await import("../src/manager.js");
    const manager = createManager({
      coordinator: createCoordinator(),
      dimensionRepository: { listUnevaluatedDimensionIds: vi.fn() },
      project,
    });

    await vi.waitFor(() => {
      expect(execFileMock).toHaveBeenCalledWith(
        "git",
        ["rev-parse", "origin/main"],
        { cwd: "/repo/project-1" },
        expect.any(Function),
      );
    });
    await vi.advanceTimersByTimeAsync(30_000);

    expect(mockEnsureProjectWorkspace).toHaveBeenCalledOnce();

    releaseRevParse?.();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(mockEnsureProjectWorkspace).toHaveBeenCalledTimes(2);
    await manager[Symbol.asyncDispose]();
  });

  it("does not create duplicate OpenCode sessions for unchanged missing evaluations on later heartbeats", async () => {
    vi.useFakeTimers();
    mockEnsureProjectWorkspace.mockResolvedValue("/repo/project-1");
    mockGit("abc1234");
    const coordinator = createCoordinator();
    const dimensionRepository = {
      listUnevaluatedDimensionIds: vi
        .fn()
        .mockResolvedValue(["dimension-api", "dimension-docs"]),
    };
    const { createManager } = await import("../src/manager.js");
    const manager = createManager({
      coordinator,
      dimensionRepository,
      project,
    });

    await vi.waitFor(() => {
      expect(coordinator.createSession).toHaveBeenCalledOnce();
    });

    await vi.advanceTimersByTimeAsync(10_000);

    await vi.waitFor(() => {
      expect(
        dimensionRepository.listUnevaluatedDimensionIds,
      ).toHaveBeenCalledTimes(2);
    });
    expect(coordinator.createSession).toHaveBeenCalledOnce();

    await manager[Symbol.asyncDispose]();
  });

  it("logs heartbeat failures with the original error object and continues future heartbeats", async () => {
    vi.useFakeTimers();
    mockEnsureProjectWorkspace.mockResolvedValue("/repo/project-1");
    mockGit("abc1234");
    const error = new Error("dimension store offline");
    const dimensionRepository = {
      listUnevaluatedDimensionIds: vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce([]),
    };
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const { createManager } = await import("../src/manager.js");
    const manager = createManager({
      coordinator: createCoordinator(),
      dimensionRepository,
      logger,
      project,
    });

    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: error,
          event: "manager_heartbeat_failed",
          project_id: project.id,
        }),
        "Manager heartbeat failed",
      );
    });
    expect(manager.getStatus()).toMatchObject({
      last_error: "dimension store offline",
      running: true,
    });

    await vi.advanceTimersByTimeAsync(10_000);

    await vi.waitFor(() => {
      expect(
        dimensionRepository.listUnevaluatedDimensionIds,
      ).toHaveBeenCalledTimes(2);
    });
    expect(manager.getStatus()).toMatchObject({ last_error: null });
    await manager[Symbol.asyncDispose]();
  });

  it("logs an idle reason when the latest baseline has no missing evaluations", async () => {
    vi.useFakeTimers();
    mockEnsureProjectWorkspace.mockResolvedValue("/repo/project-1");
    mockGit("abc1234");
    const coordinator = createCoordinator();
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const { createManager } = await import("../src/manager.js");
    const manager = createManager({
      coordinator,
      dimensionRepository: {
        listUnevaluatedDimensionIds: vi.fn().mockResolvedValue([]),
      },
      logger,
      project,
    });

    await vi.waitFor(() => {
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "manager_idle",
          reason: "no_missing_evaluations",
        }),
        "Manager heartbeat idle",
      );
    });
    expect(coordinator.createSession).not.toHaveBeenCalled();
    await manager[Symbol.asyncDispose]();
  });
});
