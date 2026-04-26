import { describe, expect, it, vi } from "vitest";

import { createAgentSessionLane } from "../src/agent-session-lane.js";

const createLane = (overrides = {}) =>
  createAgentSessionLane({
    coordinator: {
      createSession: vi.fn().mockResolvedValue({ sessionId: "session-1" }),
      getSessionState: vi.fn().mockResolvedValue("idle"),
      sendPrompt: vi.fn().mockResolvedValue(undefined),
    },
    laneName: "manager_evaluation",
    modelId: "claude-sonnet-4-5",
    projectPath: "/repo",
    prompt: "FOLLOW the aim-manager-guide SKILL.",
    providerId: "anthropic",
    title: "AIM Manager evaluation lane",
    ...overrides,
  });

describe("agent session lane", () => {
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
          .mockResolvedValueOnce({ sessionId: "session-1" }),
        getSessionState: vi.fn().mockResolvedValue("idle"),
        sendPrompt: vi.fn().mockResolvedValue(undefined),
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
