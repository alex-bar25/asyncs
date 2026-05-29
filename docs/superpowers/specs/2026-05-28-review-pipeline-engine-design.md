# Review Pipeline Engine — Design Spec

**Date:** 2026-05-28
**Status:** Drafted, pending Alex review
**Branch:** `feat/review-pipeline-engine`

## Goal

Compose the real end-to-end review pipeline as a single function, `runReviewPipeline`, in `@asyncs/orchestration`. Today the only thing chaining the stages together is the canned `runPreviewReviewPipeline` in `preview.ts`, which fabricates deterministic findings — asyncs cannot yet produce a real review from a real provider. After this slice, one call takes a set of changed files plus a provider and returns a formatted review (coordinator → specialists → consensus → markdown), with partial failures surfaced explicitly rather than dropped.

This is the first of three slices toward the product goal "open a PR → asyncs reviews it":

- **Slice 4 (this spec):** the surface-agnostic engine. No surface, no live wiring.
- **Slice 5:** CLI `review --local` — wire env key → Anthropic provider → `loadLocalDiff` → `runReviewPipeline` → stdout. First live end-to-end.
- **Slice 6:** GitHub Action — diff from the PR event → `runReviewPipeline` → one summary PR comment. The product goal lands here.

Everything the engine needs already exists, so this slice is composition + types + tests. It reuses `buildCoordinatorAgentInput`, `createCoordinatedReviewRunPlan`, `executeSpecialistAssignments`, `createConsensusReport`, and `formatReviewReportMarkdown` untouched.

## Non-goals (explicitly out of scope)

- Any surface: CLI command, GitHub Action, comment posting. Slices 5–6.
- Live provider construction / reading `ANTHROPIC_API_KEY`. The engine takes an injected `ProviderClient`; tests pass a fake. Slice 5 constructs the real Anthropic client.
- A no-LLM routed path (explicit `agents` skipping the coordinator). v1 is always coordinator-driven; see Decision 1.
- Separate models for coordinator vs specialists. Single `model` for v1; see Decision 2.
- Richer repository context (manifests, config summary) for the coordinator. `manifests` stays `{}`; `repository` is an optional pass-through.
- External cancellation (`AbortSignal` from callers). Internal timeout abort already exists from the robustness slice.

## Architecture

```txt
runReviewPipeline({ request, files, provider, model, repository?, ...robustness })
        ↓
  files empty? → short-circuit: routed plan + empty report + "nothing to review" markdown (no LLM calls)
        ↓
  buildCoordinatorAgentInput({ files, availableAgents?, repository })   (reused)
        ↓
  createCoordinatedReviewRunPlan(...)     ← coordinator LLM call (retry + timeout)
        ↓  plan (with coordinatorOutput.assignments)
  executeSpecialistAssignments(...)       ← parallel specialists (p-queue, retry, timeout)
        ↓  { runs, findings, failures }
  createConsensusReport({ findings })     ← dedup / noise filter / sort
        ↓  report
  formatReviewReportMarkdown({ report, title, failures })
        ↓
  { plan, report, markdown, failures }
```

## Interface

New in `@asyncs/orchestration`, exported from `index.ts`:

```ts
export type RunReviewPipelineOptions = {
  request: ReviewRequest;
  files: readonly ChangedFile[];
  provider: ProviderClient;
  model: string;
  repository?: string;
} & RobustnessOptions; // timeoutMs?, retryPolicy?, concurrency?, logger?

export type ReviewPipelineResult = {
  plan: ReviewRunPlan;
  report: ConsensusReport;
  markdown: string;
  failures: SpecialistFailure[];
};

export async function runReviewPipeline(
  options: RunReviewPipelineOptions,
): Promise<ReviewPipelineResult>;
```

The markdown title is a hardcoded constant (`"asyncs review"`) in v1 — not worth an input yet. No other package changes: the reused stages are called as-is.

## Decisions

### 1. Always coordinator-driven; `request.agents` constrains `availableAgents`

`executeSpecialistAssignments` runs only the agents present in `plan.coordinatorOutput.assignments` (`selectEligibleAssignments` in `pipeline.ts`). The pure-routing path (`createReviewRunPlan`) yields `plan.agents` but no assignments, so it would run zero specialists. v1 therefore always runs the coordinator for any non-empty diff (the empty-files case short-circuits before the coordinator — see Behavior). When `request.agents` is non-empty, those kinds are passed as the coordinator's `availableAgents`, so `--agents` still narrows the swarm while the coordinator continues to assign files and focus areas.

Trade-off: a coordinator LLM call happens even when agents are explicit. Acceptable for v1. A no-LLM routed path (synthesizing assignments from `plan.agents`) is deferred until there's a reason to save the call.

### 2. Single `model` for coordinator and specialists

One `model` string is used for the coordinator call and every specialist call. Splitting into `coordinatorModel` / `specialistModel` is deferred until cost data justifies it.

### 3. Result shape `{ plan, report, markdown, failures }`

`failures` is included so surfaces can decide how to present partial reviews; it is also passed to the formatter for the "Specialists that failed" section. `files` is not echoed back — the caller already owns them.

## Behavior & edge cases

- **Empty `files`:** short-circuit before any LLM call. Build a structurally valid plan via `createReviewRunPlan({ request })` (pure, no coordinator), and return an empty `ConsensusReport`, `"nothing to review"` markdown, and `failures: []`. The provider is never touched.
- **Coordinator returns zero assignments:** no specialists run; `findings` empty; the report renders "no findings"; markdown is still produced.
- **Some specialists fail:** `executeSpecialistAssignments` partitions them into `failures`; the review still returns with surviving findings plus the failures section.
- **Coordinator fails after retries:** `createCoordinatedReviewRunPlan` throws `RetryExhaustedError`; `runReviewPipeline` lets it propagate — there is no review without a plan. Surfaces (slices 5–6) decide fail-soft vs fail-hard.

## Testing

`bun:test` in `packages/orchestration/test/`. Inject a fake `ProviderClient` (no network) that returns canned objects keyed by `schemaName` (coordinator schema vs specialist schema) and captures every request it receives.

1. **Coordinator-driven happy path:** fake coordinator assigns two agents → fake specialists return findings → consensus dedups duplicates → `markdown` contains the surviving findings and `plan.routeSource === "coordinator"`.
2. **`agents` constrains `availableAgents`:** `request.agents = ["security"]` → assert the captured coordinator-call messages reflect only `security` in the available-agent set (the engine maps `request.agents` into the coordinator input; the assertion inspects the rendered coordinator prompt the fake received).
3. **All specialists fail:** fake provider throws on specialist calls → `failures.length` equals the assignment count, `findings` is empty, `markdown` includes the failures section, and the call does not throw.
4. **Empty files:** `files: []` → returns immediately and the fake provider is never called.

Tests assert the contract (composition, partitioning, short-circuit), not the internals of the reused stages.

## Roadmap fit

Unblocks slice 5 (CLI `review --local`) and slice 6 (GitHub Action), both of which call `runReviewPipeline` with a real Anthropic provider. The detailed Action design — summary-comment-first, diff from the PR event via `loadLocalDiff`, `ncc` bundling, dogfood workflow — is deferred to slice 6's own spec.
