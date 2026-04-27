import { describe, expect, it, vi } from "vitest";

import { createOptimizerRuntime } from "../src/optimizer-runtime.js";

describe("optimizer runtime", () => {
  it("logs optimizer lifecycle and skipped duplicate starts with lane counts", async () => {
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const managerLane = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
    };
    const developerLane = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
    };
    const runtime = createOptimizerRuntime({
      intervalMs: 5_000,
      lanes: [
        { lane: managerLane, name: "manager_evaluation" },
        { lane: developerLane, name: "developer_follow_up" },
      ],
      logger,
    });

    runtime.start();
    runtime.start();
    await runtime.disable();

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "optimizer_starting",
        interval_ms: 5_000,
        lane_count: 2,
        lanes: ["manager_evaluation", "developer_follow_up"],
      }),
      "Optimizer runtime starting",
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "optimizer_started",
        lane_count: 2,
        started_lane_count: 2,
      }),
      "Optimizer runtime started",
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "optimizer_start_skipped" }),
      "Optimizer runtime start skipped because it is already running",
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "optimizer_stopped", lane_count: 2 }),
      "Optimizer runtime stopped",
    );
  });

  it("logs skipped optimizer events with trigger and running context", async () => {
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const runtime = createOptimizerRuntime({
      intervalMs: 5_000,
      lanes: [],
      logger,
    });

    await runtime.handleEvent({ taskId: "task-1", type: "task_resolved" });

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "optimizer_event_skipped",
        reason: "not_running",
        running: false,
        task_id: "task-1",
        trigger: "task_resolved",
      }),
      "Optimizer event skipped",
    );
  });

  it("does not expose public lifecycle stop or dispose methods", () => {
    const runtime = createOptimizerRuntime({ intervalMs: 5_000, lanes: [] });

    expect("stop" in runtime).toBe(false);
    expect("dispose" in runtime).toBe(false);
    expect(runtime[Symbol.asyncDispose]).toEqual(expect.any(Function));
  });

  it("cleans up async-disposable optimizer lanes without requiring lane stop methods", async () => {
    const disposeOrder: string[] = [];
    const managerLane = {
      [Symbol.asyncDispose]: vi.fn(async () => {
        disposeOrder.push("manager_evaluation");
      }),
      scanOnce: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
    };
    const developerLane = {
      [Symbol.asyncDispose]: vi.fn(async () => {
        disposeOrder.push("developer_follow_up");
      }),
      scanOnce: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
    };
    const runtime = createOptimizerRuntime({
      intervalMs: 5_000,
      lanes: [
        { lane: managerLane, name: "manager_evaluation" },
        { lane: developerLane, name: "developer_follow_up" },
      ],
    });

    runtime.start();
    await runtime[Symbol.asyncDispose]();

    expect(disposeOrder).toEqual(["developer_follow_up", "manager_evaluation"]);
    expect(runtime.getStatus()).toMatchObject({ running: false });
    expect(managerLane[Symbol.asyncDispose]).toHaveBeenCalledOnce();
    expect(developerLane[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("starts and disables three optimizer lanes while exposing per-lane status", async () => {
    const managerLane = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
    };
    const coordinatorLane = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
    };
    const developerLane = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
    };
    const runtime = createOptimizerRuntime({
      intervalMs: 5_000,
      lanes: [
        { lane: managerLane, name: "manager_evaluation" },
        { lane: coordinatorLane, name: "coordinator_task_pool" },
        { lane: developerLane, name: "developer_follow_up" },
      ],
    });

    expect(runtime.getStatus()).toMatchObject({
      lanes: {
        coordinator_task_pool: { running: false },
        developer_follow_up: { running: false },
        manager_evaluation: { running: false },
      },
      running: false,
    });

    runtime.start();

    expect(managerLane.start).toHaveBeenCalledWith({ intervalMs: 5_000 });
    expect(coordinatorLane.start).toHaveBeenCalledWith({ intervalMs: 5_000 });
    expect(developerLane.start).toHaveBeenCalledWith({ intervalMs: 5_000 });
    expect(runtime.getStatus()).toMatchObject({
      lanes: {
        coordinator_task_pool: { running: true },
        developer_follow_up: { running: true },
        manager_evaluation: { running: true },
      },
      running: true,
    });

    await runtime.disable();

    expect(managerLane[Symbol.asyncDispose]).toHaveBeenCalledOnce();
    expect(coordinatorLane[Symbol.asyncDispose]).toHaveBeenCalledOnce();
    expect(developerLane[Symbol.asyncDispose]).toHaveBeenCalledOnce();
    expect(runtime.getStatus()).toMatchObject({
      lanes: {
        coordinator_task_pool: { running: false },
        developer_follow_up: { running: false },
        manager_evaluation: { running: false },
      },
      running: false,
    });
  });

  it("isolates lane startup failures without stopping other optimizer lanes", () => {
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const failingLane = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn(),
      start: vi.fn(() => {
        throw new Error("manager unavailable");
      }),
    };
    const healthyLane = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };
    const runtime = createOptimizerRuntime({
      intervalMs: 5_000,
      lanes: [
        { lane: failingLane, name: "manager_evaluation" },
        { lane: healthyLane, name: "developer_follow_up" },
      ],
      logger,
    });

    expect(() => runtime.start()).not.toThrow();

    expect(healthyLane.start).toHaveBeenCalledOnce();
    expect(runtime.getStatus()).toMatchObject({
      lanes: {
        developer_follow_up: { last_error: null, running: true },
        manager_evaluation: {
          last_error: "manager unavailable",
          running: false,
        },
      },
      running: true,
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        lane: "manager_evaluation",
      }),
      "Optimizer lane failed to start",
    );
  });

  it("aggregates duplicate project lane statuses under compatible lane names", () => {
    const managerLaneA = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn(),
      start: vi.fn(),
    };
    const managerLaneB = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn(),
      start: vi.fn(() => {
        throw new Error("project b unavailable");
      }),
    };
    const runtime = createOptimizerRuntime({
      intervalMs: 5_000,
      lanes: [
        { lane: managerLaneA, name: "manager_evaluation" },
        { lane: managerLaneB, name: "manager_evaluation" },
      ],
    });

    runtime.start();

    expect(runtime.getStatus()).toMatchObject({
      lanes: {
        manager_evaluation: {
          last_error: "project b unavailable",
          running: true,
        },
      },
      running: true,
    });
  });

  it("starts and disables the scheduler idempotently while exposing running status", async () => {
    const scheduler = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
    };
    const runtime = createOptimizerRuntime({
      intervalMs: 5_000,
      lanes: [{ lane: scheduler, name: "developer_follow_up" }],
    });

    expect(runtime.getStatus()).toMatchObject({
      enabled_triggers: ["task_resolved"],
      last_event: null,
      last_scan_at: null,
      running: false,
    });

    runtime.start();
    runtime.start();

    expect(runtime.getStatus()).toMatchObject({
      enabled_triggers: ["task_resolved"],
      last_event: null,
      last_scan_at: null,
      running: true,
    });
    expect(scheduler.start).toHaveBeenCalledOnce();
    expect(scheduler.start).toHaveBeenCalledWith({ intervalMs: 5_000 });

    await runtime.disable();
    await runtime.disable();

    expect(runtime.getStatus()).toMatchObject({ running: false });
    expect(scheduler[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("supports await using cleanup for optimizer lanes in reverse registration order", async () => {
    const disposeOrder: string[] = [];
    const managerLane = {
      [Symbol.asyncDispose]: vi.fn().mockImplementation(async () => {
        disposeOrder.push("manager_evaluation");
      }),
      scanOnce: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
    };
    const coordinatorLane = {
      [Symbol.asyncDispose]: vi.fn().mockImplementation(async () => {
        disposeOrder.push("coordinator_task_pool");
      }),
      scanOnce: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
    };
    const developerLane = {
      [Symbol.asyncDispose]: vi.fn().mockImplementation(async () => {
        disposeOrder.push("developer_follow_up");
      }),
      scanOnce: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
    };

    await (async () => {
      await using runtime = createOptimizerRuntime({
        intervalMs: 5_000,
        lanes: [
          { lane: managerLane, name: "manager_evaluation" },
          { lane: coordinatorLane, name: "coordinator_task_pool" },
          { lane: developerLane, name: "developer_follow_up" },
        ],
      });

      runtime.start();
      expect(runtime.getStatus()).toMatchObject({ running: true });
    })();

    expect(disposeOrder).toEqual([
      "developer_follow_up",
      "coordinator_task_pool",
      "manager_evaluation",
    ]);
    expect(managerLane[Symbol.asyncDispose]).toHaveBeenCalledOnce();
    expect(coordinatorLane[Symbol.asyncDispose]).toHaveBeenCalledOnce();
    expect(developerLane[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("keeps optimizer async disposal idempotent", async () => {
    const scheduler = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
    };
    const runtime = createOptimizerRuntime({
      intervalMs: 5_000,
      lanes: [{ lane: scheduler, name: "developer_follow_up" }],
    });

    await (async () => {
      await using _firstRegistration = runtime;
      await using _secondRegistration = runtime;

      runtime.start();
    })();

    expect(runtime.getStatus()).toMatchObject({ running: false });
    expect(scheduler[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("records task-resolved events but only advances scheduler scans while running", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T12:00:00.000Z"));

    const scheduler = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
    };
    const runtime = createOptimizerRuntime({
      intervalMs: 5_000,
      lanes: [{ lane: scheduler, name: "developer_follow_up" }],
    });

    await runtime.handleEvent({ taskId: "task-1", type: "task_resolved" });

    expect(scheduler.scanOnce).not.toHaveBeenCalled();
    expect(runtime.getStatus()).toMatchObject({
      enabled_triggers: ["task_resolved"],
      last_event: {
        task_id: "task-1",
        triggered_scan: false,
        type: "task_resolved",
      },
      last_scan_at: null,
      running: false,
    });

    runtime.start();
    await runtime.handleEvent({ taskId: "task-2", type: "task_resolved" });

    expect(scheduler.scanOnce).toHaveBeenCalledOnce();
    expect(scheduler.scanOnce).toHaveBeenCalledWith({
      resolvedTaskId: "task-2",
    });
    expect(runtime.getStatus()).toMatchObject({
      enabled_triggers: ["task_resolved"],
      last_event: {
        task_id: "task-2",
        triggered_scan: true,
        type: "task_resolved",
      },
      last_scan_at: "2026-04-26T12:00:00.000Z",
      running: true,
    });

    await runtime.disable();
    await runtime.handleEvent({ taskId: "task-3", type: "task_resolved" });

    expect(scheduler.scanOnce).toHaveBeenCalledOnce();
    expect(runtime.getStatus()).toMatchObject({
      last_event: {
        task_id: "task-3",
        triggered_scan: false,
        type: "task_resolved",
      },
      running: false,
    });

    vi.useRealTimers();
  });

  it("records developer follow-up scan failures from task-resolved events without throwing", async () => {
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const scheduler = {
      [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      scanOnce: vi.fn().mockRejectedValue(new Error("developer lane offline")),
      start: vi.fn(),
    };
    const runtime = createOptimizerRuntime({
      intervalMs: 5_000,
      lanes: [{ lane: scheduler, name: "developer_follow_up" }],
      logger,
    });

    runtime.start();

    await expect(
      runtime.handleEvent({ taskId: "task-2", type: "task_resolved" }),
    ).resolves.toBeUndefined();
    expect(runtime.getStatus()).toMatchObject({
      lanes: {
        developer_follow_up: {
          last_error: "developer lane offline",
          running: true,
        },
      },
      last_event: {
        task_id: "task-2",
        triggered_scan: true,
        type: "task_resolved",
      },
      last_scan_at: null,
      running: true,
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        event: "optimizer_event_scan_failed",
        lane: "developer_follow_up",
        task_id: "task-2",
        trigger: "task_resolved",
      }),
      "Optimizer lane failed while handling event",
    );
  });
});
