type CancelableSleepOptions = {
  signal?: AbortSignal;
};

export const cancelableSleep = (
  milliseconds: number,
  { signal }: CancelableSleepOptions = {},
) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);

      return;
    }

    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);

    const abort = () => {
      clearTimeout(timeout);
      reject(signal?.reason);
    };

    signal?.addEventListener("abort", abort, { once: true });
  });
