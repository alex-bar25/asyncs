import { describe, expect, test } from "bun:test";
import { isTransientError, RetryExhaustedError, withTimeout } from "../src/robustness";

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
