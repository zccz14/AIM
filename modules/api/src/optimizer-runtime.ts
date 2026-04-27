import type { OptimizerStatusResponse } from "@aim-ai/contract";
import type { ApiLogger } from "./api-logger.js";

type OptimizerLaneScheduler = {
  [Symbol.asyncDispose](): Promise<void>;
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

export type OptimizerRuntime = {
  [Symbol.asyncDispose](): Promise<void>;
  disable(): Promise<void>;
  getStatus(): OptimizerStatusResponse;
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
  let lastEvent: OptimizerStatusResponse["last_event"] = null;
  let lastScanAt: OptimizerStatusResponse["last_scan_at"] = null;
  let stopPromise: Promise<void> | null = null;
  const laneStates = new Map(
    lanes.map(({ name }) => [
      name,
      {
        last_error: null as null | string,
        last_scan_at: null as null | string,
        running: false,
      },
    ]),
  );

  const laneStatus = () => {
    const entries = lanes.map(({ lane, name }) => [
      name,
      lane.getStatus?.() ?? laneStates.get(name),
    ]);

    return Object.fromEntries(entries) as NonNullable<
      OptimizerStatusResponse["lanes"]
    >;
  };

  const recordLaneError = (name: OptimizerLaneName, error: unknown) => {
    const laneState = laneStates.get(name);
    const message = error instanceof Error ? error.message : String(error);

    if (laneState) {
      laneState.last_error = message;
      laneState.running = false;
    }

    logger?.error({ err: error, lane: name }, "Optimizer lane failed to start");
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
      for (const { lane, name } of [...lanes].reverse()) {
        await lane[Symbol.asyncDispose]();
        const laneState = laneStates.get(name);

        if (laneState) {
          laneState.running = false;
        }
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

      const developerLane = lanes.find(
        ({ name }) => name === "developer_follow_up",
      );

      const developerLaneState = laneStates.get("developer_follow_up");

      try {
        await developerLane?.lane.scanOnce({ resolvedTaskId: event.taskId });
        lastScanAt = new Date().toISOString();

        if (developerLaneState) {
          developerLaneState.last_error = null;
          developerLaneState.last_scan_at = lastScanAt;
        }
      } catch (error) {
        if (developerLaneState) {
          developerLaneState.last_error =
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
      for (const { lane, name } of lanes) {
        try {
          lane.start({ intervalMs });
          const laneState = laneStates.get(name);

          if (laneState) {
            laneState.last_error = null;
            laneState.running = true;
          }
        } catch (error) {
          recordLaneError(name, error);
        }
      }
    },
  };

  return runtime;
};
