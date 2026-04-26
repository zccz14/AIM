import { describe, expect, it, vi } from "vitest";

import { createOptimizerRuntime } from "../src/optimizer-runtime.js";

describe("optimizer runtime", () => {
  it("starts and stops the scheduler idempotently while exposing running status", async () => {
    const scheduler = {
      scanOnce: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    const runtime = createOptimizerRuntime({ intervalMs: 5_000, scheduler });

    expect(runtime.getStatus()).toEqual({
      enabled_triggers: ["task_resolved"],
      last_event: null,
      last_scan_at: null,
      running: false,
    });

    runtime.start();
    runtime.start();

    expect(runtime.getStatus()).toEqual({
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
    const runtime = createOptimizerRuntime({ intervalMs: 5_000, scheduler });

    await runtime.handleEvent({ taskId: "task-1", type: "task_resolved" });

    expect(scheduler.scanOnce).not.toHaveBeenCalled();
    expect(runtime.getStatus()).toEqual({
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
    expect(runtime.getStatus()).toEqual({
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
});
