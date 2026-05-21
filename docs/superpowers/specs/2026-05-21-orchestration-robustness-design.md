# Orchestration Robustness — Design Spec

**Date:** 2026-05-21
**Status:** Drafted, pending Alex review
**Branch:** `feat/orchestration-robustness`

## Goal

Make the asyncs review pipeline survive real-world LLM call failures. Today every specialist call goes through `Promise.all` with no timeout, no retry, no concurrency cap, and no logging — one Anthropic 429 or a single hung call kills the whole review. After this slice, transient failures retry, hung calls abort, the swarm runs with a sensible parallelism cap, and partial reviews are surfaced explicitly instead of silently dropped.

This is foundational work before slices 2 (local diff source) and 3 (real CLI wiring + `ANTHROPIC_API_KEY` reading) close the end-to-end loop. The point of doing robustness first is that once we start making real Anthropic calls, transient failures will surface immediately — better to design the recovery layer with a fresh mind than retrofit it after every hang teaches us another lesson the hard way.

## Non-goals (explicitly out of scope)

- External cancellation (callers passing an `AbortSignal` into the orchestration public API). The CLI doesn't have a long-running mode yet; not worth the surface-area expansion. Internal abort is implemented (for timeouts), but is not exposed to callers.
- Pino instance inside `@asyncs/orchestration`. The orchestrator accepts an injected `Logger` interface; pino lives in the CLI/Action layer that constructs and adapts it.
- Per-agent override of retry policy / timeout. Slice-wide settings only for v1.
- Backoff jitter. Fixed delays only (1s, 2s).
- Circuit breakers (skip Anthropic for N seconds after K consecutive failures).
- Reading config from `asyncs.config.ts` (`cosmiconfig` arrives in a later slice).
- Local diff source, pipeline composition, CLI wiring — all in subsequent slices.

## Architecture

```txt
Caller (CLI/Action) → executeSpecialistAssignments(...options, logger)
                            ↓
                  PQueue(concurrency: 4)
                            ↓
              For each assignment:
                withRetries(maxAttempts: 3, delays: [1s, 2s], isTransient)
                  → withTimeout(60s) — creates AbortController
                    → runSpecialistAgent(provider, signal)
                      → provider.generateObject({ ...signal })
                        → Anthropic SDK call (cancellable via signal)
                            ↓
        Promise.allSettled → partition into runs[] + failures[]
                            ↓
        { runs, findings, failures }
```

The coordinator call (`runCoordinatorAgent`) is wrapped in `withRetries(withTimeout(...))` but not in the queue (single call). If the coordinator fails after retries, `createCoordinatedReviewRunPlan` throws — there's no review without a plan.

## Interface changes

### `@asyncs/providers`

Both request types gain an optional `signal: AbortSignal` so the timeout layer can abort the underlying HTTP call (not just race the promise — that would leak the in-flight request and waste credits).

```ts
export type ProviderGenerateTextRequest = {
  model: string;
  messages: readonly ProviderMessage[];
  signal?: AbortSignal;
};

export type ProviderGenerateObjectRequest = {
  model: string;
  schemaName: string;
  schema: ProviderJsonSchema;
  messages: readonly ProviderMessage[];
  signal?: AbortSignal;
};
```

The Anthropic provider forwards `signal` to `client.messages.create({ ...params, signal })`. The SDK accepts it. This is purely additive — existing tests that omit `signal` keep working.

### `@asyncs/core`

A `Logger` interface and `noopLogger` constant. The orchestrator accepts an injected logger; tests pass `noopLogger` (or a spy); the CLI/Action layer constructs pino and adapts it.

```ts
// packages/core/src/types.ts
export type Logger = {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
};
```

```ts
// packages/core/src/logger.ts
import type { Logger } from "./types";

export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
```

`noopLogger` is exported from `@asyncs/core` alongside the existing exports. The `Logger` type travels via the existing `export type *` re-export.

### `@asyncs/orchestration`

`SpecialistAssignmentExecutionResult` gains a `failures` field:

```ts
export type SpecialistFailure = {
  agent: AgentDefinition;
  attempts: number;
  error: string;
};

export type SpecialistAssignmentExecutionResult = {
  runs: SpecialistAssignmentRun[];
  findings: ReviewFinding[];
  failures: SpecialistFailure[];
};
```

`failures[].error` is the error's `message` (or string equivalent). The full error object stays in the logger output for debugging; the result struct keeps a friendly string so it can serialize into the markdown report.

A new `RobustnessOptions` type captures the shared knobs:

```ts
export type RetryPolicy = {
  maxAttempts: number;
  delaysMs: readonly number[];
};

export type RobustnessOptions = {
  timeoutMs?: number;
  retryPolicy?: RetryPolicy;
  concurrency?: number;
  logger?: Logger;
};
```

Both public entry points gain these options:

```ts
export type ExecuteSpecialistAssignmentsOptions = {
  plan: ReviewRunPlan;
  files: readonly ChangedFile[];
  model: string;
  provider: ProviderClient;
} & RobustnessOptions;

export type CreateCoordinatedReviewRunPlanOptions = {
  request: ReviewRequest;
  coordinatorInput: CoordinatorAgentInput;
  coordinatorModel: string;
  provider: ProviderClient;
} & Pick<RobustnessOptions, "timeoutMs" | "retryPolicy" | "logger">;
// concurrency does not apply to a single coordinator call.
```

Defaults live as constants in `packages/orchestration/src/constants.ts`:

```ts
export const DEFAULT_CALL_TIMEOUT_MS = 60_000;
export const DEFAULT_SPECIALIST_CONCURRENCY = 4;
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  delaysMs: [1_000, 2_000],
};
```

Tests assert against these constants so any change to a number breaks loudly.

### `@asyncs/agents`

`runCoordinatorAgent` and `runSpecialistAgent` gain an optional `signal: AbortSignal` parameter that flows through to the provider request. They do **not** themselves implement timeout or retry logic — that's the orchestrator's job. Keeping the runners simple avoids double-wrapping when the orchestrator wraps them.

```ts
export type RunCoordinatorAgentOptions = {
  input: CoordinatorAgentInput;
  model: string;
  provider: ProviderClient;
  signal?: AbortSignal;
};

export type RunSpecialistAgentOptions = SpecialistAgentInput & {
  model: string;
  provider: ProviderClient;
  signal?: AbortSignal;
};
```

### Formatter (`@asyncs/formatter`)

When the consumed `ConsensusReport` is paired with non-empty `failures`, the markdown gains a "Specialists that failed" section listing each agent, attempts, and error message. Concrete shape: the formatter accepts an optional `failures: SpecialistFailure[]` field on its options.

```ts
export type FormatReviewReportOptions = {
  report: ConsensusReport;
  title?: string;
  failures?: readonly SpecialistFailure[];
};
```

Existing callers that don't pass `failures` get identical output to today.

## Components

### `packages/orchestration/src/robustness.ts` (new)

Three exported helpers plus an internal classifier:

```ts
export type RetryPolicy = {
  maxAttempts: number;
  delaysMs: readonly number[];
};

export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T>;

export type WithRetriesOptions = {
  logger: Logger;
  agentLabel: string;
  isTransient?: (err: unknown) => boolean;
};

export async function withRetries<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy,
  options: WithRetriesOptions,
): Promise<{ value: T; attempts: number }>;

export function isTransientError(err: unknown): boolean;
```

**`withTimeout`** creates an `AbortController`, sets a `setTimeout` to abort, passes the signal to `fn`. Clears the timer in `finally`. When timeout fires, throws an `Error` with message `"Timed out after ${timeoutMs}ms"` (and `name: "TimeoutError"` so `isTransientError` can recognize it).

**`withRetries`** loops up to `policy.maxAttempts` times, calling `fn()` each time. On failure, classifies via `options.isTransient ?? isTransientError`. If transient and attempts remain, logs `warn` with `{ agentLabel, attempt, nextDelayMs, error }`, waits the next delay (`policy.delaysMs[attempt - 1] ?? lastDelay`), retries. On final failure or non-transient error, throws a named error class `RetryExhaustedError` carrying both the original cause and the attempt count.

The thrown error class is exported from `robustness.ts`:

```ts
export class RetryExhaustedError extends Error {
  constructor(
    readonly cause: unknown,
    readonly attempts: number,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "RetryExhaustedError";
  }
}
```

Orchestration catches this at the `Promise.allSettled` boundary to populate `SpecialistFailure.attempts` and `SpecialistFailure.error`. Returns `{ value, attempts }` on success so the success path can also record attempts if needed.

**`isTransientError`** classifies provider-agnostically via structural sniffing (no `instanceof` against SDK error classes — preserves vendor neutrality):

| Error shape | Transient? |
|---|---|
| `err.name === "TimeoutError"` (or "AbortError") | yes |
| `typeof err.status === "number" && err.status === 429` | yes |
| `typeof err.status === "number" && err.status >= 500 && err.status < 600` | yes |
| `typeof err.code === "string" && err.code ∈ { ECONNRESET, ECONNREFUSED, ENETUNREACH, ENOTFOUND, ETIMEDOUT, EAI_AGAIN }` | yes |
| `err.status === 401/403/4xx (other)` | no |
| `err instanceof z.ZodError` (or has `.name === "ZodError"`) | no |
| anything else | no |

### `packages/orchestration/src/pipeline.ts` (modified)

`executeSpecialistAssignments` rewrites to:

1. Resolve defaults: `timeoutMs = options.timeoutMs ?? DEFAULT_CALL_TIMEOUT_MS`, etc. Logger defaults to `noopLogger`.
2. Build the same `eligibleAssignments` list as today.
3. Construct a `PQueue({ concurrency })`.
4. `Promise.allSettled` over `queue.add(() => withRetries(() => withTimeout((signal) => runSpecialistAgent({ ...args, signal }), timeoutMs), retryPolicy, { logger, agentLabel }))`.
5. Partition settled results: `fulfilled` → `runs[]` (with `attempts` recorded), `rejected` → `failures[]` (with `attempts` recorded from `WithRetriesError`).

**Carrying attempts on failure:** `withRetries` throws the original error if all attempts fail. We need to also know how many attempts happened. The implementation wraps the original error in a small carrier: `{ error: unknownError, attempts: number }`. The orchestrator catches at the `Promise.allSettled` boundary and unwraps. Alternative: add `attempts` as a property on the thrown error. We'll use the wrapper to keep the public error type from gaining mutated properties.

`createCoordinatedReviewRunPlan` similarly wraps the coordinator call in `withRetries(withTimeout(...))`. If the coordinator fails, the function rethrows the error — the caller sees a failed planning step, not a degenerate review.

### `packages/orchestration/src/queue.ts` (new, optional)

If `pipeline.ts` grows uncomfortably (it's at ~110 lines today), the `PQueue` setup can live in a separate file. Decision deferred to implementation — extract only if pipeline.ts exceeds ~180 lines after the changes.

### Logger placement

`Logger` type lives in `packages/core/src/types.ts` (alongside `Severity`, `Confidence`, etc.). `noopLogger` lives in a new file `packages/core/src/logger.ts` and is re-exported from `index.ts` via `export * from "./logger"`. The CLI/Action layer builds a pino adapter when it eventually exists (not in this slice).

## Defaults

| Setting | Default | Override |
|---|---|---|
| Per-call timeout | 60s | `RobustnessOptions.timeoutMs` |
| Retry policy | 3 attempts, delays `[1000, 2000]` ms | `RobustnessOptions.retryPolicy` |
| Specialist concurrency | 4 | `RobustnessOptions.concurrency` |
| Logger | `noopLogger` | `RobustnessOptions.logger` |
| Transient classifier | `isTransientError` | `WithRetriesOptions.isTransient` (internal only) |

## Failure surfacing

When a specialist fails (after exhausting retries or hitting a non-transient error), the orchestrator records a `SpecialistFailure { agent, attempts, error: error.message }`. The formatter renders:

```md
## Specialists that failed

- **Backend Agent** — failed after 3 attempts. Last error: `Timed out after 60000ms`.
- **Security Agent** — failed after 1 attempt. Last error: `401 Unauthorized`.
```

When `failures.length === 0`, no section is rendered (no noise).

## Testing strategy

### Unit tests (new file `packages/orchestration/test/robustness.test.ts`)

- `withTimeout` resolves before timeout, value passes through.
- `withTimeout` rejects with `TimeoutError` after `setTimeout` fires.
- `withTimeout` calls `signal.abort()` when the timer fires (verified by spying on `AbortController.signal.addEventListener("abort", ...)`).
- `withTimeout` cleans up the timer on success (no leftover handles).
- `withRetries` returns `{ value, attempts: 1 }` on first-attempt success.
- `withRetries` retries on transient error, succeeds on second attempt, returns `attempts: 2`.
- `withRetries` exhausts attempts and throws after `maxAttempts` transient failures.
- `withRetries` does NOT retry on non-transient error (one attempt, then throws).
- `withRetries` logs `warn` with `agentLabel`, `attempt`, `error` on each retry.
- `withRetries` waits the configured delay between attempts (verified by mocking `setTimeout` or measuring with a fake clock).
- `isTransientError` truth table: 429, 500, 503, ECONNRESET, AbortError, TimeoutError → true. 401, 400, ZodError, plain Error, undefined → false.

### Integration tests (extend `packages/orchestration/test/index.test.ts`)

- All specialists succeed → `runs.length === N`, `failures.length === 0`. (Current happy path; adapt to new result shape.)
- One specialist throws a transient on first call, succeeds on retry → 1 run with `attempts: 2`, 0 failures, logger saw one `warn`.
- One specialist throws a non-transient → 0 runs (or N-1), 1 failure with `attempts: 1`. Logger saw no retry warns.
- One specialist hangs past the timeout → eventually classified as failure with `attempts: 3` (timeout is transient, gets retried). Test uses a stub provider with controllable hang.
- Concurrency limit honored: stub provider tracks "currently in flight" count; with 8 assignments and `concurrency: 2`, the max in-flight count stays at 2.
- `createCoordinatedReviewRunPlan` rethrows when the coordinator fails after retries. Tested with a stub provider that always rejects with a transient error.

### Anthropic provider test (extend `packages/providers/test/anthropic.test.ts`)

- `signal` is forwarded to `messagesCreate` when present.
- Existing tests unchanged (signal is optional).

### Formatter test (extend `packages/formatter/test/index.test.ts`)

- Empty `failures` → no "Specialists that failed" section in the output.
- Non-empty `failures` → renders the section with each agent, attempts, and error message.

## Dependencies

New runtime deps:

- `p-queue` → `@asyncs/orchestration`

No new dev deps. No new top-level workspace deps.

## Risks and trade-offs

- **Custom retry helper vs `p-retry` library.** Chose custom. The helper is ~50 lines including type guards; `p-retry`'s API still requires a thin wrapper for transient classification and would add a transitive dep. Revisit if we need richer policies (jitter, exponential growth beyond two attempts, per-error-class delays).
- **`isTransientError` uses structural sniffing instead of SDK-specific instanceof.** Means we'll classify some edge-case Anthropic errors wrong if their shapes are atypical. Mitigation: tests + adjust the classifier as real failures surface. Vendor neutrality wins here — `@asyncs/orchestration` should never import `@anthropic-ai/sdk`.
- **Signal threading is a small interface expansion of `@asyncs/providers`.** Same shape as the schema field added in the previous slice — additive, optional, no breaking change.
- **`Promise.allSettled` over a queue.** `p-queue`'s `add` resolves with the value (or rejects with the error) when the task settles, so wrapping each `queue.add(...)` in the outer `Promise.allSettled` works correctly. Verified manually against `p-queue` 8.x semantics.
- **Coordinator failure mode.** Today there's no failure — the coordinator always succeeds in tests with stub providers. Hardening it via the same retry layer treats it consistently. The cost is: if the coordinator fails permanently, the whole review fails. That's correct behavior — without a plan, there's no review.

## Acceptance criteria

- `bun run check` green: typecheck, lint, format, all tests pass.
- All four robustness primitives are exercised end-to-end in `executeSpecialistAssignments`.
- A failing specialist (transient or not) surfaces in `failures[]`, not as a thrown exception from the executor.
- The formatter renders a "Specialists that failed" section when failures exist; omits it otherwise.
- The Anthropic provider forwards `signal` to the SDK.
- No new `as` casts (project convention).
- New deps: only `p-queue` in `@asyncs/orchestration`.
- No external `AbortSignal` exposed on the orchestrator's public API (callers can't cancel; internal timeout cancellation still works).
