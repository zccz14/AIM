import type { OptimizerStatusResponse } from "@aim-ai/contract";
import type { ApiLogger } from "./api-logger.js";

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

export type OptimizerRuntime = AsyncDisposable & {
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

    return Object.fromEntries(entries) as NonNullable<
      OptimizerStatusResponse["lanes"]
    >;
  };

  const recordLaneError = (name: OptimizerLaneName, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);

    logger?.error(
      { err: error, event: "optimizer_lane_start_failed", lane: name },
      "Optimizer lane failed to start",
    );

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

    logger?.info(
      { event: "optimizer_stopping", lane_count: registrations.length },
      "Optimizer runtime stopping",
    );
    running = false;
    stopPromise = (async () => {
      for (const { lane, state } of [...registrations].reverse()) {
        await lane[Symbol.asyncDispose]();
        state.running = false;
      }
    })()
      .then(() => {
        logger?.info(
          { event: "optimizer_stopped", lane_count: registrations.length },
          "Optimizer runtime stopped",
        );
      })
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
        logger?.info(
          {
            event: "optimizer_event_skipped",
            reason: running ? "unsupported_event" : "not_running",
            running,
            task_id: event.taskId,
            trigger: event.type,
          },
          "Optimizer event skipped",
        );
        return;
      }

      logger?.info(
        {
          event: "optimizer_event_triggered_scan",
          lane: "developer_follow_up",
          task_id: event.taskId,
          trigger: event.type,
        },
        "Optimizer event triggered lane scan",
      );
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
        logger?.warn(
          { event: "optimizer_start_skipped", reason: "already_running" },
          "Optimizer runtime start skipped because it is already running",
        );
        return;
      }

      logger?.info(
        {
          event: "optimizer_starting",
          interval_ms: intervalMs,
          lane_count: registrations.length,
          lanes: registrations.map(({ name }) => name),
        },
        "Optimizer runtime starting",
      );
      running = true;
      let startedLaneCount = 0;
      for (const { lane, name, state } of registrations) {
        try {
          lane.start({ intervalMs });
          state.last_error = null;
          state.running = true;
          startedLaneCount += 1;
          logger?.info(
            {
              event: "optimizer_lane_started",
              interval_ms: intervalMs,
              lane: name,
            },
            "Optimizer lane started",
          );
        } catch (error) {
          state.last_error = recordLaneError(name, error);
          state.running = false;
        }
      }
      logger?.info(
        {
          event: "optimizer_started",
          lane_count: registrations.length,
          started_lane_count: startedLaneCount,
        },
        "Optimizer runtime started",
      );
    },
  };

  return runtime;
};
