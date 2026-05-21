export async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timeoutError: Error | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Timed out after ${timeoutMs}ms`);
      error.name = "TimeoutError";
      timeoutError = error;
      controller.abort();
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      fn(controller.signal).catch((err: unknown) => {
        if (timeoutError !== undefined) {
          throw timeoutError;
        }
        throw err;
      }),
      timeoutPromise,
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
