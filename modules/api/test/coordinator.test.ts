import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const project = {
  created_at: "2026-04-26T00:00:00.000Z",
  global_model_id: "claude-sonnet-4-5",
  global_provider_id: "anthropic",
  git_origin_url: "https://github.com/example/project.git",
  id: "project-1",
  name: "Project One",
  optimizer_enabled: true,
  updated_at: "2026-04-26T00:00:00.000Z",
};

const createTask = (index: number, projectId = project.id) => ({
  created_at: "2026-04-27T00:00:00.000Z",
  dependencies: [],
  done: false,
  git_origin_url: "https://github.com/example/project.git",
  global_model_id: project.global_model_id,
  global_provider_id: project.global_provider_id,
  opencode_session: null,
  project_id: projectId,
  pull_request_url: null,
  result: "",
  session_id: null,
  source_metadata: {},
  status: "pending" as const,
  task_id: `task-${projectId}-${index}`,
  task_spec: `Task spec ${index}`,
  title: `Task ${index}`,
  updated_at: "2026-04-27T00:00:00.000Z",
  worktree_path: null,
});

const createRejectedTask = (index: number, projectId = project.id) => ({
  ...createTask(index, projectId),
  done: true,
  result:
    "Task Spec validation failed because coverage duplicated current Active Task Pool and used stale baseline facts.",
  source_metadata: {
    task_spec_validation: {
      conclusion: "failed",
      failure_reason:
        "waiting_assumptions and stale baseline blocked POST /tasks/batch",
    },
  },
  status: "rejected" as const,
  task_id: `rejected-${projectId}-${index}`,
  title: `Rejected Task ${index}`,
});

const createDimension = (id: string) => ({
  created_at: "2026-04-27T00:00:00.000Z",
  evaluation_method: "score the README goal",
  goal: "Improve the project",
  id,
  name: `Dimension ${id}`,
  project_id: project.id,
  updated_at: "2026-04-27T00:00:00.000Z",
});

const createNamedDimension = (id: string, name: string, goal: string) => ({
  ...createDimension(id),
  goal,
  name,
});

const createBelowThresholdRepositories = () => ({
  baselineRepository: {
    getLatestBaselineFacts: vi.fn(async () => ({
      commitSha: "baseline-retry",
      fetchedAt: "2026-04-28T12:00:00.000Z",
      summary: "Retry baseline",
    })),
  },
  dimensionRepository: {
    listDimensionEvaluations: vi.fn(async () => []),
    listDimensions: vi.fn(async () => []),
  },
  taskRepository: {
    getProjectById: vi.fn(() => project),
    listRejectedTasksByProject: vi.fn(async () => []),
    listUnfinishedTasks: vi.fn(async () => []),
  },
});

const createCoordinatorStateRepository = (
  initialState: null | {
    active_task_count: number;
    commit_sha: string;
    created_at: string;
    last_error: null | string;
    planning_input_hash: string;
    project_id: string;
    session_id: null | string;
    state: "failed" | "planning";
    threshold: number;
    updated_at: string;
  } = null,
) => {
  let state = initialState;

  return {
    clearCoordinatorState: vi.fn(() => {
      state = null;
      return true;
    }),
    getCoordinatorState: vi.fn(() => state),
    upsertCoordinatorState: vi.fn(
      (input: {
        active_task_count: number;
        commit_sha: string;
        last_error?: null | string;
        planning_input_hash: string;
        project_id: string;
        session_id?: null | string;
        state: "failed" | "planning";
        threshold: number;
      }) => {
        state = {
          created_at: state?.created_at ?? "2026-04-28T12:00:00.000Z",
          updated_at: "2026-04-28T12:00:00.000Z",
          ...input,
          last_error: input.last_error ?? null,
          session_id: input.session_id ?? null,
        };

        return state;
      },
    ),
  };
};

describe("coordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("starts immediately and does nothing when this project's Active Task Pool is sufficient", async () => {
    const taskRepository = {
      getProjectById: vi.fn(() => project),
      listRejectedTasksByProject: vi.fn(),
      listUnfinishedTasks: vi.fn(async () => [
        ...Array.from({ length: 10 }, (_, index) => createTask(index)),
        createTask(99, "other-project"),
      ]),
    };
    const dimensionRepository = {
      listDimensionEvaluations: vi.fn(),
      listDimensions: vi.fn(),
    };
    const sessionManager = {
      createSession: vi.fn(),
    };

    const { createCoordinator } = await import("../src/coordinator.js");
    const coordinator = createCoordinator(project.id, {
      dimensionRepository,
      projectDirectory: "/repo/workspace/project-1",
      sessionManager,
      taskRepository,
    });

    await vi.advanceTimersByTimeAsync(1);

    expect(taskRepository.getProjectById).toHaveBeenCalledWith(project.id);
    expect(taskRepository.listUnfinishedTasks).toHaveBeenCalledOnce();
    expect(dimensionRepository.listDimensions).not.toHaveBeenCalled();
    expect(sessionManager.createSession).not.toHaveBeenCalled();

    await coordinator[Symbol.asyncDispose]();
  });

  it("creates one project-scoped OpenCode session through the session manager when the Active Task Pool is below threshold", async () => {
    const dimension = createDimension("dimension-1");
    const taskRepository = {
      getProjectById: vi.fn(() => project),
      listRejectedTasksByProject: vi.fn(async (projectId: string) => [
        createRejectedTask(1, projectId),
        createRejectedTask(2, "other-project"),
      ]),
      listUnfinishedTasks: vi.fn(async () => [
        createTask(1),
        createTask(2, "other-project"),
      ]),
    };
    const dimensionRepository = {
      listDimensionEvaluations: vi.fn(async (dimensionId: string) => [
        {
          commit_sha: "abc123",
          created_at: "2026-04-28T10:00:00.000Z",
          dimension_id: dimensionId,
          evaluation: "Latest gap: missing coordinator-created task coverage.",
          evaluator_model: "claude-sonnet-4-5",
          id: "evaluation-1",
          project_id: project.id,
          score: 42,
        },
      ]),
      listDimensions: vi.fn(async () => [dimension]),
    };
    const sessionHandle = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      sessionId: "coordinator-session-1",
    };
    const sessionManager = {
      createSession: vi.fn(async () => sessionHandle),
    };
    const baselineRepository = {
      getLatestBaselineFacts: vi.fn(async () => ({
        commitSha: "baseline-123",
        fetchedAt: "2026-04-28T12:00:00.000Z",
        summary: "Fix optimizer scheduler setup cleanup (#245)",
      })),
    };

    const { createCoordinator } = await import("../src/coordinator.js");
    const coordinator = createCoordinator(project.id, {
      baselineRepository,
      dimensionRepository,
      projectDirectory: "/repo/workspace/project-1",
      sessionManager,
      taskRepository,
    });

    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(1000);

    expect(dimensionRepository.listDimensions).toHaveBeenCalledWith(project.id);
    expect(taskRepository.listRejectedTasksByProject).toHaveBeenCalledWith(
      project.id,
    );
    expect(baselineRepository.getLatestBaselineFacts).toHaveBeenCalledWith(
      "/repo/workspace/project-1",
    );
    expect(sessionManager.createSession).toHaveBeenCalledTimes(1);
    expect(sessionManager.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: "/repo/workspace/project-1",
        model: { modelID: "claude-sonnet-4-5", providerID: "anthropic" },
        title: "AIM Coordinator task-pool session (project-1)",
      }),
    );
    const prompt = sessionManager.createSession.mock.calls[0]?.[0].prompt;
    expect(prompt).toContain('project_id "project-1"');
    expect(prompt).toContain("Active Task Pool: 1 unfinished Tasks");
    expect(prompt).toContain("Current baseline facts");
    expect(prompt).toContain('commit "baseline-123"');
    expect(prompt).toContain("Fix optimizer scheduler setup cleanup (#245)");
    expect(prompt).toContain("commit abc123");
    expect(prompt).toContain(
      "stale: evaluation commit abc123 differs from current origin/main baseline baseline-123",
    );
    expect(prompt).toContain("treat as historical signal only");
    expect(prompt).toContain(
      "do not use it independently as current baseline evidence for creating Tasks",
    );
    expect(prompt).toContain("Rejected Task feedback for this project");
    expect(prompt).toContain("rejected-project-1-1");
    expect(prompt).toContain(
      "Task Spec validation failed because coverage duplicated current Active Task Pool",
    );
    expect(prompt).not.toContain("rejected-other-project-2");
    expect(prompt).toContain("append Tasks");
    expect(prompt).toContain("POST /tasks/batch");
    expect(prompt).toContain("source_metadata.task_spec_validation");
    expect(prompt).toContain("waiting_assumptions");
    expect(prompt).toContain("failed Task Spec validation");
    expect(prompt).toContain("self-overlap");
    expect(prompt).toContain("duplicate coverage");
    expect(prompt).toContain(
      "Latest gap: missing coordinator-created task coverage.",
    );

    await coordinator[Symbol.asyncDispose]();

    expect(sessionHandle[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("summarizes active task pool baseline freshness and delivery state for current, stale, and missing metadata", async () => {
    const currentTask = {
      ...createTask(1),
      pull_request_url: "https://github.com/example/project/pull/1",
      session_id: "session-current",
      source_metadata: {
        latest_origin_main_commit: "baseline-current",
        task_spec_validation: {
          latest_origin_main_commit: "baseline-current",
        },
      },
      status: "pushed" as const,
      worktree_path: "/repo/.worktrees/current",
    };
    const staleTask = {
      ...createTask(2),
      session_id: "session-stale",
      source_metadata: {
        latest_origin_main_commit: "baseline-old",
        task_spec_validation: {
          latest_origin_main_commit: "baseline-old-validated",
        },
      },
      status: "running" as const,
      worktree_path: "/repo/.worktrees/stale",
    };
    const missingMetadataTask = createTask(3);
    const unknownFreshnessTask = {
      ...createTask(4),
      source_metadata: {
        latest_origin_main_commit: "baseline-current",
      },
    };
    const taskRepository = {
      getProjectById: vi.fn(() => project),
      listRejectedTasksByProject: vi.fn(async () => []),
      listUnfinishedTasks: vi.fn(async () => [
        currentTask,
        staleTask,
        missingMetadataTask,
        unknownFreshnessTask,
      ]),
    };
    const dimensionRepository = {
      listDimensionEvaluations: vi.fn(async () => []),
      listDimensions: vi.fn(async () => []),
    };
    const sessionHandle = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      sessionId: "coordinator-session-active-pool-baselines",
    };
    const sessionManager = {
      createSession: vi.fn(async () => sessionHandle),
    };
    const baselineRepository = {
      getLatestBaselineFacts: vi.fn(async () => ({
        commitSha: "baseline-current",
        fetchedAt: "2026-04-28T12:00:00.000Z",
        summary: "Current baseline summary",
      })),
    };

    const { createCoordinator } = await import("../src/coordinator.js");
    const coordinator = createCoordinator(project.id, {
      activeTaskThreshold: 10,
      baselineRepository,
      dimensionRepository,
      projectDirectory: "/repo/workspace/project-1",
      sessionManager,
      taskRepository,
    });

    await vi.advanceTimersByTimeAsync(1);

    const prompt = sessionManager.createSession.mock.calls[0]?.[0].prompt;
    expect(prompt).toContain("Current Active Task Pool:");
    expect(prompt).toContain(
      "Task 1 (task-project-1-1) status pushed; source baseline baseline-current; validated baseline baseline-current; freshness current; PR https://github.com/example/project/pull/1; worktree /repo/.worktrees/current; session session-current",
    );
    expect(prompt).toContain(
      "Task 2 (task-project-1-2) status running; source baseline baseline-old; validated baseline baseline-old-validated; freshness stale; PR (not set); worktree /repo/.worktrees/stale; session session-stale",
    );
    expect(prompt).toContain(
      "Task 3 (task-project-1-3) status pending; source baseline (missing); validated baseline (missing); freshness missing_baseline_metadata; PR (not set); worktree (not set); session (not set)",
    );
    expect(prompt).toContain(
      "Task 4 (task-project-1-4) status pending; source baseline baseline-current; validated baseline (missing); freshness unknown; PR (not set); worktree (not set); session (not set)",
    );
    expect(prompt).toContain(
      "Stale active tasks are only historical/conceptual coverage candidates and cannot independently prove current baseline coverage.",
    );

    await coordinator[Symbol.asyncDispose]();
  });

  it("keeps rejected feedback visible when the active task pool is non-empty", async () => {
    const taskRepository = {
      getProjectById: vi.fn(() => project),
      listRejectedTasksByProject: vi.fn(async () => [createRejectedTask(1)]),
      listUnfinishedTasks: vi.fn(async () => [
        {
          ...createTask(1),
          source_metadata: {
            latest_origin_main_commit: "baseline-current",
            task_spec_validation: {
              latest_origin_main_commit: "baseline-current",
            },
          },
        },
      ]),
    };
    const dimensionRepository = {
      listDimensionEvaluations: vi.fn(async () => []),
      listDimensions: vi.fn(async () => []),
    };
    const sessionHandle = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      sessionId: "coordinator-session-rejected-with-pool",
    };
    const sessionManager = {
      createSession: vi.fn(async () => sessionHandle),
    };
    const baselineRepository = {
      getLatestBaselineFacts: vi.fn(async () => ({
        commitSha: "baseline-current",
        fetchedAt: "2026-04-28T12:00:00.000Z",
        summary: "Current baseline summary",
      })),
    };

    const { createCoordinator } = await import("../src/coordinator.js");
    const coordinator = createCoordinator(project.id, {
      activeTaskThreshold: 10,
      baselineRepository,
      dimensionRepository,
      projectDirectory: "/repo/workspace/project-1",
      sessionManager,
      taskRepository,
    });

    await vi.advanceTimersByTimeAsync(1);

    const prompt = sessionManager.createSession.mock.calls[0]?.[0].prompt;
    expect(prompt).toMatch(
      /Current Active Task Pool:\n- Task 1.*freshness current/s,
    );
    expect(prompt).toContain("Rejected Task feedback for this project:");
    expect(prompt).toContain("rejected-project-1-1");
    expect(prompt).toContain(
      "Task Spec validation failed because coverage duplicated current Active Task Pool",
    );

    await coordinator[Symbol.asyncDispose]();
  });

  it("prioritizes current-baseline signals over stale historical priority candidates without replacing guardrails", async () => {
    const dimensions = [
      createNamedDimension(
        "current-readme-ahead",
        "Current README-ahead autonomy",
        "Reduce README ahead drift on the current baseline",
      ),
      createNamedDimension(
        "current-baseline-evidence",
        "Current baseline evidence",
        "Keep current baseline evidence ahead of stale candidates",
      ),
      createNamedDimension(
        "stale-readme-ahead",
        "Stale README-ahead autonomy",
        "Track historical README ahead drift",
      ),
      createNamedDimension(
        "stale-consider-create",
        "Stale create candidate",
        "Track historical create candidates",
      ),
    ];
    const evaluations = {
      "current-baseline-evidence": {
        commit_sha: "baseline-123",
        created_at: "2026-04-28T11:00:00.000Z",
        dimension_id: "current-baseline-evidence",
        evaluation: "Current baseline evidence still shows an optimizer gap.",
        evaluator_model: "claude-sonnet-4-5",
        id: "evaluation-current-baseline-evidence",
        project_id: project.id,
        score: 80,
      },
      "current-readme-ahead": {
        commit_sha: "baseline-123",
        created_at: "2026-04-28T12:00:00.000Z",
        dimension_id: "current-readme-ahead",
        evaluation:
          "Current README-ahead autonomy: readme_ahead gap; consider_create.",
        evaluator_model: "claude-sonnet-4-5",
        id: "evaluation-current-readme-ahead",
        project_id: project.id,
        score: 60,
      },
      "stale-consider-create": {
        commit_sha: "older-baseline",
        created_at: "2026-04-28T09:00:00.000Z",
        dimension_id: "stale-consider-create",
        evaluation:
          "Stale create candidate: consider_create based on prior baseline.",
        evaluator_model: "claude-sonnet-4-5",
        id: "evaluation-stale-consider-create",
        project_id: project.id,
        score: 10,
      },
      "stale-readme-ahead": {
        commit_sha: "older-baseline",
        created_at: "2026-04-28T10:00:00.000Z",
        dimension_id: "stale-readme-ahead",
        evaluation:
          "Stale README-ahead autonomy: readme_ahead gap with empty pool coverage; consider_create.",
        evaluator_model: "claude-sonnet-4-5",
        id: "evaluation-stale-readme-ahead",
        project_id: project.id,
        score: 1,
      },
    };
    const taskRepository = {
      getProjectById: vi.fn(() => project),
      listRejectedTasksByProject: vi.fn(async () => [createRejectedTask(1)]),
      listUnfinishedTasks: vi.fn(async () => [createTask(1)]),
    };
    const dimensionRepository = {
      listDimensionEvaluations: vi.fn(
        async (dimensionId: keyof typeof evaluations) => [
          evaluations[dimensionId],
        ],
      ),
      listDimensions: vi.fn(async () => dimensions),
    };
    const sessionHandle = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      sessionId: "coordinator-session-priority-summary",
    };
    const sessionManager = {
      createSession: vi.fn(async () => sessionHandle),
    };
    const baselineRepository = {
      getLatestBaselineFacts: vi.fn(async () => ({
        commitSha: "baseline-123",
        fetchedAt: "2026-04-28T12:00:00.000Z",
        summary: "Current baseline summary",
      })),
    };

    const { createCoordinator } = await import("../src/coordinator.js");
    const coordinator = createCoordinator(project.id, {
      baselineRepository,
      dimensionRepository,
      projectDirectory: "/repo/workspace/project-1",
      sessionManager,
      taskRepository,
    });

    await vi.advanceTimersByTimeAsync(1);

    const prompt = sessionManager.createSession.mock.calls[0]?.[0].prompt;
    expect(prompt).toContain("Priority summary for candidate signals");
    expect(prompt).toMatch(
      /1\. Current README-ahead autonomy.*readme_ahead.*consider_create.*active_pool: 1 unfinished.*baseline: current/s,
    );
    expect(prompt).toMatch(
      /2\. Current baseline evidence.*gap.*score: 80.*active_pool: 1 unfinished.*baseline: current/s,
    );
    expect(prompt).toMatch(
      /3\. Stale README-ahead autonomy.*readme_ahead.*consider_create.*active_pool: 1 unfinished.*baseline: stale\/historical: evaluation commit older-baseline differs from current baseline-123; do not use independently as create evidence/s,
    );
    expect(prompt).toMatch(
      /4\. Stale create candidate.*consider_create.*active_pool: 1 unfinished.*baseline: stale\/historical: evaluation commit older-baseline differs from current baseline-123; do not use independently as create evidence/s,
    );
    expect(
      prompt.indexOf("Priority summary for candidate signals"),
    ).toBeLessThan(prompt.indexOf("Latest dimension_evaluations"));
    expect(prompt).toContain(
      "Stale README-ahead autonomy (stale-readme-ahead) score 1 at 2026-04-28T10:00:00.000Z; commit older-baseline",
    );
    expect(prompt).toContain(
      "Stale README-ahead autonomy: readme_ahead gap with empty pool coverage; consider_create.",
    );
    expect(prompt).toContain(
      "Current README-ahead autonomy: readme_ahead gap; consider_create.",
    );
    expect(prompt).toContain("Stale create candidate: consider_create");
    expect(prompt).toContain("Rejected Task feedback for this project");
    expect(prompt).toContain("rejected-project-1-1");
    expect(prompt).toContain("latest origin/main baseline facts");
    expect(prompt).toContain("current Active Task Pool");
    expect(prompt).toContain("source_metadata.task_spec_validation");
    expect(prompt).toContain("Never submit waiting_assumptions");
    expect(prompt).toContain("failed Task Spec validation");

    await coordinator[Symbol.asyncDispose]();
  });

  it("marks current dimension evaluations as matching the current baseline without stale limitations", async () => {
    const dimension = createDimension("dimension-current");
    const taskRepository = {
      getProjectById: vi.fn(() => project),
      listRejectedTasksByProject: vi.fn(async () => []),
      listUnfinishedTasks: vi.fn(async () => []),
    };
    const dimensionRepository = {
      listDimensionEvaluations: vi.fn(async (dimensionId: string) => [
        {
          commit_sha: "baseline-current",
          created_at: "2026-04-28T10:00:00.000Z",
          dimension_id: dimensionId,
          evaluation: "Current baseline still needs accessibility coverage.",
          evaluator_model: "claude-sonnet-4-5",
          id: "evaluation-current",
          project_id: project.id,
          score: 64,
        },
      ]),
      listDimensions: vi.fn(async () => [dimension]),
    };
    const sessionHandle = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      sessionId: "coordinator-session-current-evaluation",
    };
    const sessionManager = {
      createSession: vi.fn(async () => sessionHandle),
    };
    const baselineRepository = {
      getLatestBaselineFacts: vi.fn(async () => ({
        commitSha: "baseline-current",
        fetchedAt: "2026-04-28T12:00:00.000Z",
        summary: "Current baseline summary",
      })),
    };

    const { createCoordinator } = await import("../src/coordinator.js");
    const coordinator = createCoordinator(project.id, {
      baselineRepository,
      dimensionRepository,
      projectDirectory: "/repo/workspace/project-1",
      sessionManager,
      taskRepository,
    });

    await vi.advanceTimersByTimeAsync(1);

    const prompt = sessionManager.createSession.mock.calls[0]?.[0].prompt;
    expect(prompt).toContain("commit baseline-current");
    expect(prompt).toContain(
      "matches current origin/main baseline baseline-current",
    );
    expect(prompt).not.toContain("stale: evaluation commit baseline-current");
    expect(prompt).not.toContain("historical signal only");
    expect(prompt).toContain(
      "Current baseline still needs accessibility coverage.",
    );

    await coordinator[Symbol.asyncDispose]();
  });

  it("keeps the heartbeat loop alive after a transient repository failure", async () => {
    const taskRepository = {
      getProjectById: vi.fn(() => project),
      listRejectedTasksByProject: vi.fn(async () => []),
      listUnfinishedTasks: vi
        .fn()
        .mockRejectedValueOnce(new Error("temporary database lock"))
        .mockResolvedValue([]),
    };
    const dimensionRepository = {
      listDimensionEvaluations: vi.fn(async () => []),
      listDimensions: vi.fn(async () => []),
    };
    const sessionHandle = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      sessionId: "coordinator-session-after-retry",
    };
    const sessionManager = {
      createSession: vi.fn(async () => sessionHandle),
    };
    const baselineRepository = {
      getLatestBaselineFacts: vi.fn(async () => ({
        commitSha: "baseline-after-retry",
        fetchedAt: "2026-04-28T12:00:00.000Z",
        summary: "Retry baseline",
      })),
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { createCoordinator } = await import("../src/coordinator.js");
    const coordinator = createCoordinator(project.id, {
      baselineRepository,
      dimensionRepository,
      projectDirectory: "/repo/workspace/project-1",
      sessionManager,
      taskRepository,
    });

    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(1000);

    expect(warn).toHaveBeenCalledWith(
      "Coordinator heartbeat failed",
      expect.objectContaining({ error: "temporary database lock" }),
    );
    expect(sessionManager.createSession).toHaveBeenCalledOnce();

    await coordinator[Symbol.asyncDispose]();
  });

  it("does not start a second Coordinator session while one is pending, then starts another after settlement", async () => {
    const repositories = createBelowThresholdRepositories();
    const sessions = new Map<
      string,
      { session_id: string; state: "pending" | "rejected" | "resolved" }
    >();
    const sessionHandles = [
      {
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
        sessionId: "coordinator-session-1",
      },
      {
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
        sessionId: "coordinator-session-2",
      },
    ];
    const sessionManager = {
      createSession: vi.fn(async () => {
        const session = sessionHandles[sessions.size];
        if (!session) {
          throw new Error("unexpected session create");
        }

        sessions.set(session.sessionId, {
          session_id: session.sessionId,
          state: "pending",
        });
        return session;
      }),
    };
    const continuationSessionRepository = {
      getSessionById: vi.fn((sessionId: string) => sessions.get(sessionId)),
    };

    const { createCoordinator } = await import("../src/coordinator.js");
    const coordinator = createCoordinator(project.id, {
      ...repositories,
      continuationSessionRepository,
      heartbeatMs: 100,
      projectDirectory: "/repo/workspace/project-1",
      sessionManager,
    });

    await vi.advanceTimersByTimeAsync(1);
    expect(sessionManager.createSession).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(continuationSessionRepository.getSessionById).toHaveBeenCalledWith(
      "coordinator-session-1",
    );
    expect(sessionManager.createSession).toHaveBeenCalledTimes(1);

    const firstSession = sessions.get("coordinator-session-1");
    expect(firstSession).toBeDefined();
    if (firstSession) {
      firstSession.state = "resolved";
    }
    await vi.advanceTimersByTimeAsync(100);

    expect(sessionManager.createSession).toHaveBeenCalledTimes(2);
    expect(sessions.get("coordinator-session-2")?.state).toBe("pending");

    await coordinator[Symbol.asyncDispose]();

    expect(sessionHandles[0][Symbol.asyncDispose]).not.toHaveBeenCalled();
    expect(sessionHandles[1][Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("does not permanently stall the Coordinator lane after createSession fails", async () => {
    const repositories = createBelowThresholdRepositories();
    const sessionHandle = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      sessionId: "coordinator-session-after-create-failure",
    };
    const sessionManager = {
      createSession: vi
        .fn()
        .mockRejectedValueOnce(new Error("OpenCode create failed"))
        .mockResolvedValue(sessionHandle),
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { createCoordinator } = await import("../src/coordinator.js");
    const coordinator = createCoordinator(project.id, {
      ...repositories,
      heartbeatMs: 100,
      projectDirectory: "/repo/workspace/project-1",
      sessionManager,
    });

    await vi.advanceTimersByTimeAsync(1);
    expect(sessionManager.createSession).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "Coordinator heartbeat failed",
      expect.objectContaining({ error: "OpenCode create failed" }),
    );

    await vi.advanceTimersByTimeAsync(100);
    expect(sessionManager.createSession).toHaveBeenCalledTimes(2);

    await coordinator[Symbol.asyncDispose]();
    expect(sessionHandle[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("clears the active Coordinator session after settlement observation fails", async () => {
    const repositories = createBelowThresholdRepositories();
    const sessionHandles = [
      {
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
        sessionId: "coordinator-session-observation-fails",
      },
      {
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
        sessionId: "coordinator-session-after-observation-failure",
      },
    ];
    let sessionsCreated = 0;
    const sessionManager = {
      createSession: vi.fn(async () => {
        const session = sessionHandles[sessionsCreated++];
        if (!session) {
          throw new Error("unexpected session create");
        }

        return session;
      }),
    };
    const continuationSessionRepository = {
      getSessionById: vi
        .fn()
        .mockRejectedValueOnce(new Error("settlement lookup failed")),
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { createCoordinator } = await import("../src/coordinator.js");
    const coordinator = createCoordinator(project.id, {
      ...repositories,
      continuationSessionRepository,
      heartbeatMs: 100,
      projectDirectory: "/repo/workspace/project-1",
      sessionManager,
    });

    await vi.advanceTimersByTimeAsync(1);
    expect(sessionManager.createSession).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(warn).toHaveBeenCalledWith(
      "Coordinator heartbeat failed",
      expect.objectContaining({ error: "settlement lookup failed" }),
    );

    await vi.advanceTimersByTimeAsync(100);
    expect(sessionManager.createSession).toHaveBeenCalledTimes(2);

    await coordinator[Symbol.asyncDispose]();

    expect(sessionHandles[0][Symbol.asyncDispose]).not.toHaveBeenCalled();
    expect(sessionHandles[1][Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("does not create a duplicate Coordinator session after restart when persisted planning state points at a pending session", async () => {
    const repositories = createBelowThresholdRepositories();
    const coordinatorStateRepository = createCoordinatorStateRepository({
      active_task_count: 0,
      commit_sha: "baseline-retry",
      created_at: "2026-04-28T12:00:00.000Z",
      last_error: null,
      planning_input_hash: "persisted-hash",
      project_id: project.id,
      session_id: "coordinator-session-existing",
      state: "planning",
      threshold: 10,
      updated_at: "2026-04-28T12:00:00.000Z",
    });
    const continuationSessionRepository = {
      getSessionById: vi.fn(() => ({
        session_id: "coordinator-session-existing",
        state: "pending" as const,
      })),
    };
    const sessionManager = { createSession: vi.fn() };

    const { createCoordinator } = await import("../src/coordinator.js");
    const coordinator = createCoordinator(project.id, {
      ...repositories,
      continuationSessionRepository,
      coordinatorStateRepository,
      heartbeatMs: 100,
      projectDirectory: "/repo/workspace/project-1",
      sessionManager,
    });

    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(100);

    expect(continuationSessionRepository.getSessionById).toHaveBeenCalledWith(
      "coordinator-session-existing",
    );
    expect(sessionManager.createSession).not.toHaveBeenCalled();

    await coordinator[Symbol.asyncDispose]();
  });

  it("creates a new Coordinator session after the persisted pending session is rejected", async () => {
    const repositories = createBelowThresholdRepositories();
    const coordinatorStateRepository = createCoordinatorStateRepository({
      active_task_count: 0,
      commit_sha: "baseline-retry",
      created_at: "2026-04-28T12:00:00.000Z",
      last_error: null,
      planning_input_hash: "persisted-hash",
      project_id: project.id,
      session_id: "coordinator-session-rejected",
      state: "planning",
      threshold: 10,
      updated_at: "2026-04-28T12:00:00.000Z",
    });
    const sessionHandle = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      sessionId: "coordinator-session-next",
    };
    const sessionManager = { createSession: vi.fn(async () => sessionHandle) };

    const { createCoordinator } = await import("../src/coordinator.js");
    const coordinator = createCoordinator(project.id, {
      ...repositories,
      continuationSessionRepository: {
        getSessionById: vi.fn(() => ({
          session_id: "coordinator-session-rejected",
          state: "rejected" as const,
        })),
      },
      coordinatorStateRepository,
      projectDirectory: "/repo/workspace/project-1",
      sessionManager,
    });

    await vi.advanceTimersByTimeAsync(1);

    expect(sessionManager.createSession).toHaveBeenCalledOnce();
    expect(
      coordinatorStateRepository.upsertCoordinatorState,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: project.id,
        session_id: null,
        state: "planning",
      }),
    );
    expect(
      coordinatorStateRepository.upsertCoordinatorState,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: project.id,
        session_id: "coordinator-session-next",
        state: "planning",
      }),
    );

    await coordinator[Symbol.asyncDispose]();
  });

  it("does not permanently stall when persisted planning state has no session reference", async () => {
    const repositories = createBelowThresholdRepositories();
    const coordinatorStateRepository = createCoordinatorStateRepository({
      active_task_count: 0,
      commit_sha: "baseline-retry",
      created_at: "2026-04-28T12:00:00.000Z",
      last_error: null,
      planning_input_hash: "persisted-hash",
      project_id: project.id,
      session_id: null,
      state: "planning",
      threshold: 10,
      updated_at: "2026-04-28T12:00:00.000Z",
    });
    const sessionHandle = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      sessionId: "coordinator-session-recovered",
    };
    const sessionManager = { createSession: vi.fn(async () => sessionHandle) };

    const { createCoordinator } = await import("../src/coordinator.js");
    const coordinator = createCoordinator(project.id, {
      ...repositories,
      coordinatorStateRepository,
      projectDirectory: "/repo/workspace/project-1",
      sessionManager,
    });

    await vi.advanceTimersByTimeAsync(1);

    expect(sessionManager.createSession).toHaveBeenCalledOnce();
    expect(
      coordinatorStateRepository.upsertCoordinatorState,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: project.id,
        session_id: "coordinator-session-recovered",
        state: "planning",
      }),
    );

    await coordinator[Symbol.asyncDispose]();
  });

  it("clears persisted Coordinator state when the Active Task Pool reaches the threshold", async () => {
    const taskRepository = {
      getProjectById: vi.fn(() => project),
      listRejectedTasksByProject: vi.fn(),
      listUnfinishedTasks: vi.fn(async () =>
        Array.from({ length: 10 }, (_, index) => createTask(index)),
      ),
    };
    const coordinatorStateRepository = createCoordinatorStateRepository({
      active_task_count: 9,
      commit_sha: "baseline-old",
      created_at: "2026-04-28T12:00:00.000Z",
      last_error: null,
      planning_input_hash: "persisted-hash",
      project_id: project.id,
      session_id: "coordinator-session-existing",
      state: "planning",
      threshold: 10,
      updated_at: "2026-04-28T12:00:00.000Z",
    });

    const { createCoordinator } = await import("../src/coordinator.js");
    const coordinator = createCoordinator(project.id, {
      coordinatorStateRepository,
      dimensionRepository: {
        listDimensionEvaluations: vi.fn(),
        listDimensions: vi.fn(),
      },
      projectDirectory: "/repo/workspace/project-1",
      sessionManager: { createSession: vi.fn() },
      taskRepository,
    });

    await vi.advanceTimersByTimeAsync(1);

    expect(
      coordinatorStateRepository.clearCoordinatorState,
    ).toHaveBeenCalledWith(project.id);

    await coordinator[Symbol.asyncDispose]();
  });
});
