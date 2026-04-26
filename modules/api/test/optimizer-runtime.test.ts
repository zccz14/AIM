import { describe, expect, it, vi } from "vitest";

import { createOptimizerRuntime } from "../src/optimizer-runtime.js";

describe("optimizer runtime", () => {
  it("starts and stops the scheduler idempotently while exposing running status", async () => {
    const scheduler = {
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    const runtime = createOptimizerRuntime({ intervalMs: 5_000, scheduler });

    expect(runtime.getStatus()).toEqual({ running: false });

    runtime.start();
    runtime.start();

    expect(runtime.getStatus()).toEqual({ running: true });
    expect(scheduler.start).toHaveBeenCalledOnce();
    expect(scheduler.start).toHaveBeenCalledWith({ intervalMs: 5_000 });

    await runtime.stop();
    await runtime.stop();

    expect(runtime.getStatus()).toEqual({ running: false });
    expect(scheduler.stop).toHaveBeenCalledOnce();
  });
});
