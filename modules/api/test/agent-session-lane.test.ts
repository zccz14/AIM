import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentSessionLane } from "../src/agent-session-lane.js";

const createSession = (sessionId = "session-1") => ({
  [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
  sessionId,
});

const createLane = (overrides = {}) =>
  createAgentSessionLane({
    coordinator: {
      createSession: vi.fn().mockResolvedValue(createSession()),
    },
    laneName: "manager_evaluation",
    modelId: "claude-sonnet-4-5",
    projectDirectory: "/repo",
    prompt: "FOLLOW the aim-manager-guide SKILL.",
    providerId: "anthropic",
    title: "AIM Manager evaluation lane",
    ...overrides,
  });

const coordinatorLaneOptions = {
  laneName: "coordinator_task_pool" as const,
  prompt: "FOLLOW the aim-coordinator-guide SKILL.",
  title: "AIM Coordinator task-pool lane",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("agent session lane", () => {
  it("creates a Manager lane session and persists lane state", async () => {
    const laneStateRepository = {
      getLaneState: vi.fn().mockReturnValue(null),
      upsertLaneState: vi.fn(),
    };
    const continuationSessionRepository = {
      createSession: vi.fn(),
      getSessionById: vi.fn().mockReturnValue(null),
    };
    const coordinator = {
      createSession: vi
        .fn()
        .mockResolvedValue(createSession("manager-session-1")),
    };
    const lane = createLane({
      continuationSessionRepository,
      coordinator,
      laneStateRepository,
      projectId: "project-1",
    });

    await lane.scanOnce();

    expect(coordinator.createSession).toHaveBeenCalledOnce();
    expect(laneStateRepository.upsertLaneState).toHaveBeenCalledWith(
      expect.objectContaining({
        lane_name: "manager_evaluation",
        last_error: null,
        project_id: "project-1",
        session_id: "manager-session-1",
      }),
    );
  });

  it("keeps persisted Manager sessions alive when the lane is disposed", async () => {
    const session = createSession("manager-session-1");
    const lane = createLane({
      continuationSessionRepository: {
        createSession: vi.fn(),
        getSessionById: vi.fn().mockReturnValue(null),
      },
      coordinator: {
        createSession: vi.fn().mockResolvedValue(session),
      },
      laneStateRepository: {
        getLaneState: vi.fn().mockReturnValue(null),
        upsertLaneState: vi.fn(),
      },
      projectId: "project-1",
    });

    await lane.scanOnce();
    await lane[Symbol.asyncDispose]();

    expect(session[Symbol.asyncDispose]).not.toHaveBeenCalled();
  });

  it("resumes a persisted pending Manager session without duplicate OpenCode work", async () => {
    const laneStateRepository = {
      getLaneState: vi.fn().mockReturnValue({
        lane_name: "manager_evaluation",
        last_error: null,
        last_scan_at: null,
        project_id: "project-1",
        session_id: "persisted-session",
      }),
      upsertLaneState: vi.fn(),
    };
    const continuationSessionRepository = {
      createSession: vi.fn(),
      getSessionById: vi.fn().mockReturnValue({
        continue_prompt: "FOLLOW the aim-manager-guide SKILL.",
        reason: null,
        session_id: "persisted-session",
        state: "pending",
        value: null,
      }),
    };
    const coordinator = {
      createSession: vi.fn().mockResolvedValue(createSession()),
    };
    const lane = createLane({
      continuationSessionRepository,
      coordinator,
      laneStateRepository,
      projectId: "project-1",
    });

    await lane.scanOnce();

    expect(coordinator.createSession).not.toHaveBeenCalled();
    expect(continuationSessionRepository.createSession).not.toHaveBeenCalled();
    expect(lane.getStatus()).toMatchObject({ last_error: null });
  });

  it("clears resolved persisted Manager sessions so a later scan can start fresh", async () => {
    const laneStateRepository = {
      getLaneState: vi.fn().mockReturnValue({
        lane_name: "manager_evaluation",
        last_error: null,
        last_scan_at: null,
        project_id: "project-1",
        session_id: "resolved-session",
      }),
      upsertLaneState: vi.fn(),
    };
    const continuationSessionRepository = {
      createSession: vi.fn(),
      getSessionById: vi.fn().mockReturnValue({
        continue_prompt: "FOLLOW the aim-manager-guide SKILL.",
        reason: null,
        session_id: "resolved-session",
        state: "resolved",
        value: "manager evaluation complete",
      }),
    };
    const lane = createLane({
      continuationSessionRepository,
      laneStateRepository,
      projectId: "project-1",
    });

    await lane.scanOnce();

    expect(laneStateRepository.upsertLaneState).toHaveBeenCalledWith(
      expect.objectContaining({
        lane_name: "manager_evaluation",
        last_error: null,
        project_id: "project-1",
        session_id: null,
      }),
    );
    expect(lane.getStatus()).toMatchObject({ last_error: null });
  });

  it("clears rejected persisted Manager sessions so the next scan can start fresh", async () => {
    let persistedLaneState = {
      lane_name: "manager_evaluation",
      last_error: null as null | string,
      last_scan_at: null,
      project_id: "project-1",
      session_id: "rejected-session" as null | string,
    };
    const laneStateRepository = {
      getLaneState: vi.fn(() => persistedLaneState),
      upsertLaneState: vi.fn((input) => {
        persistedLaneState = { ...persistedLaneState, ...input };
        return persistedLaneState;
      }),
    };
    const continuationSessionRepository = {
      createSession: vi.fn(),
      getSessionById: vi.fn().mockReturnValue({
        continue_prompt: "FOLLOW the aim-manager-guide SKILL.",
        reason: "manager blocked",
        session_id: "rejected-session",
        state: "rejected",
        value: null,
      }),
    };
    const coordinator = {
      createSession: vi.fn().mockResolvedValue(createSession()),
    };
    const lane = createLane({
      continuationSessionRepository,
      coordinator,
      laneStateRepository,
      projectId: "project-1",
    });

    await lane.scanOnce();

    expect(laneStateRepository.upsertLaneState).toHaveBeenCalledWith(
      expect.objectContaining({
        lane_name: "manager_evaluation",
        last_error: "manager blocked",
        project_id: "project-1",
        session_id: null,
      }),
    );
    expect(lane.getStatus()).toMatchObject({ last_error: "manager blocked" });

    await lane.scanOnce();

    expect(coordinator.createSession).toHaveBeenCalledOnce();
  });

  it("creates a Coordinator task-pool lane session and persists lane state", async () => {
    const laneStateRepository = {
      getLaneState: vi.fn().mockReturnValue(null),
      upsertLaneState: vi.fn(),
    };
    const continuationSessionRepository = {
      createSession: vi.fn(),
      getSessionById: vi.fn().mockReturnValue(null),
    };
    const coordinator = {
      createSession: vi
        .fn()
        .mockResolvedValue(createSession("coordinator-session-1")),
    };
    const lane = createLane({
      ...coordinatorLaneOptions,
      continuationSessionRepository,
      coordinator,
      laneStateRepository,
      projectId: "project-1",
    });

    await lane.scanOnce();

    expect(coordinator.createSession).toHaveBeenCalledOnce();
    expect(laneStateRepository.upsertLaneState).toHaveBeenCalledWith(
      expect.objectContaining({
        lane_name: "coordinator_task_pool",
        last_error: null,
        project_id: "project-1",
        session_id: "coordinator-session-1",
      }),
    );
  });

  it("resumes a persisted pending Coordinator session without polling OpenCode idle or sending continuation prompts", async () => {
    const laneStateRepository = {
      getLaneState: vi.fn().mockReturnValue({
        lane_name: "coordinator_task_pool",
        last_error: null,
        last_scan_at: null,
        project_id: "project-1",
        session_id: "persisted-coordinator-session",
      }),
      upsertLaneState: vi.fn(),
    };
    const continuationSessionRepository = {
      createSession: vi.fn(),
      getSessionById: vi.fn().mockReturnValue({
        continue_prompt: "FOLLOW the aim-coordinator-guide SKILL.",
        reason: null,
        session_id: "persisted-coordinator-session",
        state: "pending",
        value: null,
      }),
    };
    const coordinator = {
      createSession: vi.fn().mockResolvedValue(createSession()),
    };
    const lane = createLane({
      ...coordinatorLaneOptions,
      continuationSessionRepository,
      coordinator,
      laneStateRepository,
      projectId: "project-1",
    });

    await lane.scanOnce();

    expect(coordinator.createSession).not.toHaveBeenCalled();
    expect(continuationSessionRepository.createSession).not.toHaveBeenCalled();
    expect(lane.getStatus()).toMatchObject({ last_error: null });
  });

  it("clears resolved Coordinator sessions without using resolved value as task-pool output", async () => {
    const laneStateRepository = {
      getLaneState: vi.fn().mockReturnValue({
        lane_name: "coordinator_task_pool",
        last_error: "previous blocker",
        last_scan_at: null,
        project_id: "project-1",
        session_id: "resolved-coordinator-session",
      }),
      upsertLaneState: vi.fn(),
    };
    const continuationSessionRepository = {
      createSession: vi.fn(),
      getSessionById: vi.fn().mockReturnValue({
        continue_prompt: "FOLLOW the aim-coordinator-guide SKILL.",
        reason: null,
        session_id: "resolved-coordinator-session",
        state: "resolved",
        value:
          '{"operations":[{"type":"create","title":"must not be parsed"}]}',
      }),
    };
    const coordinator = {
      createSession: vi.fn().mockResolvedValue(createSession()),
    };
    const lane = createLane({
      ...coordinatorLaneOptions,
      continuationSessionRepository,
      coordinator,
      laneStateRepository,
      projectId: "project-1",
    });

    await lane.scanOnce();

    expect(coordinator.createSession).not.toHaveBeenCalled();
    expect(laneStateRepository.upsertLaneState).toHaveBeenCalledWith(
      expect.objectContaining({
        lane_name: "coordinator_task_pool",
        last_error: null,
        project_id: "project-1",
        session_id: null,
      }),
    );
    expect(lane.getStatus()).toMatchObject({ last_error: null });
  });

  it("clears rejected Coordinator sessions so the next scan can start fresh", async () => {
    let persistedLaneState = {
      lane_name: "coordinator_task_pool",
      last_error: null as null | string,
      last_scan_at: null,
      project_id: "project-1",
      session_id: "rejected-coordinator-session" as null | string,
    };
    const laneStateRepository = {
      getLaneState: vi.fn(() => persistedLaneState),
      upsertLaneState: vi.fn((input) => {
        persistedLaneState = { ...persistedLaneState, ...input };
        return persistedLaneState;
      }),
    };
    const continuationSessionRepository = {
      createSession: vi.fn(),
      getSessionById: vi.fn().mockReturnValue({
        continue_prompt: "FOLLOW the aim-coordinator-guide SKILL.",
        reason: "coordinator needs operator review",
        session_id: "rejected-coordinator-session",
        state: "rejected",
        value: null,
      }),
    };
    const coordinator = {
      createSession: vi.fn().mockResolvedValue(createSession()),
    };
    const lane = createLane({
      ...coordinatorLaneOptions,
      continuationSessionRepository,
      coordinator,
      laneStateRepository,
      projectId: "project-1",
    });

    await lane.scanOnce();

    expect(laneStateRepository.upsertLaneState).toHaveBeenCalledWith(
      expect.objectContaining({
        lane_name: "coordinator_task_pool",
        last_error: "coordinator needs operator review",
        project_id: "project-1",
        session_id: null,
      }),
    );
    expect(lane.getStatus()).toMatchObject({
      last_error: "coordinator needs operator review",
    });

    await lane.scanOnce();

    expect(coordinator.createSession).toHaveBeenCalledOnce();
  });

  it("logs scan start, success, skipped overlap, and next tick context", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T12:00:00.000Z"));
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    let releaseCreate: (() => void) | undefined;
    const coordinator = {
      createSession: vi.fn(
        () =>
          new Promise<ReturnType<typeof createSession>>((resolve) => {
            releaseCreate = () => resolve(createSession());
          }),
      ),
    };
    const lane = createLane({
      coordinator,
      logger,
      projectDirectory: "/repo/project-a",
    });

    const firstScan = lane.scanOnce();
    await vi.waitFor(() => {
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "optimizer_lane_scan_started",
          lane: "manager_evaluation",
          project_directory: "/repo/project-a",
        }),
        "Optimizer lane scan started",
      );
    });

    const overlappingScan = lane.scanOnce();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "optimizer_lane_scan_skipped",
        lane: "manager_evaluation",
        reason: "scan_in_progress",
      }),
      "Optimizer lane scan skipped",
    );

    releaseCreate?.();
    await Promise.all([firstScan, overlappingScan]);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "optimizer_lane_scan_succeeded",
        lane: "manager_evaluation",
        next_scan_after_ms: null,
        session_id: "session-1",
      }),
      "Optimizer lane scan succeeded",
    );

    lane.start({ intervalMs: 60_000 });
    await vi.waitFor(() => {
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "optimizer_lane_sleeping_until_next_tick",
          interval_ms: 60_000,
          lane: "manager_evaluation",
          next_scan_after_ms: 60_000,
        }),
        "Optimizer lane waiting for next tick",
      );
    });

    await lane[Symbol.asyncDispose]();
    vi.useRealTimers();
  });

  it("does not expose a public stop lifecycle method", () => {
    const lane = createLane();

    expect("stop" in lane).toBe(false);
    expect("dispose" in lane).toBe(false);
    expect(lane[Symbol.asyncDispose]).toEqual(expect.any(Function));
  });

  it("stops a sleeping lane loop when an await using scope exits", async () => {
    vi.useFakeTimers();
    const coordinator = {
      createSession: vi.fn().mockResolvedValue(createSession()),
    };
    const lanePromise = (async () => {
      await using lane = createLane({ coordinator });

      lane.start({ intervalMs: 60_000 });
      await vi.waitFor(() => {
        expect(coordinator.createSession).toHaveBeenCalledOnce();
      });

      return lane;
    })();

    await expect(lanePromise).resolves.toBeDefined();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(coordinator.createSession).toHaveBeenCalledOnce();
  });

  it("allows repeated lane async disposal without restarting stop behavior", async () => {
    vi.useFakeTimers();
    const coordinator = {
      createSession: vi.fn().mockResolvedValue(createSession()),
    };
    const lane = createLane({ coordinator });

    lane.start({ intervalMs: 60_000 });
    await vi.waitFor(() => {
      expect(coordinator.createSession).toHaveBeenCalledOnce();
    });

    await lane[Symbol.asyncDispose]();
    await expect(lane[Symbol.asyncDispose]()).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(coordinator.createSession).toHaveBeenCalledOnce();
  });

  it("releases the created agent session when the lane is disposed", async () => {
    const session = createSession();
    const coordinator = {
      createSession: vi.fn().mockResolvedValue(session),
    };
    const lane = createLane({ coordinator });

    await lane.scanOnce();

    expect(session[Symbol.asyncDispose]).not.toHaveBeenCalled();

    await lane[Symbol.asyncDispose]();

    expect(session[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("does not poll or continue an existing non-persisted lane session", async () => {
    const coordinator = {
      createSession: vi.fn().mockResolvedValue(createSession()),
    };
    const resolveProjectDirectory = vi
      .fn()
      .mockResolvedValueOnce("/repo/first")
      .mockResolvedValueOnce("/repo/current");
    const lane = createLane({
      coordinator,
      projectDirectory: resolveProjectDirectory,
    });

    await lane.scanOnce();
    await lane.scanOnce();

    expect(resolveProjectDirectory).toHaveBeenCalledTimes(2);
    expect(coordinator.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ projectDirectory: "/repo/first" }),
    );
    expect(coordinator.createSession).toHaveBeenCalledOnce();
    expect(lane.getStatus()).toMatchObject({ last_error: null });
  });

  it("skips OpenCode interaction when scan input preparation returns null", async () => {
    const coordinator = {
      createSession: vi.fn().mockResolvedValue(createSession()),
    };
    const lane = createLane({
      coordinator,
      prepareScanInput: vi.fn().mockResolvedValue(null),
    });

    await lane.scanOnce();

    expect(coordinator.createSession).not.toHaveBeenCalled();
  });

  it("uses prepared scan input only when creating an OpenCode session", async () => {
    const coordinator = {
      createSession: vi.fn().mockResolvedValue(createSession()),
    };
    const lane = createLane({
      coordinator,
      prepareScanInput: vi
        .fn()
        .mockResolvedValueOnce({
          modelId: "claude-sonnet-4-5",
          projectDirectory: "/repo",
          prompt:
            'FOLLOW the aim-manager-guide SKILL. Evaluate only dimension_id values: "dimension-api", "dimension-docs".',
          providerId: "anthropic",
          title: "AIM Manager evaluation lane",
        })
        .mockResolvedValueOnce({
          modelId: "claude-sonnet-4-5",
          projectDirectory: "/repo",
          prompt:
            'FOLLOW the aim-manager-guide SKILL. Evaluate only dimension_id values: "dimension-docs".',
          providerId: "anthropic",
          title: "AIM Manager evaluation lane",
        }),
    });

    await lane.scanOnce();
    await lane.scanOnce();

    expect(coordinator.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('"dimension-api", "dimension-docs"'),
      }),
    );
    expect(coordinator.createSession).toHaveBeenCalledOnce();
    expect(lane.getStatus()).toMatchObject({ last_error: null });
  });

  it("exposes scan errors and successful scan timestamps for optimizer status", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T12:00:00.000Z"));
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const lane = createLane({
      coordinator: {
        createSession: vi
          .fn()
          .mockRejectedValueOnce(new Error("manager session failed"))
          .mockResolvedValueOnce(createSession()),
      },
      logger,
    });

    await lane.scanOnce();

    expect(lane.getStatus()).toEqual({
      last_error: "manager session failed",
      last_scan_at: null,
      running: false,
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        lane: "manager_evaluation",
      }),
      "Optimizer lane failed while scanning",
    );

    await lane.scanOnce();

    expect(lane.getStatus()).toEqual({
      last_error: null,
      last_scan_at: "2026-04-26T12:00:00.000Z",
      running: false,
    });
    vi.useRealTimers();
  });
});
