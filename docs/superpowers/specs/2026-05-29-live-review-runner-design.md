# Live Review Runner — Design Spec

**Date:** 2026-05-29
**Status:** Drafted, pending Alex review
**Branch:** `feat/live-review-runner`

## Goal

Wire asyncs to a **real provider against a real diff** for the first time. Today `runReviewPipeline` (`@asyncs/orchestration`, shipped in slice 4) composes the full review but takes an already-built `provider` and pre-loaded `files`; the only live entry that exists is the CLI's `runPreviewReviewPipeline`, which fabricates files and never calls a model. This slice adds a small surface-agnostic **runner** in a new `apps/action` app that constructs the live Anthropic provider, loads the real changed files via `@asyncs/diff`, runs the pipeline, and returns the formatted review — plus a dev-only smoke entry so we can do one live run and confirm the real-model path works (malformed JSON, schema drift, latency) in a debuggable place before it ever runs in CI.

This is the first of two slices toward the product goal "open a PR → asyncs reviews it":

- **Slice 5 (this spec):** the live runner core + a dev smoke entry. No GitHub surface.
- **Slice 6:** the GitHub Action — `action.yml`, PR-event parsing, octokit comment posting, bundling, dogfood workflow — wrapping this runner. The product goal lands there.

Everything the runner needs already exists, so this slice is composition + a thin env→provider helper + a dev entry + tests. It reuses `createAnthropicProviderClient`, `loadLocalDiff`, and `runReviewPipeline` untouched.

## Non-goals (explicitly out of scope)

- `action.yml`, GitHub PR-event parsing, reading the event payload. Slice 6.
- Octokit, a PR loader, comment posting (`packages/github` does not exist and is not created here). Slice 6.
- Bundling (`ncc` / `esbuild` / `tsup`) for distribution. Slice 6.
- A dogfood workflow under `.github/workflows/`. Slice 6.
- Fail-soft vs fail-hard policy (whether a failed review blocks the PR check). The runner propagates errors; Slice 6 decides presentation.
- A real CLI product command (`review --local`). The CLI stays deprioritized; the smoke entry here is a dev/debug script, not a product surface.
- Multi-provider selection. Anthropic only for v1; the provider is injectable so this isn't baked in.
- Per-file inline review comments, severity gating, label-based routing.

## Architecture

```txt
resolveAnthropicProvider({ apiKey?, model?, maxTokens? })   ← reads ANTHROPIC_API_KEY / ASYNCS_MODEL fallback
        ↓  { provider, model }
reviewDiff({ request, diff, provider, model, cwd?, repository?, loadDiff?, ...robustness })
        ↓
  loadLocalDiff({ mode: diff, cwd? })        (reused; simple-git)
        ↓  { baseRef, headRef, files, skippedBinaries }
  runReviewPipeline({ request, files, provider, model, repository?, ...robustness })   (reused)
        ↓  { plan, report, markdown, failures }
  { result, diff }
        ↓
  smoke.ts (dev entry): prints result.markdown + "base..head, N binaries skipped"
```

`reviewDiff` owns exactly one new behavior over `runReviewPipeline`: turning a diff spec into `files`. Provider construction is a separate concern in `provider.ts`. The empty-diff short-circuit already lives in `runReviewPipeline` and is reused as-is.

## New app: `@asyncs/action`

A new private workspace app at `apps/action/`. Package name `@asyncs/action`, `"private": true`, `workspace:*` dependencies on `@asyncs/core`, `@asyncs/diff`, `@asyncs/orchestration`, `@asyncs/providers`. This slice creates the app and its core; Slice 6 adds the GitHub wrapper to the same app.

### `apps/action/src/provider.ts`

The only Anthropic-aware file in the app — keeps the vendor coupling in one place.

```ts
export type ResolveAnthropicProviderOptions = {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
};

export type ResolvedProvider = {
  provider: ProviderClient;
  model: string;
};

export function resolveAnthropicProvider(options?: ResolveAnthropicProviderOptions): ResolvedProvider;
```

- API key: `options.apiKey` if set, else `process.env.ANTHROPIC_API_KEY`. If neither, throw `MissingApiKeyError` (a named error with a clear remediation message naming the env var).
- Model: `options.model` if set, else `process.env.ASYNCS_MODEL`, else `DEFAULT_REVIEW_MODEL` (a constant set to a current Claude model id).
- Builds the client via `createAnthropicProviderClient({ apiKey, ...(maxTokens === undefined ? {} : { maxTokens }) })` and returns `{ provider, model }`.
- Synchronous: `createAnthropicProviderClient` does no I/O (it constructs the SDK client; no network call happens until the pipeline runs).

### `apps/action/src/runner.ts`

```ts
export type ReviewDiffOptions = {
  request: ReviewRequest;
  diff: LocalDiffMode;            // workingTree | staged | commitRange (from @asyncs/diff)
  provider: ProviderClient;
  model: string;
  cwd?: string;
  repository?: string;
  loadDiff?: typeof loadLocalDiff; // injectable test seam; default loadLocalDiff
} & RobustnessOptions;            // timeoutMs?, retryPolicy?, concurrency?, logger?

export type ReviewRunResult = {
  result: ReviewPipelineResult;   // { plan, report, markdown, failures }
  diff: LocalDiffResult;          // { baseRef, headRef, files, skippedBinaries }
};

export async function reviewDiff(options: ReviewDiffOptions): Promise<ReviewRunResult>;
```

- Loads the diff: `const diff = await (options.loadDiff ?? loadLocalDiff)({ mode: options.diff, ...(options.cwd === undefined ? {} : { cwd: options.cwd }) })`.
- Runs the pipeline: `const result = await runReviewPipeline({ request, files: diff.files, provider, model, ...(repository === undefined ? {} : { repository }), ...sharedRobustness })`, using the same conditional-spread idiom slice 4 established (required by `exactOptionalPropertyTypes`).
- Returns `{ result, diff }` so callers can surface base/head refs and skipped binaries alongside the markdown.

### `apps/action/src/smoke.ts`

A dev/debug entry (NOT the CLI product). Run via a `package.json` script (e.g. `bun run smoke` in the app, wired so it can be invoked from the repo root). It:

- resolves the provider from env (`resolveAnthropicProvider()`),
- picks a diff mode — default `{ kind: "workingTree" }`; accepts a minimal argv override for `{ kind: "commitRange", from, to }` so a real PR-style range can be smoke-tested,
- builds a `ReviewRequest` from defaults (mode `"low-noise"`, `agents: []`, `postComments: false`, `dryRun: false`),
- calls `reviewDiff`, prints a one-line header (`<baseRef>..<headRef>, N binaries skipped`) then `result.markdown` to stdout,
- on any thrown error prints to stderr and exits non-zero.

### `apps/action/src/index.ts`, `types.ts`, `constants.ts`

`index.ts` re-exports the public surface (`reviewDiff`, `resolveAnthropicProvider`, types). `types.ts` holds `ReviewDiffOptions`, `ReviewRunResult`, `ResolveAnthropicProviderOptions`, `ResolvedProvider`. `constants.ts` holds `DEFAULT_REVIEW_MODEL`, the default `maxTokens`, and the `MissingApiKeyError` message. Types-only re-export via `export type * from "./types"`.

## Decisions

### 1. Provider is injected into `reviewDiff`; env→provider lives in `provider.ts`

`reviewDiff` takes an already-built `provider` rather than reading env and constructing Anthropic itself. This keeps the runner provider-agnostic and unit-testable with a fake `ProviderClient` (no network), and isolates the single vendor-specific line in `provider.ts`. The smoke entry (and Slice 6's Action) call `resolveAnthropicProvider()` then `reviewDiff(...)`.

### 2. `reviewDiff` owns diff-loading; `loadDiff` is an injectable seam

The runner's value over `runReviewPipeline` is turning a `LocalDiffMode` into `files`. It accepts the full `LocalDiffMode` union (working tree / staged / commit range) — free, since `loadLocalDiff` already does — so local smoke runs can use `workingTree` while Slice 6 uses `commitRange { from: baseSha, to: headSha }`. `loadDiff` defaults to `loadLocalDiff` and is overridable in tests so the suite needs no real git repo.

### 3. Errors propagate; the smoke entry is the only thing that exits

`reviewDiff` and `resolveAnthropicProvider` throw on failure (missing key, bad refs, coordinator `RetryExhaustedError`) and never swallow. Only `smoke.ts` converts thrown errors into a non-zero exit. Slice 6 will decide its own fail-soft-vs-fail-hard behavior.

### 4. Single `model` string, default via constant, overridable

One `model` flows to coordinator and specialists (slice 4's contract). `DEFAULT_REVIEW_MODEL` is a named constant set to a current Claude model id, overridable via `resolveAnthropicProvider({ model })` or `ASYNCS_MODEL`. No coordinator/specialist split.

### 5. Return `{ result, diff }`, not a flattened shape

Keeping the `ReviewPipelineResult` and the `LocalDiffResult` as distinct fields avoids merging two unrelated shapes and lets Slice 6 report diff metadata (base/head, skipped binaries) next to the review without re-loading.

## Behavior & edge cases

- **Missing API key:** `resolveAnthropicProvider` throws `MissingApiKeyError` before any provider is built.
- **Empty diff (no changed files):** `loadLocalDiff` returns `files: []`; `runReviewPipeline` short-circuits (no provider call, "nothing to review" markdown); `reviewDiff` returns normally with that markdown and `diff.files === []`.
- **Diff/git failure** (not a git repo, invalid `from`/`to` refs): propagates from `loadLocalDiff`.
- **Coordinator fails after retries:** `RetryExhaustedError` propagates out of `reviewDiff` — there is no review without a plan.
- **Some/all specialists fail:** handled inside `runReviewPipeline` (surviving findings + failures section); `reviewDiff` returns the result unchanged.
- **Binary files:** `loadLocalDiff` already partitions them into `skippedBinaries`; the smoke header surfaces the count.

## Testing

`bun:test` in `apps/action/test/`. No network, no real git — inject a fake `loadDiff` and a fake `ProviderClient` (keyed by `schemaName`, the slice-4 pattern).

1. **`reviewDiff` happy path:** fake `loadDiff` returns a canned `LocalDiffResult` (one `ChangedFile`); fake coordinator assigns specialists; fake specialists return findings → assert `loadDiff` was called with the supplied `diff` mode and `cwd`, the pipeline ran (`result.plan.routeSource === "coordinator"`, `result.markdown` contains the surviving finding), and the return is `{ result, diff }` with the diff passed through.
2. **`reviewDiff` empty diff:** fake `loadDiff` returns `files: []` → the fake provider is never called, and `result.markdown` is the empty-review message.
3. **`resolveAnthropicProvider`:** with no `apiKey` option and `ANTHROPIC_API_KEY` unset → throws `MissingApiKeyError`; with an `apiKey` option → returns `{ provider, model }` where `provider.kind === "anthropic"` and `model === DEFAULT_REVIEW_MODEL`; a `model` option/`ASYNCS_MODEL` override is respected.

The live `smoke` run is manual/opt-in (requires a real key and spends tokens) and is not part of the suite; it is the slice's acceptance check that the real-model path works end to end.

## Roadmap fit

Unblocks slice 6 (GitHub Action), which imports `resolveAnthropicProvider` + `reviewDiff` from `@asyncs/action`, adds `action.yml`, parses the PR event for `{ prNumber, repository, baseSha, headSha }`, calls `reviewDiff({ diff: { kind: "commitRange", from: baseSha, to: headSha }, ... })`, and posts `result.markdown` as one summary PR comment via octokit — then bundles the app and adds a dogfood workflow. Those details are deferred to slice 6's own spec.
