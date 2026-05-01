import { describe, expect, it, vi } from "vitest";

import { cancelableSleep } from "../src/cancelable-sleep.js";

describe("cancelableSleep", () => {
  it("resolves after the requested delay", async () => {
    vi.useFakeTimers();

    try {
      const result = cancelableSleep(100);

      await vi.advanceTimersByTimeAsync(99);
      await expect(
        Promise.race([result, Promise.resolve("pending")]),
      ).resolves.toBe("pending");

      await vi.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects immediately with the abort reason when the signal is already aborted", async () => {
    const reason = new Error("stop before waiting");
    const controller = new AbortController();
    controller.abort(reason);

    await expect(
      cancelableSleep(100, { signal: controller.signal }),
    ).rejects.toBe(reason);
  });

  it("rejects with the abort reason and clears the pending timer when aborted while waiting", async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

    try {
      const reason = new Error("stop while waiting");
      const controller = new AbortController();
      const result = cancelableSleep(100, { signal: controller.signal });

      controller.abort(reason);

      await expect(result).rejects.toBe(reason);
      expect(clearTimeoutSpy).toHaveBeenCalledOnce();
    } finally {
      clearTimeoutSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("removes the abort listener when aborted while waiting", async () => {
    vi.useFakeTimers();

    try {
      const reason = new Error("stop while waiting");
      const controller = new AbortController();
      const addEventListenerSpy = vi.spyOn(
        controller.signal,
        "addEventListener",
      );
      const removeEventListenerSpy = vi.spyOn(
        controller.signal,
        "removeEventListener",
      );
      const result = cancelableSleep(100, { signal: controller.signal });
      const abortListener = addEventListenerSpy.mock.calls.find(
        ([event]) => event === "abort",
      )?.[1];

      controller.abort(reason);

      await expect(result).rejects.toBe(reason);
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "abort",
        abortListener,
      );

      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });
});
