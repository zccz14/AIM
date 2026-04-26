import { optimizerStatusPath } from "@aim-ai/contract";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";

describe("optimizer routes", () => {
  it("reports, starts, and stops the optimizer runtime idempotently", async () => {
    const optimizerRuntime = {
      getStatus: vi
        .fn()
        .mockReturnValueOnce({ running: false })
        .mockReturnValueOnce({ running: true })
        .mockReturnValueOnce({ running: false }),
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    const app = createApp({ optimizerRuntime });

    await expect(
      (await app.request(optimizerStatusPath)).json(),
    ).resolves.toEqual({ running: false });

    const startResponse = await app.request("/optimizer/start", {
      method: "POST",
    });

    expect(startResponse.status).toBe(200);
    await expect(startResponse.json()).resolves.toEqual({ running: true });
    expect(optimizerRuntime.start).toHaveBeenCalledTimes(1);

    const stopResponse = await app.request("/optimizer/stop", {
      method: "POST",
    });

    expect(stopResponse.status).toBe(200);
    await expect(stopResponse.json()).resolves.toEqual({ running: false });
    expect(optimizerRuntime.stop).toHaveBeenCalledTimes(1);
  });
});
