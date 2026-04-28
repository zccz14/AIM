import type { ApiLogger } from "./api-logger.js";
import type { OpenCodeSessionManager } from "./opencode-session-manager.js";
import type {
  OptimizerLaneState,
  OptimizerLaneStateInput,
} from "./optimizer-lane-state-repository.js";
import type { OptimizerLaneName } from "./optimizer-runtime.js";

type ContinuationSession = {
  reason: null | string;
  session_id: string;
  state: "pending" | "rejected" | "resolved";
  value: null | string;
};

type ContinuationSessionRepository = {
  getSessionById(sessionId: string): ContinuationSession | null;
};

type AgentSessionCreator = Pick<OpenCodeSessionManager, "createSession">;

type OptimizerLaneStateRepository = {
  getLaneState(
    projectId: string,
    laneName: Exclude<OptimizerLaneName, "developer_follow_up">,
  ): null | OptimizerLaneState;
  upsertLaneState(input: OptimizerLaneStateInput): OptimizerLaneState;
};

type CreateAgentSessionLaneOptions = {
  continuationSessionRepository?: ContinuationSessionRepository;
  coordinator: AgentSessionCreator;
  laneName: Exclude<OptimizerLaneName, "developer_follow_up">;
  laneStateRepository?: OptimizerLaneStateRepository;
  logger?: ApiLogger;
  modelId: string;
  prepareScanInput?: (
    input: AgentSessionLaneInput,
  ) => Promise<AgentSessionLaneInput | null>;
  projectId?: string;
  projectDirectory: string | (() => Promise<string>);
  prompt: string;
  providerId: string;
  title: string;
};

export type AgentSessionLaneInput = {
  modelId: string;
  projectDirectory: string;
  prompt: string;
  providerId: string;
  title: string;
};

type StartOptions = {
  intervalMs: number;
};

type ManagedAgentSession = Awaited<
  ReturnType<AgentSessionCreator["createSession"]>
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
  const usesPersistedContinuation = Boolean(
    options.continuationSessionRepository &&
      options.laneStateRepository &&
      options.projectId,
  );

  const resolveProjectDirectory = () =>
    typeof options.projectDirectory === "function"
      ? options.projectDirectory()
      : Promise.resolve(options.projectDirectory);

  const input = (projectDirectory: string): AgentSessionLaneInput => ({
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

  const persistedLaneStateInput = (
    input: Omit<OptimizerLaneStateInput, "lane_name" | "project_id">,
  ): OptimizerLaneStateInput | null => {
    if (!options.projectId) {
      return null;
    }

    return {
      lane_name: options.laneName,
      project_id: options.projectId,
      ...input,
    };
  };

  const persistLaneState = (
    input: Omit<OptimizerLaneStateInput, "lane_name" | "project_id">,
  ) => {
    const stateInput = persistedLaneStateInput(input);

    if (!stateInput) {
      return null;
    }

    return options.laneStateRepository?.upsertLaneState(stateInput) ?? null;
  };

  const restorePersistedSessionId = () => {
    if (!usesPersistedContinuation || sessionId || !options.projectId) {
      return null;
    }

    const persistedState = options.laneStateRepository?.getLaneState(
      options.projectId,
      options.laneName,
    );

    if (persistedState) {
      sessionId = persistedState.session_id;
      lastError = persistedState.last_error;
      lastScanAt = persistedState.last_scan_at;
    }

    return persistedState ?? null;
  };

  const consumePersistedSession = () => {
    if (!usesPersistedContinuation || !sessionId) {
      return false;
    }

    const continuationSession =
      options.continuationSessionRepository?.getSessionById(sessionId);

    if (continuationSession?.state === "pending") {
      return true;
    }

    if (continuationSession?.state === "resolved") {
      sessionId = null;
      persistLaneState({
        last_error: null,
        last_scan_at: new Date().toISOString(),
        session_id: null,
      });
      return true;
    }

    if (continuationSession?.state === "rejected") {
      lastError = continuationSession.reason ?? "Manager lane session rejected";
      sessionId = null;
      persistLaneState({
        last_error: lastError,
        last_scan_at: lastScanAt,
        session_id: null,
      });
      throw new Error(lastError);
    }

    return false;
  };

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
      restorePersistedSessionId();
      if (consumePersistedSession()) {
        return;
      }

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

      const scanInput = await (options.prepareScanInput?.(
        input(projectDirectory),
      ) ?? Promise.resolve(input(projectDirectory)));

      if (!scanInput) {
        options.logger?.info(
          {
            event: "optimizer_lane_scan_skipped",
            lane: options.laneName,
            project_directory: projectDirectory,
            reason: "no_scan_input",
            session_id: sessionId,
          },
          "Optimizer lane scan skipped",
        );
        return;
      }

      if (!sessionId) {
        session = await options.coordinator.createSession({
          directory: scanInput.projectDirectory,
          model: {
            modelID: scanInput.modelId,
            providerID: scanInput.providerId,
          },
          prompt: scanInput.prompt,
          title: scanInput.title,
        });
        sessionId = session.sessionId;
        if (usesPersistedContinuation) {
          persistLaneState({
            last_error: null,
            last_scan_at: lastScanAt,
            session_id: sessionId,
          });
        }
        options.logger?.info(
          { lane: options.laneName, session_id: sessionId },
          "Optimizer lane session created",
        );

        return;
      }

      return;
    })().finally(() => {
      scanPromise = null;
    });

    return scanPromise
      .then(() => {
        lastError = null;
        lastScanAt = new Date().toISOString();
        if (usesPersistedContinuation) {
          persistLaneState({
            last_error: null,
            last_scan_at: lastScanAt,
            session_id: sessionId,
          });
        }
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
    if (usesPersistedContinuation) {
      return;
    }

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
