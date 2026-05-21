# Orchestration Robustness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-specialist error isolation, per-call timeouts, retries, bounded concurrency, and injected structured logging to the asyncs review pipeline. Surfaced specialist failures appear in the result struct and the rendered markdown instead of silently dropping reviews.

**Architecture:** Robustness primitives (`withTimeout`, `withRetries`, `isTransientError`, `RetryExhaustedError`) live in `packages/orchestration/src/robustness.ts`. `executeSpecialistAssignments` wraps each specialist call in `withRetries(withTimeout(...))` and runs them through a `p-queue` with concurrency cap 4. Internal AbortControllers thread through a new optional `signal: AbortSignal` field on `ProviderGenerateTextRequest` and `ProviderGenerateObjectRequest`. A `Logger` interface in `@asyncs/core` lets the CLI/Action inject `pino` later without coupling orchestration to a specific logger.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`), Bun + `bun:test`, `p-queue` (new dep in `@asyncs/orchestration`), `@anthropic-ai/sdk` (existing).

**Spec:** `docs/superpowers/specs/2026-05-21-orchestration-robustness-design.md`

---

## File Structure

**Create:**
- `packages/core/src/logger.ts` — `noopLogger` constant.
- `packages/orchestration/src/robustness.ts` — `withTimeout`, `withRetries`, `isTransientError`, `RetryExhaustedError`, `RetryPolicy`, `WithRetriesOptions`.
- `packages/orchestration/test/robustness.test.ts` — unit tests for the four primitives.

**Modify:**
- `packages/core/src/types.ts` — add `Logger` type.
- `packages/core/src/index.ts` — re-export logger module.
- `packages/core/test/index.test.ts` — verify `noopLogger` shape.
- `packages/providers/src/types.ts` — add optional `signal: AbortSignal` to both request types.
- `packages/providers/src/anthropic.ts` — gateway accepts options, both methods forward `signal` to SDK.
- `packages/providers/test/anthropic.test.ts` — new test verifying signal forwarding.
- `packages/agents/src/types.ts` — add `signal?: AbortSignal` to runner options.
- `packages/agents/src/runner.ts` — forward `signal` to provider call.
- `packages/agents/test/index.test.ts` — extend stub to capture signal.
- `packages/orchestration/package.json` — add `p-queue` dependency.
- `packages/orchestration/src/constants.ts` — add `DEFAULT_CALL_TIMEOUT_MS`, `DEFAULT_SPECIALIST_CONCURRENCY`, `DEFAULT_RETRY_POLICY`.
- `packages/orchestration/src/types.ts` — add `SpecialistFailure`, `RobustnessOptions`, update `ExecuteSpecialistAssignmentsOptions`, `CreateCoordinatedReviewRunPlanOptions`, `SpecialistAssignmentRun`, `SpecialistAssignmentExecutionResult`.
- `packages/orchestration/src/pipeline.ts` — rewrite `executeSpecialistAssignments` (p-queue + withRetries + withTimeout, partition into runs/failures); wrap coordinator call in `createCoordinatedReviewRunPlan` with retry+timeout.
- `packages/orchestration/src/index.ts` — re-export robustness module.
- `packages/orchestration/test/index.test.ts` — extend with retry/timeout/concurrency scenarios.
- `packages/formatter/src/types.ts` — add `failures?: readonly SpecialistFailure[]` to formatter options.
- `packages/formatter/src/formatter.ts` — render "Specialists that failed" section when failures present.
- `packages/formatter/test/index.test.ts` — verify failures rendering.

---

## Task 1: Logger interface + noopLogger in `@asyncs/core`

**Files:**
- Modify: `packages/core/src/types.ts`
- Create: `packages/core/src/logger.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/test/index.test.ts`

### Steps

- [ ] **Step 1: Write the failing test**

Append the following test to `packages/core/test/index.test.ts` (add `noopLogger` and `type Logger` to the import block at the top first):

```ts
test("noopLogger exposes Logger interface methods that do not throw", () => {
  expect(() => noopLogger.debug("debug", { x: 1 })).not.toThrow();
  expect(() => noopLogger.info("info")).not.toThrow();
  expect(() => noopLogger.warn("warn", { agent: "backend" })).not.toThrow();
  expect(() => noopLogger.error("error")).not.toThrow();

  const logger: Logger = noopLogger;
  expect(typeof logger.debug).toBe("function");
});
```

Update the import block at the top of `packages/core/test/index.test.ts` to include `noopLogger` and `type Logger`:

```ts
import {
  AGENT_KINDS,
  ASYNCS_DESCRIPTION,
  ASYNCS_PACKAGE_NAME,
  DEFAULT_REVIEW_MODE,
  DEFAULT_REVIEW_REQUEST_OPTIONS,
  REVIEW_CONFIDENCES,
  REVIEW_MODES,
  REVIEW_SEVERITIES,
  isConfidence,
  isAgentKind,
  isReviewMode,
  isSeverity,
  noopLogger,
  type AgentDefinition,
  type Logger,
  type ReviewRequest,
  type ReviewFinding,
  type ReviewReport,
} from "../src/index";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/core/test/index.test.ts`

Expected: FAIL — `noopLogger` not exported from `../src/index`.

- [ ] **Step 3: Add `Logger` type to `packages/core/src/types.ts`**

Append to the file:

```ts
export type Logger = {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
};
```

- [ ] **Step 4: Create `packages/core/src/logger.ts`**

```ts
import type { Logger } from "./types";

export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
```

- [ ] **Step 5: Re-export logger from `packages/core/src/index.ts`**

Update the file so it reads:

```ts
export * from "./constants";
export * from "./guards";
export * from "./logger";
export * from "./schemas";
export type * from "./types";
```

- [ ] **Step 6: Run tests**

Run: `bun run check`

Expected: typecheck/lint/format clean, all existing tests pass plus the one new test (counts increment by 1).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts \
        packages/core/src/logger.ts \
        packages/core/src/index.ts \
        packages/core/test/index.test.ts
git commit -m "feat(core): add Logger interface and noopLogger"
```

---

## Task 2: Provider signal field + Anthropic forwarding

**Files:**
- Modify: `packages/providers/src/types.ts`
- Modify: `packages/providers/src/anthropic.ts`
- Modify: `packages/providers/test/anthropic.test.ts`

### Steps

- [ ] **Step 1: Write the failing test**

Append to `packages/providers/test/anthropic.test.ts` (inside the `describe("createAnthropicProviderClient.generateText", ...)` block):

```ts
test("forwards AbortSignal to messagesCreate via options", async () => {
  const controller = new AbortController();
  const messagesCreate = mock(async () =>
    fakeAnthropicMessage(
      [{ type: "text", text: "ok", citations: null }],
      { input: 1, output: 1 },
    ),
  );

  const client = createAnthropicProviderClient({
    apiKey: "test-key",
    gateway: { messagesCreate },
  });

  await client.generateText({
    model: "claude-3-7-sonnet-20250219",
    messages: [{ role: "user", content: "Hi." }],
    signal: controller.signal,
  });

  const optionsArg: unknown = messagesCreate.mock.calls[0]?.[1];
  expect(optionsArg).toEqual({ signal: controller.signal });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/providers/test/anthropic.test.ts -t "AbortSignal"`

Expected: FAIL — `signal` is not on the request type, or it isn't forwarded.

- [ ] **Step 3: Add `signal` to `ProviderGenerateTextRequest` and `ProviderGenerateObjectRequest`**

In `packages/providers/src/types.ts`, update both request types:

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

- [ ] **Step 4: Update gateway type and forward signal in anthropic.ts**

In `packages/providers/src/anthropic.ts`, change `AnthropicMessagesGateway` to accept an options object, then forward `signal` in both methods.

Replace the existing `AnthropicMessagesGateway` declaration:

```ts
/**
 * @internal Test-only injection seam for the Anthropic SDK boundary. Not part of the public API.
 */
export type AnthropicMessagesGateway = {
  messagesCreate(
    params: Anthropic.MessageCreateParamsNonStreaming,
    options?: { signal?: AbortSignal },
  ): Promise<Anthropic.Message>;
};
```

Update `createDefaultGateway` to pass through options:

```ts
function createDefaultGateway(apiKey: string): AnthropicMessagesGateway {
  const client = new Anthropic({ apiKey });

  return {
    messagesCreate(params, options) {
      return client.messages.create(params, options);
    },
  };
}
```

In `generateText`, change the `gateway.messagesCreate` call to pass signal via options. Replace the existing call:

```ts
const response = await gateway.messagesCreate(
  {
    model: request.model,
    max_tokens: maxTokens,
    ...(split.system === undefined ? {} : { system: split.system }),
    messages: split.messages,
  },
  request.signal === undefined ? undefined : { signal: request.signal },
);
```

Do the same in `generateObject`. The `tools` and `tool_choice` stay in params; only the `signal` moves to the options arg:

```ts
const response = await gateway.messagesCreate(
  {
    model: request.model,
    max_tokens: maxTokens,
    ...(split.system === undefined ? {} : { system: split.system }),
    messages: split.messages,
    tools: [
      {
        name: request.schemaName,
        description: `Return data matching the ${request.schemaName} schema.`,
        input_schema: request.schema,
      },
    ],
    tool_choice: { type: "tool", name: request.schemaName },
  },
  request.signal === undefined ? undefined : { signal: request.signal },
);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test packages/providers/test/anthropic.test.ts -t "AbortSignal"`

Expected: PASS. If `mock`'s type inference rejects the two-arg call signature, type the mock explicitly:

```ts
const messagesCreate = mock(
  async (
    _params: Anthropic.MessageCreateParamsNonStreaming,
    _options?: { signal?: AbortSignal },
  ) => fakeAnthropicMessage(...),
);
```

- [ ] **Step 6: Full check**

Run: `bun run check`

Expected: all tests pass (1 new test added). The previously-passing tests that don't supply `signal` should still pass — `signal` is optional.

- [ ] **Step 7: Commit**

```bash
git add packages/providers/src/types.ts \
        packages/providers/src/anthropic.ts \
        packages/providers/test/anthropic.test.ts
git commit -m "$(cat <<'EOF'
feat(providers): forward AbortSignal through Anthropic provider

Adds optional signal: AbortSignal to both ProviderGenerateTextRequest
and ProviderGenerateObjectRequest. The Anthropic provider's gateway
seam now accepts a second options argument; signal flows through to
client.messages.create's options arg so an aborted controller cancels
the in-flight HTTP request (not just races the promise).
EOF
)"
```

---

## Task 3: Agent runners accept and forward signal

**Files:**
- Modify: `packages/agents/src/types.ts`
- Modify: `packages/agents/src/runner.ts`
- Modify: `packages/agents/test/index.test.ts`

### Steps

- [ ] **Step 1: Write the failing test**

Append to `packages/agents/test/index.test.ts` (inside the `describe("coordinator agent contract", ...)` block, after the existing `runCoordinatorAgent` test):

```ts
test("runCoordinatorAgent forwards signal to the provider", async () => {
  const controller = new AbortController();
  let capturedSignal: AbortSignal | undefined;

  await runCoordinatorAgent({
    input: buildCoordinatorAgentInput({ files: [] }),
    model: "coordinator-test-model",
    provider: {
      kind: "custom",
      async generateText() {
        return { text: "unused" };
      },
      async generateObject(request) {
        capturedSignal = request.signal;
        return {
          object: {
            labels: [],
            assignments: [],
            confidence: "low",
            reasoning: ["empty input"],
          },
        };
      },
    },
    signal: controller.signal,
  });

  expect(capturedSignal).toBe(controller.signal);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/agents/test/index.test.ts -t "forwards signal"`

Expected: FAIL — `signal` not accepted on `RunCoordinatorAgentOptions` or not forwarded.

- [ ] **Step 3: Add `signal` to runner option types**

In `packages/agents/src/types.ts`, update both runner option types:

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

- [ ] **Step 4: Forward signal in both runners**

In `packages/agents/src/runner.ts`, update both `generateObject` calls to spread signal conditionally.

`runCoordinatorAgent` becomes:

```ts
export async function runCoordinatorAgent(options: RunCoordinatorAgentOptions): Promise<CoordinatorAgentRunResult> {
  if (options.provider.generateObject === undefined) {
    throw new Error(COORDINATOR_AGENT_STRUCTURED_OUTPUT_ERROR);
  }

  const result = await options.provider.generateObject({
    model: options.model,
    schemaName: COORDINATOR_AGENT_OUTPUT_SCHEMA_NAME,
    schema: CoordinatorAgentOutputJsonSchema,
    messages: buildCoordinatorAgentMessages(options.input),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  const parsed = CoordinatorAgentOutputSchema.parse(result.object);

  return {
    output: parsed,
    ...(result.usage === undefined ? {} : { usage: result.usage }),
    ...(result.rawText === undefined ? {} : { rawText: result.rawText }),
  };
}
```

`runSpecialistAgent` becomes:

```ts
export async function runSpecialistAgent(options: RunSpecialistAgentOptions): Promise<SpecialistAgentRunResult> {
  if (options.provider.generateObject === undefined) {
    throw new Error(SPECIALIST_AGENT_STRUCTURED_OUTPUT_ERROR);
  }

  const result = await options.provider.generateObject({
    model: options.model,
    schemaName: SPECIALIST_AGENT_OUTPUT_SCHEMA_NAME,
    schema: SpecialistAgentOutputJsonSchema,
    messages: buildSpecialistAgentMessages(options),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  const parsed = SpecialistAgentOutputSchema.parse(result.object);

  return {
    output: parsed,
    ...(result.usage === undefined ? {} : { usage: result.usage }),
    ...(result.rawText === undefined ? {} : { rawText: result.rawText }),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test packages/agents/test/index.test.ts -t "forwards signal"`

Expected: PASS.

- [ ] **Step 6: Full check**

Run: `bun run check`

Expected: all tests pass (1 new test). Existing tests should be unaffected — `signal` is optional and the previous stubs don't supply it.

- [ ] **Step 7: Commit**

```bash
git add packages/agents/src/types.ts \
        packages/agents/src/runner.ts \
        packages/agents/test/index.test.ts
git commit -m "$(cat <<'EOF'
feat(agents): forward AbortSignal through coordinator and specialist runners

Both runner option types accept an optional signal: AbortSignal that
flows into the provider generateObject call. The runners themselves
don't implement timeout/retry; the orchestrator wraps them in a
robustness layer that drives the signal.
EOF
)"
```

---

## Task 4: TDD `withTimeout` helper

**Files:**
- Create: `packages/orchestration/src/robustness.ts`
- Create: `packages/orchestration/test/robustness.test.ts`

### Steps

- [ ] **Step 1: Write the failing tests**

Create `packages/orchestration/test/robustness.test.ts`:

```ts
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

    const promise = withTimeout(
      (signal) => {
        signal.addEventListener("abort", () => {
          aborted = true;
        });
        return new Promise<never>(() => {});
      },
      10,
    );

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
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `bun test packages/orchestration/test/robustness.test.ts`

Expected: FAIL — `Cannot find module "../src/robustness"`.

- [ ] **Step 3: Create `packages/orchestration/src/robustness.ts`**

```ts
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const error = new Error(`Timed out after ${timeoutMs}ms`);
      error.name = "TimeoutError";
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([fn(controller.signal), timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `bun test packages/orchestration/test/robustness.test.ts`

Expected: 4 pass, 0 fail.

- [ ] **Step 5: Full check**

Run: `bun run check`

Expected: typecheck/lint/format clean, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/orchestration/src/robustness.ts \
        packages/orchestration/test/robustness.test.ts
git commit -m "feat(orchestration): add withTimeout helper with AbortSignal"
```

---

## Task 5: TDD `isTransientError` + `RetryExhaustedError`

**Files:**
- Modify: `packages/orchestration/src/robustness.ts`
- Modify: `packages/orchestration/test/robustness.test.ts`

### Steps

- [ ] **Step 1: Write the failing tests**

Append to `packages/orchestration/test/robustness.test.ts` (update the imports at the top to add the new names):

```ts
import { describe, expect, test } from "bun:test";
import { isTransientError, RetryExhaustedError, withTimeout } from "../src/robustness";
```

Then append the new test blocks:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/orchestration/test/robustness.test.ts`

Expected: FAIL — `isTransientError` and `RetryExhaustedError` not exported.

- [ ] **Step 3: Add to `packages/orchestration/src/robustness.ts`**

Append to the file:

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/orchestration/test/robustness.test.ts`

Expected: all robustness tests pass (4 from Task 4 + new tests added here).

- [ ] **Step 5: Full check**

Run: `bun run check`

Expected: clean. The implementation uses `instanceof Error`, `in` operator narrowing, and `ReadonlySet<string>` — no `as` casts.

- [ ] **Step 6: Commit**

```bash
git add packages/orchestration/src/robustness.ts \
        packages/orchestration/test/robustness.test.ts
git commit -m "$(cat <<'EOF'
feat(orchestration): add isTransientError classifier and RetryExhaustedError

Provider-agnostic structural classifier (no SDK instanceof) for 429,
5xx, common network error codes, TimeoutError, and AbortError.
RetryExhaustedError preserves cause and final attempt count for the
orchestrator to populate SpecialistFailure.
EOF
)"
```

---

## Task 6: TDD `withRetries` helper

**Files:**
- Modify: `packages/orchestration/src/robustness.ts`
- Modify: `packages/orchestration/test/robustness.test.ts`
- Modify: `packages/orchestration/src/index.ts`

### Steps

- [ ] **Step 1: Write the failing tests**

Update the import line at the top of `packages/orchestration/test/robustness.test.ts` to include `withRetries` and `noopLogger`:

```ts
import { describe, expect, test } from "bun:test";
import { noopLogger, type Logger } from "@asyncs/core";
import { isTransientError, RetryExhaustedError, withRetries, withTimeout } from "../src/robustness";
```

Then append new test blocks at the bottom:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/orchestration/test/robustness.test.ts`

Expected: FAIL — `withRetries` not exported.

- [ ] **Step 3: Add `withRetries` and supporting types to `packages/orchestration/src/robustness.ts`**

Add at the top of the file:

```ts
import type { Logger } from "@asyncs/core";
```

Then append:

```ts
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
  const isTransient = options.isTransient ?? isTransientError;
  let attempt = 0;
  let lastError: unknown = undefined;

  while (attempt < policy.maxAttempts) {
    attempt += 1;

    try {
      const value = await fn();
      return { value, attempts: attempt };
    } catch (err) {
      lastError = err;
      const canRetry = attempt < policy.maxAttempts && isTransient(err);

      if (!canRetry) {
        break;
      }

      const nextDelayMs =
        policy.delaysMs[attempt - 1] ??
        policy.delaysMs[policy.delaysMs.length - 1] ??
        0;

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
```

- [ ] **Step 4: Re-export robustness from the orchestration package index**

Update `packages/orchestration/src/index.ts`:

```ts
export * from "./constants";
export * from "./pipeline";
export * from "./preview";
export * from "./robustness";
export type * from "./types";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test packages/orchestration/test/robustness.test.ts`

Expected: all robustness tests pass (4 from Task 4 + Task 5 tests + 7 new tests = 11+ total).

- [ ] **Step 6: Full check**

Run: `bun run check`

Expected: green. No new `as` casts.

- [ ] **Step 7: Commit**

```bash
git add packages/orchestration/src/robustness.ts \
        packages/orchestration/src/index.ts \
        packages/orchestration/test/robustness.test.ts
git commit -m "$(cat <<'EOF'
feat(orchestration): add withRetries helper with logger injection

Loop with attempt counting, transient-error classification, configurable
delays (falls back to the last delay when delaysMs is shorter than
maxAttempts), and a per-retry warn log including agentLabel, attempt,
nextDelayMs, and error message. Throws RetryExhaustedError when
attempts are exhausted or the error is non-transient.
EOF
)"
```

---

## Task 7: Scaffold — orchestration types, defaults, p-queue dep, pipeline returns failures: []

**Files:**
- Modify: `packages/orchestration/package.json`
- Modify: `packages/orchestration/src/constants.ts`
- Modify: `packages/orchestration/src/types.ts`
- Modify: `packages/orchestration/src/pipeline.ts`

### Steps

- [ ] **Step 1: Install p-queue**

```bash
cd packages/orchestration && bun add p-queue
cd ../..
```

Confirm `packages/orchestration/package.json` has `p-queue` in dependencies.

- [ ] **Step 2: Add defaults to `packages/orchestration/src/constants.ts`**

Append to the file:

```ts
import type { RetryPolicy } from "./robustness";

export const DEFAULT_CALL_TIMEOUT_MS = 60_000;

export const DEFAULT_SPECIALIST_CONCURRENCY = 4;

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  delaysMs: [1_000, 2_000],
};
```

- [ ] **Step 3: Update `packages/orchestration/src/types.ts`**

Add imports at the top of the file:

```ts
import type { Logger } from "@asyncs/core";
import type { RetryPolicy } from "./robustness";
```

(Keep the existing imports too. The final import block will have both.)

Append new exported types:

```ts
export type SpecialistFailure = {
  agent: AgentDefinition;
  attempts: number;
  error: string;
};

export type RobustnessOptions = {
  timeoutMs?: number;
  retryPolicy?: RetryPolicy;
  concurrency?: number;
  logger?: Logger;
};
```

Re-export `RetryPolicy` for callers (keep it co-located with the rest of the orchestration types):

```ts
export type { RetryPolicy } from "./robustness";
```

Update `SpecialistAssignmentRun` to include `attempts`:

```ts
export type SpecialistAssignmentRun = SpecialistAgentRunResult & {
  agent: AgentDefinition;
  attempts: number;
};
```

Update `SpecialistAssignmentExecutionResult` to include `failures`:

```ts
export type SpecialistAssignmentExecutionResult = {
  runs: SpecialistAssignmentRun[];
  findings: ReviewFinding[];
  failures: SpecialistFailure[];
};
```

Update `ExecuteSpecialistAssignmentsOptions` to include robustness knobs:

```ts
export type ExecuteSpecialistAssignmentsOptions = {
  plan: ReviewRunPlan;
  files: readonly ChangedFile[];
  model: string;
  provider: ProviderClient;
} & RobustnessOptions;
```

Update `CreateCoordinatedReviewRunPlanOptions` to include retry/timeout/logger only (concurrency doesn't apply to a single call):

```ts
export type CreateCoordinatedReviewRunPlanOptions = {
  request: ReviewRequest;
  coordinatorInput: CoordinatorAgentInput;
  coordinatorModel: string;
  provider: ProviderClient;
} & Pick<RobustnessOptions, "timeoutMs" | "retryPolicy" | "logger">;
```

- [ ] **Step 4: Patch `packages/orchestration/src/pipeline.ts` to return failures: [] and attempts: 1**

Update `executeSpecialistAssignments` to include the new `failures` field on the returned result (still empty for now — Task 8 populates it from real failures) and to include `attempts: 1` on each run.

Inside `executeSpecialistAssignments`, change the inner mapping so each successful run includes `attempts: 1`. Replace the existing `Promise.all` body so that each task returns `{ agent, attempts: 1, ...run }`:

```ts
const runs = await Promise.all(
  eligibleAssignments.map(async ({ assignment, agent }) => {
    const run = await runSpecialistAgent({
      agent,
      assignment,
      files: options.files,
      mode: options.plan.request.mode,
      model: options.model,
      provider: options.provider,
    });

    return { agent, attempts: 1, ...run };
  }),
);

return {
  runs,
  findings: runs.flatMap((run) => [...run.output.findings]),
  failures: [],
};
```

- [ ] **Step 5: Run the existing orchestration tests**

Run: `bun test packages/orchestration/test/index.test.ts`

Expected: all existing tests still pass. The new `attempts` field on `SpecialistAssignmentRun` is additive (no test currently destructures `runs[0]` exhaustively). The new `failures: []` field doesn't break any equality assertions in current tests.

- [ ] **Step 6: Full check**

Run: `bun run check`

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add packages/orchestration/package.json \
        bun.lock \
        packages/orchestration/src/constants.ts \
        packages/orchestration/src/types.ts \
        packages/orchestration/src/pipeline.ts
git commit -m "$(cat <<'EOF'
feat(orchestration): scaffold robustness types, defaults, p-queue dep

Adds DEFAULT_CALL_TIMEOUT_MS (60s), DEFAULT_SPECIALIST_CONCURRENCY (4),
DEFAULT_RETRY_POLICY (3 attempts, 1s/2s). Adds SpecialistFailure,
RobustnessOptions, updates SpecialistAssignmentRun with attempts, and
adds failures: [] to executeSpecialistAssignments' result. p-queue
installed but not wired yet; the queue rewrite lands in Task 8.
EOF
)"
```

---

## Task 8: Refactor `executeSpecialistAssignments` with queue + retries + timeout

**Files:**
- Modify: `packages/orchestration/src/pipeline.ts`

### Steps

- [ ] **Step 1: Rewrite `executeSpecialistAssignments`**

Update the imports at the top of `packages/orchestration/src/pipeline.ts` to include p-queue, robustness helpers, defaults, and `noopLogger`:

```ts
import { getBuiltInAgentDefinition, isBuiltInAgentKind, runCoordinatorAgent, runSpecialistAgent } from "@asyncs/agents";
import type { AgentAssignment } from "@asyncs/agents";
import { noopLogger } from "@asyncs/core";
import { resolveAgentRoute } from "@asyncs/routing";
import PQueue from "p-queue";
import { DEFAULT_CALL_TIMEOUT_MS, DEFAULT_RETRY_POLICY, DEFAULT_SPECIALIST_CONCURRENCY } from "./constants";
import { RetryExhaustedError, withRetries, withTimeout } from "./robustness";
import type {
  CreateCoordinatedReviewRunPlanOptions,
  CreateReviewRunPlanOptions,
  ExecuteSpecialistAssignmentsOptions,
  ReviewRunPlan,
  SpecialistAssignmentExecutionResult,
  SpecialistAssignmentRun,
  SpecialistFailure,
} from "./types";
```

Replace the entire `executeSpecialistAssignments` function with this version (keep `createReviewRunPlan`, `createCoordinatedReviewRunPlan`, and `resolveCoordinatorAgents` for now — Task 9 updates the coordinator path):

```ts
export async function executeSpecialistAssignments(
  options: ExecuteSpecialistAssignmentsOptions,
): Promise<SpecialistAssignmentExecutionResult> {
  const concurrency = options.concurrency ?? DEFAULT_SPECIALIST_CONCURRENCY;
  const timeoutMs = options.timeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
  const retryPolicy = options.retryPolicy ?? DEFAULT_RETRY_POLICY;
  const logger = options.logger ?? noopLogger;

  const eligibleAssignments = (options.plan.coordinatorOutput?.assignments ?? []).flatMap((assignment) => {
    if (!isBuiltInAgentKind(assignment.agent)) {
      return [];
    }

    const agent = getBuiltInAgentDefinition(assignment.agent);

    return agent === undefined ? [] : [{ assignment, agent }];
  });

  const queue = new PQueue({ concurrency });

  const settled = await Promise.allSettled(
    eligibleAssignments.map(({ assignment, agent }) =>
      queue.add(async () => {
        const { value, attempts } = await withRetries(
          () =>
            withTimeout(
              (signal) =>
                runSpecialistAgent({
                  agent,
                  assignment,
                  files: options.files,
                  mode: options.plan.request.mode,
                  model: options.model,
                  provider: options.provider,
                  signal,
                }),
              timeoutMs,
            ),
          retryPolicy,
          { logger, agentLabel: agent.kind },
        );

        const run: SpecialistAssignmentRun = { agent, attempts, ...value };
        return run;
      }),
    ),
  );

  const runs: SpecialistAssignmentRun[] = [];
  const failures: SpecialistFailure[] = [];

  for (let index = 0; index < settled.length; index += 1) {
    const settlement = settled[index];
    const eligible = eligibleAssignments[index];

    if (settlement === undefined || eligible === undefined) {
      continue;
    }

    if (settlement.status === "fulfilled") {
      if (settlement.value === undefined) {
        continue;
      }
      runs.push(settlement.value);
      continue;
    }

    const error = settlement.reason;
    const attempts = error instanceof RetryExhaustedError ? error.attempts : 1;
    const message = error instanceof Error ? error.message : String(error);

    logger.error(`${eligible.agent.kind} review failed after ${attempts} attempt(s)`, {
      agentLabel: eligible.agent.kind,
      attempts,
      error: message,
    });

    failures.push({ agent: eligible.agent, attempts, error: message });
  }

  return {
    runs,
    findings: runs.flatMap((run) => [...run.output.findings]),
    failures,
  };
}
```

- [ ] **Step 2: Run existing orchestration tests**

Run: `bun test packages/orchestration/test/index.test.ts`

Expected: existing tests still pass. The new behavior is transparent for the happy path — specialists still succeed, runs[] is populated, failures[] is empty, attempts is 1.

If the existing `executes coordinator assignments with specialist agents` test asserts `result.runs[0]?.agent.kind` and `result.findings[0]?.title`, those still work because the inner shape is unchanged.

- [ ] **Step 3: Add a new test for failure handling**

Append to `packages/orchestration/test/index.test.ts` (inside the `describe("review run planning", ...)` block, after the existing `executes coordinator assignments` test):

```ts
test("partitions a failing specialist into failures with attempts", async () => {
  const plan = createReviewRunPlan({
    request: baseRequest,
    coordinatorOutput: {
      labels: ["payments"],
      assignments: [
        {
          agent: "backend",
          purpose: "Review payment retry correctness.",
          files: ["services/payments/retry.ts"],
          focusAreas: ["retry behavior"],
          context: "Payment retry behavior changed.",
        },
      ],
      confidence: "high",
      reasoning: ["Coordinator selected backend review."],
    },
  });

  const result = await executeSpecialistAssignments({
    plan,
    files: [
      {
        path: "services/payments/retry.ts",
        status: "modified",
        additions: 1,
        deletions: 0,
        patch: "@@ change",
      },
    ],
    model: "specialist-test-model",
    retryPolicy: { maxAttempts: 1, delaysMs: [] },
    timeoutMs: 5_000,
    provider: {
      kind: "custom",
      async generateText() {
        return { text: "unused" };
      },
      async generateObject() {
        throw new Error("non-transient failure");
      },
    },
  });

  expect(result.runs).toHaveLength(0);
  expect(result.findings).toHaveLength(0);
  expect(result.failures).toHaveLength(1);
  expect(result.failures[0]?.agent.kind).toBe("backend");
  expect(result.failures[0]?.attempts).toBe(1);
  expect(result.failures[0]?.error).toContain("non-transient failure");
});
```

- [ ] **Step 4: Run the new test**

Run: `bun test packages/orchestration/test/index.test.ts -t "partitions a failing specialist"`

Expected: PASS.

- [ ] **Step 5: Full check**

Run: `bun run check`

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add packages/orchestration/src/pipeline.ts \
        packages/orchestration/test/index.test.ts
git commit -m "$(cat <<'EOF'
feat(orchestration): wire specialist queue with retries, timeout, failure partition

executeSpecialistAssignments now runs each assignment through
withRetries(withTimeout(...)) inside a PQueue with concurrency cap
(default 4). Promise.allSettled partitions results into runs[] and
failures[], where each failure carries final attempts and error
message. Logger.error fires per failed specialist.
EOF
)"
```

---

## Task 9: Wrap coordinator in `createCoordinatedReviewRunPlan` with retry/timeout

**Files:**
- Modify: `packages/orchestration/src/pipeline.ts`
- Modify: `packages/orchestration/test/index.test.ts`

### Steps

- [ ] **Step 1: Wrap the coordinator call**

In `packages/orchestration/src/pipeline.ts`, replace `createCoordinatedReviewRunPlan` with this version that applies the same retry + timeout pattern (no queue — single call):

```ts
export async function createCoordinatedReviewRunPlan(
  options: CreateCoordinatedReviewRunPlanOptions,
): Promise<ReviewRunPlan> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
  const retryPolicy = options.retryPolicy ?? DEFAULT_RETRY_POLICY;
  const logger = options.logger ?? noopLogger;

  const { value: result } = await withRetries(
    () =>
      withTimeout(
        (signal) =>
          runCoordinatorAgent({
            input: options.coordinatorInput,
            model: options.coordinatorModel,
            provider: options.provider,
            signal,
          }),
        timeoutMs,
      ),
    retryPolicy,
    { logger, agentLabel: "coordinator" },
  );

  return createReviewRunPlan({
    request: options.request,
    coordinatorOutput: result.output,
  });
}
```

- [ ] **Step 2: Run the existing coordinator test**

Run: `bun test packages/orchestration/test/index.test.ts -t "runs the coordinator agent"`

Expected: PASS — the existing test passes through a stub provider that succeeds on the first call, so the retry/timeout wrappers are transparent.

- [ ] **Step 3: Add a new test for coordinator retry**

Append to `packages/orchestration/test/index.test.ts` (inside the same `describe` block):

```ts
test("retries the coordinator on transient errors and succeeds on second attempt", async () => {
  let calls = 0;

  const plan = await createCoordinatedReviewRunPlan({
    request: baseRequest,
    coordinatorInput: {
      files: [
        {
          path: "services/payments/retry.ts",
          status: "modified",
          additions: 1,
          deletions: 0,
        },
      ],
      availableAgents: ["backend"],
      manifests: {},
    },
    coordinatorModel: "coordinator-test-model",
    retryPolicy: { maxAttempts: 3, delaysMs: [1, 1] },
    timeoutMs: 5_000,
    provider: {
      kind: "custom",
      async generateText() {
        return { text: "unused" };
      },
      async generateObject() {
        calls += 1;
        if (calls === 1) {
          const err: Error & { status?: number } = new Error("429");
          err.status = 429;
          throw err;
        }
        return {
          object: {
            labels: ["payments"],
            assignments: [
              {
                agent: "backend",
                purpose: "Review retry correctness.",
                files: ["services/payments/retry.ts"],
                focusAreas: ["retry behavior"],
                context: "Retry changed.",
              },
            ],
            confidence: "high",
            reasoning: ["Recovered after one transient failure."],
          },
        };
      },
    },
  });

  expect(calls).toBe(2);
  expect(plan.routeSource).toBe("coordinator");
  expect(plan.agents.map((agent) => agent.kind)).toEqual(["backend"]);
});

test("rethrows when the coordinator fails after retries are exhausted", async () => {
  await expect(
    createCoordinatedReviewRunPlan({
      request: baseRequest,
      coordinatorInput: { files: [], availableAgents: ["backend"], manifests: {} },
      coordinatorModel: "coordinator-test-model",
      retryPolicy: { maxAttempts: 2, delaysMs: [1] },
      timeoutMs: 5_000,
      provider: {
        kind: "custom",
        async generateText() {
          return { text: "unused" };
        },
        async generateObject() {
          const err: Error & { status?: number } = new Error("503");
          err.status = 503;
          throw err;
        },
      },
    }),
  ).rejects.toThrow();
});
```

- [ ] **Step 4: Run the new tests**

Run: `bun test packages/orchestration/test/index.test.ts -t "coordinator"`

Expected: PASS (both new tests, plus existing coordinator test).

- [ ] **Step 5: Full check**

Run: `bun run check`

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add packages/orchestration/src/pipeline.ts \
        packages/orchestration/test/index.test.ts
git commit -m "$(cat <<'EOF'
feat(orchestration): wrap coordinator call with retry and timeout

createCoordinatedReviewRunPlan applies the same withRetries(withTimeout(...))
pattern used by specialists, but without a queue (single call). The
coordinator rethrows on persistent failure; without a plan there is no
review.
EOF
)"
```

---

## Task 10: Formatter — optional `failures` section

**Files:**
- Modify: `packages/formatter/src/types.ts`
- Modify: `packages/formatter/src/formatter.ts`
- Modify: `packages/formatter/test/index.test.ts`
- Modify: `packages/formatter/package.json`

### Steps

- [ ] **Step 1: Verify `@asyncs/orchestration` is a dependency of `@asyncs/formatter`**

`packages/formatter/package.json` currently lists `@asyncs/consensus` and `@asyncs/core`. We need `SpecialistFailure` from `@asyncs/orchestration`, but adding an orchestration dep here introduces a cycle (orchestration depends on formatter? It currently does — `executeSpecialistAssignments` imports formatter via the orchestration index re-export tree... actually no, only `preview.ts` uses `formatReviewReportMarkdown`).

Inspect imports to confirm there is no cycle:

```bash
grep -n "from \"@asyncs/formatter\"" packages/orchestration/src/*.ts
```

Expected output:
```
packages/orchestration/src/preview.ts:import { formatReviewReportMarkdown } from "@asyncs/formatter";
```

`@asyncs/orchestration` imports `@asyncs/formatter`. Adding `@asyncs/orchestration` as a dep of `@asyncs/formatter` would create a cycle. Avoid this — instead, define `SpecialistFailureLike` as a structural type inside `@asyncs/formatter` that's compatible with `SpecialistFailure`. Callers (orchestration's preview, eventually the real CLI/Action wiring) pass through the same shape.

- [ ] **Step 2: Write the failing tests**

Append to `packages/formatter/test/index.test.ts`:

```ts
test("formats a consensus report with no failures (no section rendered)", () => {
  const report: ConsensusReport = {
    findings: [finding],
    duplicateCount: 0,
    suppressedCount: 0,
  };

  const markdown = formatReviewReportMarkdown({
    report,
    failures: [],
  });

  expect(markdown).not.toContain("Specialists that failed");
});

test("renders a Specialists that failed section when failures are provided", () => {
  const report: ConsensusReport = {
    findings: [],
    duplicateCount: 0,
    suppressedCount: 0,
  };

  const markdown = formatReviewReportMarkdown({
    report,
    failures: [
      {
        agent: {
          kind: "backend",
          name: "Backend Agent",
          purpose: "Review backend correctness.",
        },
        attempts: 3,
        error: "Timed out after 60000ms",
      },
      {
        agent: {
          kind: "security",
          name: "Security Agent",
          purpose: "Review security risk.",
        },
        attempts: 1,
        error: "401 Unauthorized",
      },
    ],
  });

  expect(markdown).toContain("## Specialists that failed");
  expect(markdown).toContain("Backend Agent");
  expect(markdown).toContain("3 attempt");
  expect(markdown).toContain("Timed out after 60000ms");
  expect(markdown).toContain("Security Agent");
  expect(markdown).toContain("1 attempt");
  expect(markdown).toContain("401 Unauthorized");
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test packages/formatter/test/index.test.ts -t "Specialists"`

Expected: FAIL — `failures` not on `FormatReviewReportOptions`, no section rendered.

- [ ] **Step 4: Add `SpecialistFailureLike` type and update options in `packages/formatter/src/types.ts`**

Replace the file contents with:

```ts
import type { ConsensusReport } from "@asyncs/consensus";
import type { AgentDefinition } from "@asyncs/core";

export type SpecialistFailureLike = {
  agent: AgentDefinition;
  attempts: number;
  error: string;
};

export type FormatReviewReportOptions = {
  report: ConsensusReport;
  title?: string;
  failures?: readonly SpecialistFailureLike[];
};
```

- [ ] **Step 5: Render the failures section in `packages/formatter/src/formatter.ts`**

Replace `formatReviewReportMarkdown` with this version:

```ts
export function formatReviewReportMarkdown(options: FormatReviewReportOptions): string {
  const title = options.title ?? DEFAULT_REVIEW_REPORT_TITLE;
  const failures = options.failures ?? [];

  const headerLines = [
    `# ${title}`,
    "",
    `Findings: ${options.report.findings.length}`,
    `Deduplicated findings: ${options.report.duplicateCount}`,
    `Suppressed noisy findings: ${options.report.suppressedCount}`,
    "",
  ];

  const bodySections: string[] = [];

  if (options.report.findings.length === 0) {
    bodySections.push(DEFAULT_EMPTY_REVIEW_MESSAGE);
  } else {
    bodySections.push(...options.report.findings.map(formatFindingMarkdown));
  }

  if (failures.length > 0) {
    bodySections.push(formatFailuresMarkdown(failures));
  }

  return [...headerLines, bodySections.join("\n\n"), ""].join("\n");
}

function formatFailuresMarkdown(failures: readonly SpecialistFailureLike[]): string {
  const lines = ["## Specialists that failed", ""];

  for (const failure of failures) {
    const attemptLabel = failure.attempts === 1 ? "1 attempt" : `${failure.attempts} attempts`;
    lines.push(`- **${failure.agent.name}** — failed after ${attemptLabel}. Last error: \`${failure.error}\`.`);
  }

  return lines.join("\n");
}
```

Update the imports at the top of `packages/formatter/src/formatter.ts` to include the new type:

```ts
import type { ReviewFinding } from "@asyncs/core";
import { DEFAULT_EMPTY_REVIEW_MESSAGE, DEFAULT_REVIEW_REPORT_TITLE } from "./constants";
import type { FormatReviewReportOptions, SpecialistFailureLike } from "./types";
```

- [ ] **Step 6: Run the new tests**

Run: `bun test packages/formatter/test/index.test.ts -t "Specialists"`

Expected: PASS.

- [ ] **Step 7: Re-export `SpecialistFailureLike` from the formatter package**

In `packages/formatter/src/index.ts`, verify the existing `export type * from "./types"` line is present. If not, replace the file with:

```ts
export * from "./constants";
export * from "./formatter";
export type * from "./types";
```

- [ ] **Step 8: Full check**

Run: `bun run check`

Expected: green (existing formatter tests still pass; 2 new tests added).

- [ ] **Step 9: Commit**

```bash
git add packages/formatter/src/types.ts \
        packages/formatter/src/formatter.ts \
        packages/formatter/src/index.ts \
        packages/formatter/test/index.test.ts
git commit -m "$(cat <<'EOF'
feat(formatter): render 'Specialists that failed' section when failures present

Adds optional failures: readonly SpecialistFailureLike[] to the
formatter options. Renders a section listing each failed agent with
attempt count and last error. Omits the section entirely when no
failures are supplied — keeps the happy-path output unchanged.
EOF
)"
```

---

## Task 11: Integration test sweep + concurrency + timeout scenarios

**Files:**
- Modify: `packages/orchestration/test/index.test.ts`

### Steps

- [ ] **Step 1: Add a concurrency test**

Append to `packages/orchestration/test/index.test.ts` (inside the existing `describe("review run planning", ...)` block):

```ts
test("respects the concurrency cap when running specialists", async () => {
  const plan = createReviewRunPlan({
    request: baseRequest,
    coordinatorOutput: {
      labels: ["multi"],
      assignments: [
        {
          agent: "backend",
          purpose: "Review.",
          files: [],
          focusAreas: [],
          context: "",
        },
        {
          agent: "frontend",
          purpose: "Review.",
          files: [],
          focusAreas: [],
          context: "",
        },
        {
          agent: "security",
          purpose: "Review.",
          files: [],
          focusAreas: [],
          context: "",
        },
        {
          agent: "architecture",
          purpose: "Review.",
          files: [],
          focusAreas: [],
          context: "",
        },
      ],
      confidence: "high",
      reasoning: ["wide review"],
    },
  });

  let inFlight = 0;
  let observedMax = 0;

  const result = await executeSpecialistAssignments({
    plan,
    files: [],
    model: "specialist-test-model",
    concurrency: 2,
    timeoutMs: 5_000,
    retryPolicy: { maxAttempts: 1, delaysMs: [] },
    provider: {
      kind: "custom",
      async generateText() {
        return { text: "unused" };
      },
      async generateObject() {
        inFlight += 1;
        observedMax = Math.max(observedMax, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlight -= 1;
        return {
          object: {
            findings: [],
            summary: "ok",
          },
        };
      },
    },
  });

  expect(observedMax).toBeLessThanOrEqual(2);
  expect(result.runs).toHaveLength(4);
  expect(result.failures).toHaveLength(0);
});
```

- [ ] **Step 2: Add a timeout-as-transient test**

Append:

```ts
test("classifies a timeout as transient and retries until exhaustion", async () => {
  const plan = createReviewRunPlan({
    request: baseRequest,
    coordinatorOutput: {
      labels: ["payments"],
      assignments: [
        {
          agent: "backend",
          purpose: "Review.",
          files: [],
          focusAreas: [],
          context: "",
        },
      ],
      confidence: "high",
      reasoning: ["one specialist"],
    },
  });

  const result = await executeSpecialistAssignments({
    plan,
    files: [],
    model: "specialist-test-model",
    concurrency: 1,
    timeoutMs: 10,
    retryPolicy: { maxAttempts: 2, delaysMs: [1] },
    provider: {
      kind: "custom",
      async generateText() {
        return { text: "unused" };
      },
      async generateObject(request) {
        return new Promise((_, reject) => {
          request.signal?.addEventListener("abort", () => {
            const error = new Error("aborted by signal");
            error.name = "AbortError";
            reject(error);
          });
        });
      },
    },
  });

  expect(result.runs).toHaveLength(0);
  expect(result.failures).toHaveLength(1);
  expect(result.failures[0]?.attempts).toBe(2);
  expect(result.failures[0]?.error).toContain("Timed out after 10ms");
});
```

- [ ] **Step 3: Run the new tests**

Run: `bun test packages/orchestration/test/index.test.ts -t "concurrency cap"`
Then: `bun test packages/orchestration/test/index.test.ts -t "timeout as transient"`

Expected: both PASS.

- [ ] **Step 4: Full check**

Run: `bun run check`

Expected: green. Final test count should be the prior count plus all the new tests added across tasks 1, 2, 3, 4, 5, 6, 8, 9, 10, 11.

- [ ] **Step 5: Commit**

```bash
git add packages/orchestration/test/index.test.ts
git commit -m "$(cat <<'EOF'
test(orchestration): cover concurrency cap and timeout-as-transient paths

Integration tests verify that PQueue keeps in-flight specialists at or
below the configured concurrency, and that a timeout fired by
withTimeout is classified as transient and retried by withRetries
until the policy exhausts.
EOF
)"
```

---

## Done — what's left after this slice

After this plan completes, the orchestrator survives individual specialist failures, abortable hangs, and transient API errors, with structured logging at every retry boundary. The Anthropic provider forwards a signal so timeouts free network resources. The formatter surfaces partial failures in the rendered review.

The next slices remain:

- **Slice next:** Local diff source via `simple-git` to produce real `ChangedFile[]` from the working tree.
- **Slice after:** `runReviewPipeline` composition in `@asyncs/orchestration` + CLI `review --local` path that reads `ANTHROPIC_API_KEY` from env, constructs the Anthropic provider with a pino-backed Logger, and runs the real pipeline end-to-end.

Each remains its own brainstorming → spec → plan cycle.

---

## Self-Review Notes

(Inline check after writing.)

**1. Spec coverage:**
- Logger interface in core → Task 1 ✓
- Provider signal threading → Task 2 ✓
- Agent runners signal → Task 3 ✓
- `withTimeout` → Task 4 ✓
- `isTransientError` + `RetryExhaustedError` → Task 5 ✓
- `withRetries` → Task 6 ✓
- p-queue dep + defaults + types scaffold → Task 7 ✓
- Queue + retry + timeout in specialists → Task 8 ✓
- Coordinator retry + timeout → Task 9 ✓
- Formatter failures section → Task 10 ✓
- Integration tests for concurrency and timeout → Task 11 ✓

**2. Placeholder scan:** No `TBD`/`TODO`/`implement later`/"appropriate error handling" anywhere. Every code step has complete code.

**3. Type consistency:**
- `Logger` defined in Task 1, used in Tasks 6, 7, 8, 9.
- `RetryPolicy` defined in Task 6, referenced in Task 7's constants and types, used in Tasks 8 and 9.
- `RetryExhaustedError` defined in Task 5, used in Task 8.
- `SpecialistFailure` defined in Task 7, used in Tasks 8 and 10 (via `SpecialistFailureLike`).
- `SpecialistAssignmentRun` extended with `attempts` in Task 7, populated with the literal `attempts: 1` in Task 7's pipeline patch, then with the real `attempts` from `withRetries` in Task 8.
- `noopLogger` from `@asyncs/core` used as default in Tasks 8 and 9.
- All method names (`withTimeout`, `withRetries`, `isTransientError`) used consistently across tasks.

**4. Acknowledged trade-offs in the spec are respected:**
- The structural `SpecialistFailureLike` type in the formatter (Task 10 Step 1) avoids a package-dep cycle with orchestration. Documented inline.
- The single `as` cast exception in `@asyncs/agents/schemas.ts` from the previous slice is untouched. No new `as` casts introduced.
