import { describe, expect, test } from "bun:test";
import { noopLogger, type Logger } from "@asyncs/core";
import { isTransientError, RetryExhaustedError, withRetries, withTimeout } from "../src/robustness";

describe("withTimeout", () => {
  test("resolves with the fn result when fn finishes before timeout", async () => {
    const result = await withTimeout(async () => "done", 100);
    expect(result).toBe("done");
  });

  test("rejects with TimeoutError after the timer fires", async () => {
    const promise = withTimeout(
      (signal) =>
        new Promise<never>((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted internally")));
        }),
      10,
    );

    await expect(promise).rejects.toThrow("Timed out after 10ms");
  });

  test("aborts the signal when the timer fires", async () => {
    let aborted = false;

    const promise = withTimeout((signal) => {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
      return new Promise<never>(() => {});
    }, 10);

    await expect(promise).rejects.toThrow();
    expect(aborted).toBe(true);
  });

  test("rethrows non-timeout errors as-is", async () => {
    await expect(
      withTimeout(async () => {
        throw new Error("upstream failure");
      }, 100),
    ).rejects.toThrow("upstream failure");
  });
});

describe("isTransientError", () => {
  test("returns true for TimeoutError name", () => {
    const err = new Error("timed out");
    err.name = "TimeoutError";
    expect(isTransientError(err)).toBe(true);
  });

  test("returns true for AbortError name", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    expect(isTransientError(err)).toBe(true);
  });

  test("returns true for HTTP 429", () => {
    expect(isTransientError({ status: 429 })).toBe(true);
  });

  test("returns true for HTTP 5xx", () => {
    expect(isTransientError({ status: 500 })).toBe(true);
    expect(isTransientError({ status: 503 })).toBe(true);
    expect(isTransientError({ status: 599 })).toBe(true);
  });

  test("returns true for ECONNRESET and friends", () => {
    expect(isTransientError({ code: "ECONNRESET" })).toBe(true);
    expect(isTransientError({ code: "ECONNREFUSED" })).toBe(true);
    expect(isTransientError({ code: "ENETUNREACH" })).toBe(true);
    expect(isTransientError({ code: "ENOTFOUND" })).toBe(true);
    expect(isTransientError({ code: "ETIMEDOUT" })).toBe(true);
    expect(isTransientError({ code: "EAI_AGAIN" })).toBe(true);
  });

  test("returns false for 4xx other than 429", () => {
    expect(isTransientError({ status: 400 })).toBe(false);
    expect(isTransientError({ status: 401 })).toBe(false);
    expect(isTransientError({ status: 403 })).toBe(false);
    expect(isTransientError({ status: 404 })).toBe(false);
  });

  test("returns false for plain Error and non-error values", () => {
    expect(isTransientError(new Error("plain"))).toBe(false);
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
    expect(isTransientError("string error")).toBe(false);
  });

  test("returns false for unknown error codes", () => {
    expect(isTransientError({ code: "EBADF" })).toBe(false);
  });
});

describe("RetryExhaustedError", () => {
  test("preserves cause and attempts and uses cause message", () => {
    const cause = new Error("upstream boom");
    const err = new RetryExhaustedError(cause, 3);

    expect(err.name).toBe("RetryExhaustedError");
    expect(err.cause).toBe(cause);
    expect(err.attempts).toBe(3);
    expect(err.message).toBe("upstream boom");
  });

  test("stringifies non-Error causes", () => {
    const err = new RetryExhaustedError({ status: 500 }, 2);

    expect(err.message).toBe("[object Object]");
    expect(err.attempts).toBe(2);
  });
});

describe("withRetries", () => {
  test("returns value with attempts=1 on first-attempt success", async () => {
    const result = await withRetries(
      async () => "ok",
      { maxAttempts: 3, delaysMs: [10, 20] },
      { logger: noopLogger, agentLabel: "test" },
    );

    expect(result).toEqual({ value: "ok", attempts: 1 });
  });

  test("retries on transient error and succeeds", async () => {
    let calls = 0;

    const result = await withRetries(
      async () => {
        calls += 1;
        if (calls === 1) {
          const err: Error & { status?: number } = new Error("rate limited");
          err.status = 429;
          throw err;
        }
        return "ok";
      },
      { maxAttempts: 3, delaysMs: [1, 1] },
      { logger: noopLogger, agentLabel: "backend" },
    );

    expect(result).toEqual({ value: "ok", attempts: 2 });
    expect(calls).toBe(2);
  });

  test("does not retry non-transient errors", async () => {
    let calls = 0;

    await expect(
      withRetries(
        async () => {
          calls += 1;
          throw new Error("non-transient");
        },
        { maxAttempts: 3, delaysMs: [1, 1] },
        { logger: noopLogger, agentLabel: "backend" },
      ),
    ).rejects.toBeInstanceOf(RetryExhaustedError);

    expect(calls).toBe(1);
  });

  test("exhausts attempts on persistent transient", async () => {
    let calls = 0;

    let caught: unknown;
    try {
      await withRetries(
        async () => {
          calls += 1;
          const err: Error & { status?: number } = new Error("503");
          err.status = 503;
          throw err;
        },
        { maxAttempts: 3, delaysMs: [1, 1] },
        { logger: noopLogger, agentLabel: "backend" },
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(RetryExhaustedError);
    expect(calls).toBe(3);
    if (caught instanceof RetryExhaustedError) {
      expect(caught.attempts).toBe(3);
    }
  });

  test("logs a warn per retry with agent label and attempt", async () => {
    const warnings: Array<{ message: string; meta?: Record<string, unknown> }> = [];
    const logger: Logger = {
      ...noopLogger,
      warn: (message, meta) => {
        warnings.push({ message, ...(meta === undefined ? {} : { meta }) });
      },
    };

    let calls = 0;

    await withRetries(
      async () => {
        calls += 1;
        if (calls < 3) {
          const err: Error & { status?: number } = new Error("429");
          err.status = 429;
          throw err;
        }
        return "ok";
      },
      { maxAttempts: 3, delaysMs: [1, 1] },
      { logger, agentLabel: "backend" },
    );

    expect(warnings).toHaveLength(2);
    expect(warnings[0]?.message).toContain("backend");
    expect(warnings[0]?.meta?.attempt).toBe(1);
    expect(warnings[1]?.meta?.attempt).toBe(2);
  });

  test("uses last delay when delaysMs is shorter than maxAttempts", async () => {
    let calls = 0;

    await expect(
      withRetries(
        async () => {
          calls += 1;
          const err: Error & { status?: number } = new Error("503");
          err.status = 503;
          throw err;
        },
        { maxAttempts: 4, delaysMs: [1] },
        { logger: noopLogger, agentLabel: "test" },
      ),
    ).rejects.toBeInstanceOf(RetryExhaustedError);

    expect(calls).toBe(4);
  });

  test("respects an injected isTransient classifier", async () => {
    let calls = 0;

    const result = await withRetries(
      async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error("custom transient");
        }
        return "ok";
      },
      { maxAttempts: 3, delaysMs: [1] },
      {
        logger: noopLogger,
        agentLabel: "test",
        isTransient: (err) => err instanceof Error && err.message === "custom transient",
      },
    );

    expect(result.attempts).toBe(2);
  });
});
