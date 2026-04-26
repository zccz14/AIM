import { describe, expect, it, vi } from "vitest";

import { createOptimizerRuntime } from "../src/optimizer-runtime.js";

describe("optimizer runtime", () => {
  it("starts and stops three optimizer lanes while exposing per-lane status", async () => {
    const managerLane = {
      scanOnce: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    const coordinatorLane = {
      scanOnce: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    const developerLane = {
      scanOnce: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
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

    await runtime.stop();

    expect(managerLane.stop).toHaveBeenCalledOnce();
    expect(coordinatorLane.stop).toHaveBeenCalledOnce();
    expect(developerLane.stop).toHaveBeenCalledOnce();
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
      scanOnce: vi.fn(),
      start: vi.fn(() => {
        throw new Error("manager unavailable");
      }),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    const healthyLane = {
      scanOnce: vi.fn(),
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
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

  it("starts and stops the scheduler idempotently while exposing running status", async () => {
    const scheduler = {
      scanOnce: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
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

    await runtime.stop();
    await runtime.stop();

    expect(runtime.getStatus()).toMatchObject({ running: false });
    expect(scheduler.stop).toHaveBeenCalledOnce();
  });

  it("records task-resolved events but only advances scheduler scans while running", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T12:00:00.000Z"));

    const scheduler = {
      scanOnce: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
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

    await runtime.stop();
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
      scanOnce: vi.fn().mockRejectedValue(new Error("developer lane offline")),
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
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
        lane: "developer_follow_up",
      }),
      "Optimizer lane failed while handling event",
    );
  });
});
