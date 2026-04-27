import type { ApiLogger } from "./api-logger.js";

type OptimizerLaneStatus = {
  last_error: null | string;
  last_scan_at: null | string;
  running: boolean;
};

type OptimizerLaneScheduler = AsyncDisposable & {
  getStatus?(): {
    last_error: null | string;
    last_scan_at: null | string;
    running: boolean;
  };
  scanOnce(context?: { resolvedTaskId?: string }): Promise<void> | void;
  start(options: { intervalMs: number }): void;
};

export type OptimizerLaneName =
  | "coordinator_task_pool"
  | "developer_follow_up"
  | "manager_evaluation";

export type OptimizerLaneRegistration = {
  lane: OptimizerLaneScheduler;
  name: OptimizerLaneName;
};

export type OptimizerEvent = {
  taskId: string;
  type: "task_resolved";
};

type OptimizerStatus = {
  enabled_triggers: OptimizerEvent["type"][];
  last_event: null | {
    task_id: string;
    triggered_scan: boolean;
    type: OptimizerEvent["type"];
  };
  last_scan_at: null | string;
  lanes: Record<OptimizerLaneName, OptimizerLaneStatus>;
  running: boolean;
};

export type OptimizerRuntime = AsyncDisposable & {
  disable(): Promise<void>;
  getStatus(): OptimizerStatus;
  handleEvent(event: OptimizerEvent): Promise<void>;
  start(): void;
};

export const createOptimizerRuntime = ({
  intervalMs,
  lanes,
  logger,
}: {
  intervalMs: number;
  lanes: OptimizerLaneRegistration[];
  logger?: ApiLogger;
}): OptimizerRuntime => {
  let running = false;
  let lastEvent: OptimizerStatus["last_event"] = null;
  let lastScanAt: OptimizerStatus["last_scan_at"] = null;
  let stopPromise: Promise<void> | null = null;
  const registrations = lanes.map(({ lane, name }) => ({
    lane,
    name,
    state: {
      last_error: null as null | string,
      last_scan_at: null as null | string,
      running: false,
    },
  }));

  const aggregateLaneStatus = (name: OptimizerLaneName) => {
    const statuses = registrations
      .filter((registration) => registration.name === name)
      .map(({ lane, state }) => lane.getStatus?.() ?? state);

    return {
      last_error:
        statuses.find((status) => status.last_error)?.last_error ?? null,
      last_scan_at:
        statuses
          .map((status) => status.last_scan_at)
          .filter((value) => value !== null)
          .sort()
          .at(-1) ?? null,
      running: statuses.some((status) => status.running),
    };
  };

  const laneStatus = () => {
    const entries = [
      "manager_evaluation",
      "coordinator_task_pool",
      "developer_follow_up",
    ].map((name) => [name, aggregateLaneStatus(name as OptimizerLaneName)]);

    return Object.fromEntries(entries) as OptimizerStatus["lanes"];
  };

  const recordLaneError = (name: OptimizerLaneName, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);

    logger?.error({ err: error, lane: name }, "Optimizer lane failed to start");

    return message;
  };

  const disable = async () => {
    if (stopPromise) {
      await stopPromise;
      return;
    }

    if (!running) {
      return;
    }

    running = false;
    stopPromise = (async () => {
      for (const { lane, state } of [...registrations].reverse()) {
        await lane[Symbol.asyncDispose]();
        state.running = false;
      }
    })()
      .then(() => undefined)
      .finally(() => {
        stopPromise = null;
      });

    await stopPromise;
  };

  const runtime: OptimizerRuntime = {
    async [Symbol.asyncDispose]() {
      await disable();
    },

    async disable() {
      await disable();
    },

    getStatus() {
      return {
        enabled_triggers: ["task_resolved"],
        last_event: lastEvent,
        last_scan_at: lastScanAt,
        lanes: laneStatus(),
        running,
      };
    },

    async handleEvent(event) {
      const shouldScan = running && event.type === "task_resolved";

      lastEvent = {
        task_id: event.taskId,
        triggered_scan: shouldScan,
        type: event.type,
      };

      if (!shouldScan) {
        return;
      }

      const developerLane = registrations.find(
        ({ name }) => name === "developer_follow_up",
      );

      try {
        await developerLane?.lane.scanOnce({ resolvedTaskId: event.taskId });
        lastScanAt = new Date().toISOString();

        if (developerLane) {
          developerLane.state.last_error = null;
          developerLane.state.last_scan_at = lastScanAt;
        }
      } catch (error) {
        if (developerLane) {
          developerLane.state.last_error =
            error instanceof Error ? error.message : String(error);
        }

        logger?.error(
          { err: error, lane: "developer_follow_up" },
          "Optimizer lane failed while handling event",
        );
      }
    },

    start() {
      if (running) {
        return;
      }

      running = true;
      for (const { lane, name, state } of registrations) {
        try {
          lane.start({ intervalMs });
          state.last_error = null;
          state.running = true;
        } catch (error) {
          state.last_error = recordLaneError(name, error);
          state.running = false;
        }
      }
    },
  };

  return runtime;
};
