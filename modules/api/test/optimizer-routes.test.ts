import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";

describe("optimizer routes", () => {
  it("does not expose global optimizer runtime controls", async () => {
    const optimizerRuntime = {
      getStatus: vi.fn().mockReturnValue({
        enabled_triggers: ["task_resolved"],
        lanes: {
          coordinator_task_pool: {
            last_error: null,
            last_scan_at: null,
            running: false,
          },
          developer_follow_up: {
            last_error: null,
            last_scan_at: null,
            running: false,
          },
          manager_evaluation: {
            last_error: null,
            last_scan_at: null,
            running: false,
          },
        },
        last_event: null,
        last_scan_at: null,
        running: false,
      }),
      handleEvent: vi.fn(),
      start: vi.fn(),
      disable: vi.fn().mockResolvedValue(undefined),
    };
    const app = createApp({ optimizerRuntime });

    await expect(app.request("/optimizer/status")).resolves.toHaveProperty(
      "status",
      404,
    );
    await expect(
      app.request("/optimizer/start", { method: "POST" }),
    ).resolves.toHaveProperty("status", 404);
    await expect(
      app.request("/optimizer/stop", { method: "POST" }),
    ).resolves.toHaveProperty("status", 404);

    expect(optimizerRuntime.getStatus).not.toHaveBeenCalled();
    expect(optimizerRuntime.start).not.toHaveBeenCalled();
    expect(optimizerRuntime.disable).not.toHaveBeenCalled();
  });
});
