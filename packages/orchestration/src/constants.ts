import type { RetryPolicy } from "./robustness";

export const REVIEW_RUN_ROUTE_SOURCES = ["explicit", "coordinator", "auto"] as const;

export const DEFAULT_CALL_TIMEOUT_MS = 60_000;

export const DEFAULT_SPECIALIST_CONCURRENCY = 4;

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  delaysMs: [1_000, 2_000],
};
