import type { AgentSessionCoordinator } from "./agent-session-coordinator.js";
import type { ApiLogger } from "./api-logger.js";
import type { OptimizerLaneName } from "./optimizer-runtime.js";

type CreateAgentSessionLaneOptions = {
  coordinator: AgentSessionCoordinator;
  laneName: Exclude<OptimizerLaneName, "developer_follow_up">;
  logger?: ApiLogger;
  modelId: string;
  projectPath: string;
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

  const input = () => ({
    modelId: options.modelId,
    projectPath: options.projectPath,
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
      return scanPromise;
    }

    scanPromise = (async () => {
      if (!sessionId) {
        session = await options.coordinator.createSession(input());
        sessionId = session.sessionId;
        options.logger?.info(
          { lane: options.laneName, session_id: sessionId },
          "Optimizer lane session created",
        );

        return;
      }

      const state = await options.coordinator.getSessionState(
        sessionId,
        options.projectPath,
      );

      if (state === "idle") {
        await options.coordinator.sendPrompt(sessionId, input());
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
      })
      .catch((error) => {
        lastError = error instanceof Error ? error.message : String(error);
        options.logger?.error(
          { err: error, lane: options.laneName },
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
      loopPromise = (async () => {
        while (!stopRequested) {
          await beginScan();

          if (stopRequested) {
            break;
          }

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
        loopPromise = null;
      });
    },
    async [Symbol.asyncDispose]() {
      await Promise.all([shutdown(), disposeSession()]);
      await disposeSession();
    },
  };
};
