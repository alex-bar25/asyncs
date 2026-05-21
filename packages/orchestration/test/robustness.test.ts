import { describe, expect, test } from "bun:test";
import { withTimeout } from "../src/robustness";

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
