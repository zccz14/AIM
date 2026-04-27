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
      getSessionState: vi.fn().mockResolvedValue("idle"),
      sendPrompt: vi.fn().mockResolvedValue(undefined),
    },
    laneName: "manager_evaluation",
    modelId: "claude-sonnet-4-5",
    projectDirectory: "/repo",
    prompt: "FOLLOW the aim-manager-guide SKILL.",
    providerId: "anthropic",
    title: "AIM Manager evaluation lane",
    ...overrides,
  });

afterEach(() => {
  vi.useRealTimers();
});

describe("agent session lane", () => {
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
      getSessionState: vi.fn().mockResolvedValue("idle"),
      sendPrompt: vi.fn().mockResolvedValue(undefined),
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
    expect(coordinator.getSessionState).not.toHaveBeenCalled();
    expect(coordinator.sendPrompt).not.toHaveBeenCalled();
  });

  it("allows repeated lane async disposal without restarting stop behavior", async () => {
    vi.useFakeTimers();
    const coordinator = {
      createSession: vi.fn().mockResolvedValue(createSession()),
      getSessionState: vi.fn().mockResolvedValue("idle"),
      sendPrompt: vi.fn().mockResolvedValue(undefined),
    };
    const lane = createLane({ coordinator });

    lane.start({ intervalMs: 60_000 });
    await vi.waitFor(() => {
      expect(coordinator.createSession).toHaveBeenCalledOnce();
    });

    await lane[Symbol.asyncDispose]();
    await expect(lane[Symbol.asyncDispose]()).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(coordinator.getSessionState).not.toHaveBeenCalled();
    expect(coordinator.sendPrompt).not.toHaveBeenCalled();
  });

  it("releases the created agent session when the lane is disposed", async () => {
    const session = createSession();
    const coordinator = {
      createSession: vi.fn().mockResolvedValue(session),
      getSessionState: vi.fn().mockResolvedValue("idle"),
      sendPrompt: vi.fn().mockResolvedValue(undefined),
    };
    const lane = createLane({ coordinator });

    await lane.scanOnce();

    expect(session[Symbol.asyncDispose]).not.toHaveBeenCalled();

    await lane[Symbol.asyncDispose]();

    expect(session[Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it("resolves the project directory before creating or continuing a lane session", async () => {
    const coordinator = {
      createSession: vi.fn().mockResolvedValue(createSession()),
      getSessionState: vi.fn().mockResolvedValue("idle"),
      sendPrompt: vi.fn().mockResolvedValue(undefined),
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
    expect(coordinator.getSessionState).toHaveBeenCalledWith(
      "session-1",
      "/repo/current",
    );
    expect(coordinator.sendPrompt).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ projectDirectory: "/repo/current" }),
    );
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
