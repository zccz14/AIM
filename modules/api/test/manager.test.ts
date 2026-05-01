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

const createSessionManager = () => ({
  createSession: vi.fn().mockResolvedValue({
    [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
    sessionId: "session-1",
  }),
});

const createManagerStateRepository = () => {
  let state: null | {
    commit_sha: string;
    created_at: string;
    dimension_ids_json: string;
    last_error: null | string;
    project_id: string;
    session_id: null | string;
    state: string;
    updated_at: string;
  } = null;

  return {
    clearManagerState: vi.fn(() => {
      state = null;
      return true;
    }),
    getManagerState: vi.fn(() => state),
    upsertManagerState: vi.fn(
      (input: {
        commit_sha: string;
        dimension_ids_json: string;
        last_error?: null | string;
        project_id: string;
        session_id?: null | string;
        state: string;
      }) => {
        state = {
          created_at: state?.created_at ?? "2026-04-26T12:00:00.000Z",
          updated_at: "2026-04-26T12:00:00.000Z",
          ...input,
          last_error: input.last_error ?? null,
          session_id: input.session_id ?? null,
        };

        return state;
      },
    ),
  };
};

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

const mockGitAndGh = ({
  branchProtection = JSON.stringify({
    required_status_checks: {
      checks: [{ context: "API / test" }, { context: "Web / test" }],
    },
  }),
  commitSha = "abc1234",
  repo = JSON.stringify({
    defaultBranchRef: { name: "main" },
    nameWithOwner: "example/main",
  }),
  rulesets = JSON.stringify([{ enforcement: "active", name: "Main gate" }]),
  workflows = "API\tactive\nWeb\tactive\n",
}: {
  branchProtection?: string;
  commitSha?: string;
  repo?: string;
  rulesets?: string;
  workflows?: string;
} = {}) => {
  execFileMock.mockImplementation(
    (
      command: string,
      args: string[],
      _options: unknown,
      callback: (error: null, stdout: string) => void,
    ) => {
      if (command === "git") {
        callback(null, args[0] === "rev-parse" ? `${commitSha}\n` : "");
        return;
      }

      if (command === "gh" && args[0] === "repo" && args[1] === "view") {
        callback(null, repo);
        return;
      }

      if (command === "gh" && args[0] === "workflow" && args[1] === "list") {
        callback(null, workflows);
        return;
      }

      if (
        command === "gh" &&
        args[0] === "api" &&
        args[1] === "repos/example/main/branches/main/protection"
      ) {
        callback(null, branchProtection);
        return;
      }

      if (
        command === "gh" &&
        args[0] === "api" &&
        args[1] === "repos/example/main/rulesets?targets=branch"
      ) {
        callback(null, rulesets);
        return;
      }

      callback(null, "");
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
    const sessionManager = createSessionManager();
    const dimensionRepository = {
      listUnevaluatedDimensionIds: vi
        .fn()
        .mockResolvedValue(["dimension-api", "dimension-docs"]),
    };
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const { createManager } = await import("../src/manager.js");

    const manager = createManager({
      dimensionRepository,
      logger,
      managerStateRepository: createManagerStateRepository(),
      project,
      sessionManager,
    });

    await vi.waitFor(() => {
      expect(sessionManager.createSession).toHaveBeenCalledOnce();
    });

    expect(mockEnsureProjectWorkspace).toHaveBeenCalledWith({
      git_origin_url: project.git_origin_url,
      project_id: project.id,
    });
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["fetch", "origin", "main"],
      expect.objectContaining({ cwd: "/repo/project-1", timeout: 60_000 }),
      expect.any(Function),
    );
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["checkout", "origin/main"],
      expect.objectContaining({ cwd: "/repo/project-1", timeout: 60_000 }),
      expect.any(Function),
    );
    expect(
      dimensionRepository.listUnevaluatedDimensionIds,
    ).toHaveBeenCalledWith(project.id, "def5678");
    expect(sessionManager.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: "/repo/project-1",
        model: {
          modelID: project.global_model_id,
          providerID: project.global_provider_id,
        },
        title: `AIM Manager evaluation (${project.id})`,
      }),
    );
    expect(sessionManager.createSession.mock.calls[0]?.[0].prompt).toContain(
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

  it("includes read-only GitHub CI gate evidence in the Manager evaluation prompt", async () => {
    vi.useFakeTimers();
    mockEnsureProjectWorkspace.mockResolvedValue("/repo/project-1");
    mockGitAndGh({ commitSha: "def5678" });
    const sessionManager = createSessionManager();
    const { createManager } = await import("../src/manager.js");

    const manager = createManager({
      dimensionRepository: {
        listUnevaluatedDimensionIds: vi
          .fn()
          .mockResolvedValue(["dimension-ci"]),
      },
      managerStateRepository: createManagerStateRepository(),
      project,
      sessionManager,
    });

    await vi.waitFor(() => {
      expect(sessionManager.createSession).toHaveBeenCalledOnce();
    });

    const prompt = sessionManager.createSession.mock.calls[0]?.[0].prompt;
    expect(prompt).toContain("CI gate evidence for current baseline");
    expect(prompt).toContain('GitHub repository: "example/main".');
    expect(prompt).toContain('Default branch: "main".');
    expect(prompt).toContain(
      "GitHub Actions workflows: API (active); Web (active).",
    );
    expect(prompt).toContain("Required checks: API / test; Web / test.");
    expect(prompt).toContain("Branch rulesets: Main gate (active).");
    expect(prompt).toContain(
      "Use this read-only GitHub gate evidence when evaluating CI and validation reliability dimensions.",
    );

    await manager[Symbol.asyncDispose]();
  });

  it("includes a diagnostic CI gate evidence limit when GitHub evidence is unavailable", async () => {
    vi.useFakeTimers();
    mockEnsureProjectWorkspace.mockResolvedValue("/repo/project-1");
    execFileMock.mockImplementation(
      (
        command: string,
        args: string[],
        _options: unknown,
        callback: (
          error: Error | null,
          stdout: string,
          stderr?: string,
        ) => void,
      ) => {
        if (command === "git") {
          callback(null, args[0] === "rev-parse" ? "def5678\n" : "");
          return;
        }

        callback(new Error("gh auth required"), "", "authentication required");
      },
    );
    const sessionManager = createSessionManager();
    const { createManager } = await import("../src/manager.js");

    const manager = createManager({
      dimensionRepository: {
        listUnevaluatedDimensionIds: vi
          .fn()
          .mockResolvedValue(["dimension-ci"]),
      },
      managerStateRepository: createManagerStateRepository(),
      project,
      sessionManager,
    });

    await vi.waitFor(() => {
      expect(sessionManager.createSession).toHaveBeenCalledOnce();
    });

    const prompt = sessionManager.createSession.mock.calls[0]?.[0].prompt;
    expect(prompt).toContain("CI gate evidence for current baseline");
    expect(prompt).toContain(
      "Evidence limit: GitHub CI gate evidence unavailable",
    );
    expect(prompt).toContain("gh auth required");
    expect(prompt).toContain(
      "Record this evidence limit instead of assuming live GitHub Actions, required checks, branch protection, or ruleset state.",
    );

    await manager[Symbol.asyncDispose]();
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
      dimensionRepository: { listUnevaluatedDimensionIds: vi.fn() },
      managerStateRepository: createManagerStateRepository(),
      project,
      sessionManager: createSessionManager(),
    });

    await vi.waitFor(() => {
      expect(execFileMock).toHaveBeenCalledWith(
        "git",
        ["rev-parse", "origin/main"],
        expect.objectContaining({ cwd: "/repo/project-1", timeout: 60_000 }),
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
    const sessionManager = createSessionManager();
    const dimensionRepository = {
      listUnevaluatedDimensionIds: vi
        .fn()
        .mockResolvedValue(["dimension-api", "dimension-docs"]),
    };
    const { createManager } = await import("../src/manager.js");
    const manager = createManager({
      dimensionRepository,
      managerStateRepository: createManagerStateRepository(),
      project,
      sessionManager,
    });

    await vi.waitFor(() => {
      expect(sessionManager.createSession).toHaveBeenCalledOnce();
    });

    await vi.advanceTimersByTimeAsync(10_000);

    await vi.waitFor(() => {
      expect(
        dimensionRepository.listUnevaluatedDimensionIds,
      ).toHaveBeenCalledTimes(2);
    });
    expect(sessionManager.createSession).toHaveBeenCalledOnce();

    await manager[Symbol.asyncDispose]();
  });

  it("does not create a duplicate OpenCode session after restart when matching missing evaluations are already claimed", async () => {
    vi.useFakeTimers();
    mockEnsureProjectWorkspace.mockResolvedValue("/repo/project-1");
    mockGit("abc1234");
    const sessionManager = createSessionManager();
    const dimensionRepository = {
      listUnevaluatedDimensionIds: vi
        .fn()
        .mockResolvedValue([
          "dimension-docs",
          "dimension-api",
          "dimension-docs",
        ]),
    };
    const managerStateRepository = {
      clearManagerState: vi.fn(),
      getManagerState: vi.fn().mockReturnValue({
        commit_sha: "abc1234",
        created_at: "2026-04-26T12:00:00.000Z",
        dimension_ids_json: JSON.stringify(["dimension-api", "dimension-docs"]),
        last_error: null,
        project_id: project.id,
        session_id: "session-existing",
        state: "evaluating",
        updated_at: "2026-04-26T12:00:00.000Z",
      }),
      upsertManagerState: vi.fn(),
    };
    const { createManager } = await import("../src/manager.js");
    const manager = createManager({
      dimensionRepository,
      managerStateRepository,
      project,
      sessionManager,
    });

    await vi.waitFor(() => {
      expect(managerStateRepository.getManagerState).toHaveBeenCalledWith(
        project.id,
      );
    });

    expect(sessionManager.createSession).not.toHaveBeenCalled();
    expect(managerStateRepository.upsertManagerState).not.toHaveBeenCalled();

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
      dimensionRepository,
      logger,
      managerStateRepository: createManagerStateRepository(),
      project,
      sessionManager: createSessionManager(),
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
    const sessionManager = createSessionManager();
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const { createManager } = await import("../src/manager.js");
    const manager = createManager({
      dimensionRepository: {
        listUnevaluatedDimensionIds: vi.fn().mockResolvedValue([]),
      },
      logger,
      managerStateRepository: createManagerStateRepository(),
      project,
      sessionManager,
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
    expect(sessionManager.createSession).not.toHaveBeenCalled();
    await manager[Symbol.asyncDispose]();
  });
});
