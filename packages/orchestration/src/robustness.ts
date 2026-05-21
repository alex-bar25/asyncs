import type { Logger } from "@asyncs/core";

export class RetryExhaustedError extends Error {
  constructor(
    override readonly cause: unknown,
    readonly attempts: number,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "RetryExhaustedError";
  }
}

const TRANSIENT_CODES: ReadonlySet<string> = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
]);

export function isTransientError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) {
    return false;
  }

  if ("name" in err && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return true;
  }

  if ("status" in err && typeof err.status === "number") {
    if (err.status === 429) return true;
    if (err.status >= 500 && err.status < 600) return true;
  }

  if ("code" in err && typeof err.code === "string" && TRANSIENT_CODES.has(err.code)) {
    return true;
  }

  return false;
}

export type RetryPolicy = {
  maxAttempts: number;
  delaysMs: readonly number[];
};

export type WithRetriesOptions = {
  logger: Logger;
  agentLabel: string;
  isTransient?: (err: unknown) => boolean;
};

export async function withRetries<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy,
  options: WithRetriesOptions,
): Promise<{ value: T; attempts: number }> {
  const classify = options.isTransient ?? isTransientError;
  let attempt = 0;
  let lastError: unknown = undefined;

  while (attempt < policy.maxAttempts) {
    attempt += 1;

    try {
      const value = await fn();
      return { value, attempts: attempt };
    } catch (err) {
      lastError = err;
      const canRetry = attempt < policy.maxAttempts && classify(err);

      if (!canRetry) {
        break;
      }

      const nextDelayMs = policy.delaysMs[attempt - 1] ?? policy.delaysMs[policy.delaysMs.length - 1] ?? 0;

      options.logger.warn(`${options.agentLabel} attempt ${attempt} failed; retrying`, {
        agentLabel: options.agentLabel,
        attempt,
        nextDelayMs,
        error: err instanceof Error ? err.message : String(err),
      });

      await delay(nextDelayMs);
    }
  }

  throw new RetryExhaustedError(lastError, attempt);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

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
