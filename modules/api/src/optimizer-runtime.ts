import type { OptimizerStatusResponse } from "@aim-ai/contract";

type OptimizerScheduler = {
  start(options: { intervalMs: number }): void;
  stop(): Promise<void>;
};

export type OptimizerRuntime = {
  getStatus(): OptimizerStatusResponse;
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
  let stopPromise: Promise<void> | null = null;

  return {
    getStatus() {
      return { running };
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
