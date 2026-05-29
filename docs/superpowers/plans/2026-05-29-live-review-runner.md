# Live Review Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `apps/action` app whose surface-agnostic runner builds the live Anthropic provider, loads the real changed files via `@asyncs/diff`, runs `runReviewPipeline`, and returns the review — plus a dev-only smoke entry for the first live model run.

**Architecture:** Pure composition over three untouched pieces. `resolveAnthropicProvider` (env → `createAnthropicProviderClient`) isolates the only vendor-specific line. `reviewDiff` takes an injected `provider` plus an injectable `loadDiff` seam (default `loadLocalDiff`), turns a `LocalDiffMode` into `files`, runs the pipeline, and returns `{ result, diff }`. `smoke.ts` wires env → provider → `reviewDiff` → stdout for manual live runs. No GitHub surface, no octokit, no bundling.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Bun test runner, Bun workspaces (`workspace:*`). Reuses `@asyncs/providers` (`createAnthropicProviderClient`), `@asyncs/diff` (`loadLocalDiff`), `@asyncs/orchestration` (`runReviewPipeline`). Tests inject a fake `ProviderClient` and a fake `loadDiff` — no network, no real git.

---

## File Structure

New app at `apps/action/` (private workspace member `@asyncs/action`). This slice creates the runner core only; slice 6 adds the GitHub Action wrapper to the same app.

- **Create `apps/action/package.json`** — workspace member; `workspace:*` deps on `@asyncs/core`, `@asyncs/diff`, `@asyncs/orchestration`, `@asyncs/providers`; a `smoke` script.
- **Create `apps/action/src/constants.ts`** — `DEFAULT_REVIEW_MODEL`, `MISSING_API_KEY_MESSAGE`. One responsibility: tunable defaults/messages.
- **Create `apps/action/src/types.ts`** — `ResolveAnthropicProviderOptions`, `ResolvedProvider`, `ReviewDiffOptions`, `ReviewRunResult`. Types only.
- **Create `apps/action/src/provider.ts`** — `resolveAnthropicProvider` + `MissingApiKeyError`. The only Anthropic-aware file.
- **Create `apps/action/src/runner.ts`** — `reviewDiff`: load diff → run pipeline → `{ result, diff }`.
- **Create `apps/action/src/smoke.ts`** — dev-only entry; not exported from `index.ts`. The manual live-run acceptance check.
- **Create `apps/action/src/index.ts`** — public surface re-exports (grows task-by-task).
- **Create `apps/action/test/provider.test.ts`** — `resolveAnthropicProvider` contract.
- **Create `apps/action/test/runner.test.ts`** — `reviewDiff` contract (happy path + empty-diff short-circuit).

**No changes to any existing package.** The root `tsconfig.json` already globs `apps/**/*.ts`, so `bun run typecheck` covers the new app with no per-app tsconfig (matching `apps/cli`, which has none). `bun test` auto-discovers `apps/action/test/*.test.ts`.

**Contract facts the code relies on (verified against current code):**
- `createAnthropicProviderClient(options: { apiKey: string; maxTokens?: number }): ProviderClient`, exported from `@asyncs/providers`; returned client has `kind: "anthropic"` (`packages/providers/src/anthropic.ts:47-61`). Construction makes no network call (the SDK client is built lazily).
- `loadLocalDiff(options: { mode: LocalDiffMode; cwd?: string }): Promise<LocalDiffResult>` from `@asyncs/diff`; `LocalDiffResult = { baseRef; headRef; files: ChangedFile[]; skippedBinaries: readonly string[] }`; `LocalDiffMode = { kind: "workingTree"; baseRef? } | { kind: "staged" } | { kind: "commitRange"; from; to }` (`packages/diff/src/types.ts`).
- `runReviewPipeline(options: RunReviewPipelineOptions): Promise<ReviewPipelineResult>` from `@asyncs/orchestration`; `RunReviewPipelineOptions = { request; files; provider; model; repository? } & RobustnessOptions`; `RobustnessOptions = { timeoutMs?; retryPolicy?; concurrency?; logger? }`; `ReviewPipelineResult = { plan; report; markdown; failures }` (`packages/orchestration/src/types.ts:47-84`). Empty `files` already short-circuits before any provider call and renders `"No actionable findings after consensus filtering."`.
- `ReviewRequest = { prNumber; mode; agents; postComments; dryRun }` and `DEFAULT_REVIEW_REQUEST_OPTIONS = { mode: "low-noise"; agents: []; postComments: false; dryRun: false }` from `@asyncs/core` (`packages/core/src/constants.ts:13-18`).
- The fake-provider test pattern: a `ProviderClient` whose `generateObject` branches on `request.schemaName` (`"CoordinatorAgentOutput"` vs `"SpecialistAgentOutput"`) — established in slice 4 (`packages/orchestration/test/engine.test.ts`).
- The formatter renders findings as `### <AgentName> - <title>` (e.g. `### Backend - ...`).

---

### Task 1: Scaffold the `apps/action` app

Create the workspace member plus its constants, types, and an initial barrel export. No behavior yet, so this task is verified by typecheck rather than a unit test.

**Files:**
- Create: `apps/action/package.json`
- Create: `apps/action/src/constants.ts`
- Create: `apps/action/src/types.ts`
- Create: `apps/action/src/index.ts`

- [ ] **Step 1: Create `apps/action/package.json`**

```json
{
  "name": "@asyncs/action",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "smoke": "bun run src/smoke.ts"
  },
  "dependencies": {
    "@asyncs/core": "workspace:*",
    "@asyncs/diff": "workspace:*",
    "@asyncs/orchestration": "workspace:*",
    "@asyncs/providers": "workspace:*"
  }
}
```

- [ ] **Step 2: Create `apps/action/src/constants.ts`**

```ts
export const DEFAULT_REVIEW_MODEL = "claude-sonnet-4-5";

export const MISSING_API_KEY_MESSAGE =
  "Anthropic API key is required. Set ANTHROPIC_API_KEY or pass { apiKey } to resolveAnthropicProvider.";
```

(`DEFAULT_REVIEW_MODEL` is a current Claude model id and is overridable via `ASYNCS_MODEL` or the `model` option — no test depends on its literal value.)

- [ ] **Step 3: Create `apps/action/src/types.ts`**

```ts
import type { ReviewRequest } from "@asyncs/core";
import type { LoadLocalDiffOptions, LocalDiffMode, LocalDiffResult } from "@asyncs/diff";
import type { ReviewPipelineResult, RobustnessOptions } from "@asyncs/orchestration";
import type { ProviderClient } from "@asyncs/providers";

export type ResolveAnthropicProviderOptions = {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
};

export type ResolvedProvider = {
  provider: ProviderClient;
  model: string;
};

export type ReviewDiffOptions = {
  request: ReviewRequest;
  diff: LocalDiffMode;
  provider: ProviderClient;
  model: string;
  cwd?: string;
  repository?: string;
  loadDiff?: (options: LoadLocalDiffOptions) => Promise<LocalDiffResult>;
} & RobustnessOptions;

export type ReviewRunResult = {
  result: ReviewPipelineResult;
  diff: LocalDiffResult;
};
```

- [ ] **Step 4: Create `apps/action/src/index.ts`**

```ts
export * from "./constants";
export type * from "./types";
```

- [ ] **Step 5: Install the new workspace member and typecheck**

Run: `bun install`
Expected: completes; `@asyncs/action` is linked as a workspace package.

Run: `bun run typecheck`
Expected: PASS — `tsc --noEmit` clean (the new files compile; unused exported types are allowed).

- [ ] **Step 6: Commit**

```bash
git add apps/action/package.json apps/action/src/constants.ts apps/action/src/types.ts apps/action/src/index.ts
git add bun.lock bun.lockb 2>/dev/null || true   # include the lockfile if bun install changed it
git commit -m "$(cat <<'EOF'
feat(action): scaffold apps/action with runner types and constants

New private @asyncs/action workspace member: default model, missing-key
message, and the runner/provider option + result types. Provider, runner,
and smoke entry land in follow-up commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `resolveAnthropicProvider` (env → provider)

Build the only Anthropic-aware file: read the API key (option → `ANTHROPIC_API_KEY`), throw a clear error if absent, resolve the model (option → `ASYNCS_MODEL` → default), and construct the live client.

**Files:**
- Test: `apps/action/test/provider.test.ts`
- Create: `apps/action/src/provider.ts`
- Modify: `apps/action/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/action/test/provider.test.ts`:

```ts
import { afterEach, describe, expect, test } from "bun:test";
import { DEFAULT_REVIEW_MODEL } from "../src/constants";
import { MissingApiKeyError, resolveAnthropicProvider } from "../src/provider";

const ENV_KEYS = ["ANTHROPIC_API_KEY", "ASYNCS_MODEL"] as const;
const savedEnv = new Map<string, string | undefined>();

function clearEnv(): void {
  for (const key of ENV_KEYS) {
    savedEnv.set(key, process.env[key]);
    delete process.env[key];
  }
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const original = savedEnv.get(key);

    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }

  savedEnv.clear();
});

describe("resolveAnthropicProvider", () => {
  test("throws MissingApiKeyError when no key is available", () => {
    clearEnv();
    expect(() => resolveAnthropicProvider({})).toThrow(MissingApiKeyError);
  });

  test("builds an Anthropic provider from an explicit apiKey with the default model", () => {
    clearEnv();
    const { provider, model } = resolveAnthropicProvider({ apiKey: "test-key" });

    expect(provider.kind).toBe("anthropic");
    expect(model).toBe(DEFAULT_REVIEW_MODEL);
  });

  test("prefers an explicit model option over the default", () => {
    clearEnv();
    const { model } = resolveAnthropicProvider({ apiKey: "test-key", model: "custom-model" });

    expect(model).toBe("custom-model");
  });

  test("falls back to ASYNCS_MODEL when no model option is given", () => {
    clearEnv();
    process.env.ASYNCS_MODEL = "env-model";
    const { model } = resolveAnthropicProvider({ apiKey: "test-key" });

    expect(model).toBe("env-model");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/action/test/provider.test.ts`
Expected: FAIL — cannot resolve `../src/provider` / `resolveAnthropicProvider` is not exported (file does not exist yet).

- [ ] **Step 3: Create `apps/action/src/provider.ts`**

```ts
import { createAnthropicProviderClient } from "@asyncs/providers";
import { DEFAULT_REVIEW_MODEL, MISSING_API_KEY_MESSAGE } from "./constants";
import type { ResolveAnthropicProviderOptions, ResolvedProvider } from "./types";

export class MissingApiKeyError extends Error {
  constructor() {
    super(MISSING_API_KEY_MESSAGE);
    this.name = "MissingApiKeyError";
  }
}

export function resolveAnthropicProvider(options: ResolveAnthropicProviderOptions = {}): ResolvedProvider {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;

  if (apiKey === undefined || apiKey.length === 0) {
    throw new MissingApiKeyError();
  }

  const model = options.model ?? process.env.ASYNCS_MODEL ?? DEFAULT_REVIEW_MODEL;

  const provider = createAnthropicProviderClient({
    apiKey,
    ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
  });

  return { provider, model };
}
```

- [ ] **Step 4: Export the provider**

Update `apps/action/src/index.ts` to:

```ts
export * from "./constants";
export * from "./provider";
export type * from "./types";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test apps/action/test/provider.test.ts`
Expected: PASS — 4 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add apps/action/src/provider.ts apps/action/src/index.ts apps/action/test/provider.test.ts
git commit -m "$(cat <<'EOF'
feat(action): resolve the live Anthropic provider from env

resolveAnthropicProvider reads the API key (option or ANTHROPIC_API_KEY),
throws MissingApiKeyError when absent, resolves the model (option,
ASYNCS_MODEL, or default), and builds the client.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `reviewDiff` (load diff → run pipeline)

Compose diff-loading and the pipeline. The `loadDiff` seam (default `loadLocalDiff`) makes this unit-testable with no real git; the provider is injected so there is no network.

**Files:**
- Test: `apps/action/test/runner.test.ts`
- Create: `apps/action/src/runner.ts`
- Modify: `apps/action/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/action/test/runner.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { ChangedFile, ReviewRequest } from "@asyncs/core";
import type { LoadLocalDiffOptions, LocalDiffResult } from "@asyncs/diff";
import type { ProviderClient, ProviderGenerateObjectRequest } from "@asyncs/providers";
import { reviewDiff } from "../src/runner";

const baseRequest: ReviewRequest = {
  prNumber: 7,
  mode: "low-noise",
  agents: [],
  postComments: false,
  dryRun: true,
};

const changedFiles: ChangedFile[] = [
  {
    path: "src/payments/retry.ts",
    status: "modified",
    additions: 12,
    deletions: 3,
    patch: "@@ retryPayment\n+ await chargeWithRetry(orderId)",
  },
];

function fakeDiffResult(files: ChangedFile[]): LocalDiffResult {
  return {
    baseRef: "main",
    headRef: "feature",
    files,
    skippedBinaries: [],
  };
}

function createReviewingProvider(): ProviderClient {
  return {
    kind: "custom",
    async generateText() {
      return { text: "unused" };
    },
    async generateObject(request: ProviderGenerateObjectRequest) {
      if (request.schemaName === "CoordinatorAgentOutput") {
        return {
          object: {
            labels: ["payments"],
            assignments: [
              {
                agent: "backend",
                purpose: "Review retry correctness.",
                files: ["src/payments/retry.ts"],
                focusAreas: ["retry behavior"],
                context: "Payment retry behavior changed.",
              },
            ],
            confidence: "high",
            reasoning: ["Retry changes need review."],
          },
        };
      }

      return {
        object: {
          findings: [
            {
              agent: "backend",
              title: "Retry path lacks idempotency",
              message: "Retrying the charge without an idempotency key risks duplicate charges.",
              severity: "high",
              confidence: "high",
              file: "src/payments/retry.ts",
              line: 10,
              evidence: "The patch calls chargeWithRetry without an idempotency key.",
              recommendation: "Pass a stable idempotency key into chargeWithRetry.",
            },
          ],
          summary: "Reviewed retry assignment.",
        },
      };
    },
  };
}

describe("reviewDiff", () => {
  test("loads the diff with the given mode and runs the live pipeline", async () => {
    const seenOptions: LoadLocalDiffOptions[] = [];
    const diffResult = fakeDiffResult(changedFiles);

    const run = await reviewDiff({
      request: baseRequest,
      diff: { kind: "commitRange", from: "main", to: "feature" },
      provider: createReviewingProvider(),
      model: "test-model",
      cwd: "/tmp/repo",
      loadDiff: async (options) => {
        seenOptions.push(options);
        return diffResult;
      },
    });

    expect(seenOptions).toHaveLength(1);
    expect(seenOptions[0]).toEqual({
      mode: { kind: "commitRange", from: "main", to: "feature" },
      cwd: "/tmp/repo",
    });
    expect(run.diff).toBe(diffResult);
    expect(run.result.plan.routeSource).toBe("coordinator");
    expect(run.result.report.findings).toHaveLength(1);
    expect(run.result.markdown).toContain("### Backend - Retry path lacks idempotency");
  });

  test("short-circuits on an empty diff without calling the provider", async () => {
    let providerCalled = false;

    const provider: ProviderClient = {
      kind: "custom",
      async generateText() {
        providerCalled = true;
        return { text: "unused" };
      },
      async generateObject() {
        providerCalled = true;
        return { object: {} };
      },
    };

    const run = await reviewDiff({
      request: baseRequest,
      diff: { kind: "workingTree" },
      provider,
      model: "test-model",
      loadDiff: async () => fakeDiffResult([]),
    });

    expect(providerCalled).toBe(false);
    expect(run.diff.files).toHaveLength(0);
    expect(run.result.report.findings).toHaveLength(0);
    expect(run.result.markdown).toContain("No actionable findings after consensus filtering.");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/action/test/runner.test.ts`
Expected: FAIL — cannot resolve `../src/runner` / `reviewDiff` is not exported (file does not exist yet).

- [ ] **Step 3: Create `apps/action/src/runner.ts`**

```ts
import { loadLocalDiff } from "@asyncs/diff";
import { runReviewPipeline } from "@asyncs/orchestration";
import type { ReviewDiffOptions, ReviewRunResult } from "./types";

export async function reviewDiff(options: ReviewDiffOptions): Promise<ReviewRunResult> {
  const loadDiff = options.loadDiff ?? loadLocalDiff;

  const diff = await loadDiff({
    mode: options.diff,
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
  });

  const result = await runReviewPipeline({
    request: options.request,
    files: diff.files,
    provider: options.provider,
    model: options.model,
    ...(options.repository === undefined ? {} : { repository: options.repository }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.retryPolicy === undefined ? {} : { retryPolicy: options.retryPolicy }),
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  });

  return { result, diff };
}
```

Note: the conditional-spread idiom is required by `exactOptionalPropertyTypes` (you cannot pass `cwd: undefined` to a `cwd?: string` field). No `as` casts are needed anywhere.

- [ ] **Step 4: Export the runner**

Update `apps/action/src/index.ts` to:

```ts
export * from "./constants";
export * from "./provider";
export * from "./runner";
export type * from "./types";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test apps/action/test/runner.test.ts`
Expected: PASS — 2 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add apps/action/src/runner.ts apps/action/src/index.ts apps/action/test/runner.test.ts
git commit -m "$(cat <<'EOF'
feat(action): compose reviewDiff over the diff loader and pipeline

reviewDiff loads the changed files for a LocalDiffMode (injectable
loadDiff seam, default loadLocalDiff) and runs runReviewPipeline,
returning { result, diff }. Empty diffs short-circuit with no provider call.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `smoke.ts` dev entry

A dev/debug entry to perform the first live model run. It is not exported from `index.ts` and is not unit-tested (it reads env and spends tokens — the spec keeps it manual/opt-in). It is verified by typecheck; the live run is the slice's manual acceptance check.

**Files:**
- Create: `apps/action/src/smoke.ts`

- [ ] **Step 1: Create `apps/action/src/smoke.ts`**

```ts
import { DEFAULT_REVIEW_REQUEST_OPTIONS, type ReviewRequest } from "@asyncs/core";
import type { LocalDiffMode } from "@asyncs/diff";
import { resolveAnthropicProvider } from "./provider";
import { reviewDiff } from "./runner";

function parseDiffMode(args: readonly string[]): LocalDiffMode {
  const [from, to] = args;

  if (from !== undefined && to !== undefined) {
    return { kind: "commitRange", from, to };
  }

  return { kind: "workingTree" };
}

export async function runSmoke(args: readonly string[]): Promise<string> {
  const { provider, model } = resolveAnthropicProvider();

  const request: ReviewRequest = {
    prNumber: 0,
    mode: DEFAULT_REVIEW_REQUEST_OPTIONS.mode,
    agents: [...DEFAULT_REVIEW_REQUEST_OPTIONS.agents],
    postComments: DEFAULT_REVIEW_REQUEST_OPTIONS.postComments,
    dryRun: DEFAULT_REVIEW_REQUEST_OPTIONS.dryRun,
  };

  const { result, diff } = await reviewDiff({
    request,
    diff: parseDiffMode(args),
    provider,
    model,
  });

  const header = `${diff.baseRef}..${diff.headRef}, ${diff.skippedBinaries.length} binaries skipped`;

  return `${header}\n\n${result.markdown}`;
}

if (import.meta.main) {
  try {
    const output = await runSmoke(Bun.argv.slice(2));
    process.stdout.write(`${output}\n`);
    process.exit(0);
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `bun run typecheck`
Expected: PASS — `tsc --noEmit` clean (top-level `await` is valid in this ESNext module; `Bun.argv` / `import.meta.main` are typed via `@types/bun`).

- [ ] **Step 3: (Manual, optional) one live run**

With a real key and uncommitted changes present, or a commit range:

```bash
ANTHROPIC_API_KEY=sk-... bun run --cwd apps/action smoke
# or against an explicit range:
ANTHROPIC_API_KEY=sk-... bun run --cwd apps/action smoke <baseRef> <headRef>
```

Expected: a `base..head, N binaries skipped` header followed by the review markdown. This is the acceptance check that the real-model path works; it is not part of the automated suite. (If `ASYNCS_MODEL` is unset, it uses `DEFAULT_REVIEW_MODEL` — override if that id is not enabled for your key.)

- [ ] **Step 4: Commit**

```bash
git add apps/action/src/smoke.ts
git commit -m "$(cat <<'EOF'
feat(action): add dev smoke entry for the first live review run

smoke.ts resolves the provider from env, picks a diff mode (working tree
by default, or a commit range from argv), runs reviewDiff, and prints the
markdown. Dev-only manual entry; not exported, not in the test suite.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Full verification

Run the repo-wide gate to confirm types, lint, format, and the whole test suite pass.

**Files:** none (verification only)

- [ ] **Step 1: Run the full check**

Run: `bun run check`
Expected: `tsc --noEmit` clean, `eslint .` clean for the new files, `prettier --check .` clean, and all `bun test` files pass (the new `provider.test.ts` (4) + `runner.test.ts` (2) plus the existing suite).

Note: `eslint .` / `prettier --check .` may report pre-existing issues under `.remember/` (a local, gitignored scratch directory unrelated to this slice, as seen in slice 4). Those are not introduced by this work. The new `apps/action` files must be lint- and format-clean.

- [ ] **Step 2: If `prettier --check` reports formatting on our files**

Run `bun run format`, then re-run `bun run check`. If `format` changed tracked files in `apps/action`, commit them:

```bash
git add apps/action
git commit -m "$(cat <<'EOF'
chore(action): apply prettier formatting

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If the new files were already clean in Step 1, skip this step — do not create an empty commit.

---

## Notes for the implementer

- **Vendor neutrality:** the Anthropic SDK is reached only through `@asyncs/providers`' `createAnthropicProviderClient`, called only in `provider.ts`. `runner.ts` imports no provider concretion. Do not import `@anthropic-ai/sdk` anywhere in `apps/action`.
- **Zero `as` casts:** none are needed. If you reach for one, stop and restructure.
- **`exactOptionalPropertyTypes`:** use the conditional-spread idiom for every optional pass-through (`cwd`, `repository`, `timeoutMs`, `retryPolicy`, `concurrency`, `logger`, `maxTokens`) — never pass `x: undefined` to an `x?: T` field.
- **Do not modify** `@asyncs/providers`, `@asyncs/diff`, or `@asyncs/orchestration` — this slice is pure composition over those untouched stages.
- **`smoke.ts` is intentionally untested** and intentionally not exported from `index.ts`: it is the manual live-run entry. Its correctness is covered by typecheck plus the optional live run.
- **`DEFAULT_REVIEW_MODEL`** is a real default, overridable via `ASYNCS_MODEL` or the `model` option. No automated test depends on its literal value (the provider test asserts equality against the constant, not a hardcoded string).
- **Out of scope (slice 6):** `action.yml`, PR-event parsing, octokit, comment posting, bundling, dogfood workflow. Don't add them here.
