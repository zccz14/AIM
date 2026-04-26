import { optimizerStatusPath } from "@aim-ai/contract";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";

const createStatus = (running: boolean) => ({
  enabled_triggers: ["task_resolved"] as const,
  lanes: {
    coordinator_task_pool: {
      last_error: null,
      last_scan_at: null,
      running,
    },
    developer_follow_up: {
      last_error: null,
      last_scan_at: null,
      running,
    },
    manager_evaluation: {
      last_error: null,
      last_scan_at: null,
      running,
    },
  },
  last_event: null,
  last_scan_at: null,
  running,
});

describe("optimizer routes", () => {
  it("reports, starts, and stops the optimizer runtime idempotently", async () => {
    const optimizerRuntime = {
      getStatus: vi
        .fn()
        .mockReturnValueOnce(createStatus(false))
        .mockReturnValueOnce(createStatus(true))
        .mockReturnValueOnce(createStatus(false)),
      handleEvent: vi.fn(),
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    const app = createApp({ optimizerRuntime });

    await expect(
      (await app.request(optimizerStatusPath)).json(),
    ).resolves.toEqual(createStatus(false));

    const startResponse = await app.request("/optimizer/start", {
      method: "POST",
    });

    expect(startResponse.status).toBe(200);
    await expect(startResponse.json()).resolves.toEqual(createStatus(true));
    expect(optimizerRuntime.start).toHaveBeenCalledTimes(1);

    const stopResponse = await app.request("/optimizer/stop", {
      method: "POST",
    });

    expect(stopResponse.status).toBe(200);
    await expect(stopResponse.json()).resolves.toEqual(createStatus(false));
    expect(optimizerRuntime.stop).toHaveBeenCalledTimes(1);
  });
});
