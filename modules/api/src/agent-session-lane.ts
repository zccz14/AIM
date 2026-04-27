import type { AgentSessionCoordinator } from "./agent-session-coordinator.js";
import type { ApiLogger } from "./api-logger.js";
import type { OptimizerLaneName } from "./optimizer-runtime.js";

type CreateAgentSessionLaneOptions = {
  coordinator: AgentSessionCoordinator;
  laneName: Exclude<OptimizerLaneName, "developer_follow_up">;
  logger?: ApiLogger;
  modelId: string;
  projectDirectory: string | (() => Promise<string>);
  prompt: string;
  providerId: string;
  title: string;
};

type StartOptions = {
  intervalMs: number;
};

type ManagedAgentSession = Awaited<
  ReturnType<AgentSessionCoordinator["createSession"]>
>;

export const createAgentSessionLane = (
  options: CreateAgentSessionLaneOptions,
) => {
  let sessionId: null | string = null;
  let scanPromise: null | Promise<void> = null;
  let loopPromise: null | Promise<void> = null;
  let lastError: null | string = null;
  let lastScanAt: null | string = null;
  let running = false;
  let stopRequested = false;
  let sleepTimer: NodeJS.Timeout | undefined;
  let wakeSleepingLoop: (() => void) | undefined;
  let session: ManagedAgentSession | null = null;
  let nextScanAfterMs: null | number = null;

  const resolveProjectDirectory = () =>
    typeof options.projectDirectory === "function"
      ? options.projectDirectory()
      : Promise.resolve(options.projectDirectory);

  const input = (projectDirectory: string) => ({
    modelId: options.modelId,
    projectDirectory,
    prompt: options.prompt,
    providerId: options.providerId,
    title: options.title,
  });

  const sleep = (intervalMs: number) =>
    new Promise<void>((resolve) => {
      sleepTimer = setTimeout(() => {
        sleepTimer = undefined;
        wakeSleepingLoop = undefined;
        resolve();
      }, intervalMs);
      wakeSleepingLoop = () => {
        if (sleepTimer) {
          clearTimeout(sleepTimer);
          sleepTimer = undefined;
        }
        wakeSleepingLoop = undefined;
        resolve();
      };
    });

  const beginScan = () => {
    if (scanPromise) {
      options.logger?.warn(
        {
          event: "optimizer_lane_scan_skipped",
          lane: options.laneName,
          reason: "scan_in_progress",
          session_id: sessionId,
        },
        "Optimizer lane scan skipped",
      );
      return scanPromise;
    }

    scanPromise = (async () => {
      const projectDirectory = await resolveProjectDirectory();
      options.logger?.info(
        {
          event: "optimizer_lane_scan_started",
          lane: options.laneName,
          project_directory: projectDirectory,
          session_id: sessionId,
        },
        "Optimizer lane scan started",
      );

      if (!sessionId) {
        session = await options.coordinator.createSession(
          input(projectDirectory),
        );
        sessionId = session.sessionId;
        options.logger?.info(
          { lane: options.laneName, session_id: sessionId },
          "Optimizer lane session created",
        );

        return;
      }

      const state = await options.coordinator.getSessionState(
        sessionId,
        projectDirectory,
      );

      if (state === "idle") {
        await options.coordinator.sendPrompt(
          sessionId,
          input(projectDirectory),
        );
        options.logger?.info(
          { lane: options.laneName, session_id: sessionId },
          "Optimizer lane session continued",
        );
      }
    })().finally(() => {
      scanPromise = null;
    });

    return scanPromise
      .then(() => {
        lastError = null;
        lastScanAt = new Date().toISOString();
        options.logger?.info(
          {
            event: "optimizer_lane_scan_succeeded",
            lane: options.laneName,
            last_scan_at: lastScanAt,
            next_scan_after_ms: nextScanAfterMs,
            session_id: sessionId,
          },
          "Optimizer lane scan succeeded",
        );
      })
      .catch((error) => {
        lastError = error instanceof Error ? error.message : String(error);
        options.logger?.error(
          {
            err: error,
            event: "optimizer_lane_scan_failed",
            lane: options.laneName,
            session_id: sessionId,
          },
          "Optimizer lane failed while scanning",
        );
      });
  };

  const shutdown = () => {
    stopRequested = true;
    wakeSleepingLoop?.();

    return Promise.all(
      [loopPromise, scanPromise].filter((promise): promise is Promise<void> =>
        Boolean(promise),
      ),
    ).then(() => undefined);
  };

  const disposeSession = async () => {
    const sessionToDispose = session;

    session = null;
    sessionId = null;
    await sessionToDispose?.[Symbol.asyncDispose]();
  };

  return {
    getStatus() {
      return {
        last_error: lastError,
        last_scan_at: lastScanAt,
        running,
      };
    },
    scanOnce() {
      return beginScan();
    },
    start(startOptions: StartOptions) {
      if (loopPromise) {
        return;
      }

      stopRequested = false;
      running = true;
      nextScanAfterMs = startOptions.intervalMs;
      options.logger?.info(
        {
          event: "optimizer_lane_started",
          interval_ms: startOptions.intervalMs,
          lane: options.laneName,
        },
        "Optimizer lane started",
      );
      loopPromise = (async () => {
        while (!stopRequested) {
          await beginScan();

          if (stopRequested) {
            break;
          }

          options.logger?.info(
            {
              event: "optimizer_lane_sleeping_until_next_tick",
              interval_ms: startOptions.intervalMs,
              lane: options.laneName,
              next_scan_after_ms: startOptions.intervalMs,
              session_id: sessionId,
            },
            "Optimizer lane waiting for next tick",
          );
          await sleep(startOptions.intervalMs);
        }
      })().finally(() => {
        if (sleepTimer) {
          clearTimeout(sleepTimer);
          sleepTimer = undefined;
        }
        wakeSleepingLoop = undefined;
        stopRequested = false;
        running = false;
        nextScanAfterMs = null;
        loopPromise = null;
      });
    },
    async [Symbol.asyncDispose]() {
      await Promise.all([shutdown(), disposeSession()]);
      await disposeSession();
    },
  };
};
