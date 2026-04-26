import type { OptimizerStatusResponse } from "@aim-ai/contract";

type OptimizerScheduler = {
  scanOnce(context?: { resolvedTaskId?: string }): Promise<void> | void;
  start(options: { intervalMs: number }): void;
  stop(): Promise<void>;
};

export type OptimizerEvent = {
  taskId: string;
  type: "task_resolved";
};

export type OptimizerRuntime = {
  getStatus(): OptimizerStatusResponse;
  handleEvent(event: OptimizerEvent): Promise<void>;
  start(): void;
  stop(): Promise<void>;
};

export const createOptimizerRuntime = ({
  intervalMs,
  scheduler,
}: {
  intervalMs: number;
  scheduler: OptimizerScheduler;
}): OptimizerRuntime => {
  let running = false;
  let lastEvent: OptimizerStatusResponse["last_event"] = null;
  let lastScanAt: OptimizerStatusResponse["last_scan_at"] = null;
  let stopPromise: Promise<void> | null = null;

  return {
    getStatus() {
      return {
        enabled_triggers: ["task_resolved"],
        last_event: lastEvent,
        last_scan_at: lastScanAt,
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

      await scheduler.scanOnce({ resolvedTaskId: event.taskId });
      lastScanAt = new Date().toISOString();
    },

    start() {
      if (running) {
        return;
      }

      running = true;
      scheduler.start({ intervalMs });
    },

    async stop() {
      if (!running) {
        return;
      }

      running = false;
      stopPromise ??= scheduler.stop().finally(() => {
        stopPromise = null;
      });

      await stopPromise;
    },
  };
};
