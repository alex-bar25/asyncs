# GitHub Action — Design Spec

**Date:** 2026-05-29
**Status:** Drafted, pending Alex review
**Branch:** `feat/github-action`

## Goal

Land the product goal — "open a PR → asyncs reviews it." Wrap the slice-5 runner (`reviewDiff` + `resolveAnthropicProvider` in `apps/action`) as a real GitHub Action: parse the pull-request event, run a live review over the PR's diff, and post one summary comment back on the PR. Ship it as a composite action that runs from source via Bun (no bundler) plus a dogfood workflow that runs it on asyncs's own PRs.

This is the second of the two Action slices:

- **Slice 5 (shipped):** the surface-agnostic live runner (`reviewDiff`).
- **Slice 6 (this spec):** the GitHub layer — event parsing, octokit comment posting, the composite `action.yml`, and the dogfood workflow. The product goal lands here.

The only new code is a thin GitHub layer in `apps/action/src`; the runner is reused untouched.

## Non-goals (explicitly out of scope)

- **Bundler / `dist` / marketplace distribution.** The action runs from source via Bun. A bundled `node20` action for external repos that can't run from source is a later slice.
- **`mode` / `agents` action inputs.** v1 reviews with defaults (coordinator-driven, `low-noise`). These inputs come later.
- **Inline per-line review comments.** One summary comment only.
- **Triggers other than `pull_request`** (push, issue_comment, manual dispatch).
- **A `packages/github` package.** The GitHub layer lives in `apps/action`, consistent with the slice-5 decision to keep the runner there. Extraction is deferred until a second consumer needs it.
- **Re-review throttling, cost caps, partial-diff chunking** for very large PRs.

## Architecture

```txt
pull_request event
        ↓
readPullRequestEvent(env)        ← GITHUB_EVENT_PATH / GITHUB_REPOSITORY / GITHUB_EVENT_NAME
        ↓  { owner, repo, prNumber, baseSha, headSha }
runReviewAction({ event, review, client, ... })
        ↓
  reviewDiff({ request, diff: { kind: "commitRange", from: baseSha, to: headSha }, provider, model, repository })   (reused, slice 5)
        ↓  { result, diff }
  buildReviewBody(marker + "base..head" header + result.markdown)
        ↓
  upsertReviewComment({ client, owner, repo, prNumber, body })   ← list → find marker → update or create
        ↓
  one summary PR comment
```

Packaging: `apps/action/action.yml` (composite) sets up Bun, installs the workspace, and runs `action-entry.ts` with inputs mapped to env. `.github/workflows/asyncs-review.yml` runs that action on asyncs's own PRs.

## Components (`apps/action/src/`)

### `event.ts`

```ts
export type PullRequestEvent = {
  owner: string;
  repo: string;
  prNumber: number;
  baseSha: string;
  headSha: string;
};

export function parsePullRequestEvent(input: {
  eventName: string;
  repository: string;          // "owner/repo" from GITHUB_REPOSITORY
  payload: unknown;            // parsed event JSON
}): PullRequestEvent;

export function readPullRequestEvent(env: Record<string, string | undefined>): PullRequestEvent;
```

`parsePullRequestEvent` is pure and zod-validated: it asserts `eventName === "pull_request"`, splits `repository` into `owner`/`repo`, and extracts `number`, `pull_request.base.sha`, `pull_request.head.sha` via a zod schema (no `as`). It throws a clear error if the event is not a pull request or required fields are missing. `readPullRequestEvent` reads `GITHUB_EVENT_NAME`, `GITHUB_REPOSITORY`, and the JSON at `GITHUB_EVENT_PATH`, then delegates to `parsePullRequestEvent`.

### `github.ts`

```ts
export type ReviewCommentClient = {
  listComments(input: { owner: string; repo: string; prNumber: number }): Promise<readonly { id: number; body: string }[]>;
  createComment(input: { owner: string; repo: string; prNumber: number; body: string }): Promise<void>;
  updateComment(input: { owner: string; repo: string; commentId: number; body: string }): Promise<void>;
};

export function createReviewCommentClient(token: string): ReviewCommentClient;
```

The only file that imports octokit. `createReviewCommentClient` adapts the real octokit issue-comment endpoints to the narrow `ReviewCommentClient` seam. The seam keeps `comment.ts` and `action.ts` testable without octokit or the network — the same gateway pattern used for the Anthropic SDK.

### `comment.ts`

```ts
export const REVIEW_COMMENT_MARKER = "<!-- asyncs-review -->";

export function buildReviewBody(input: { header: string; markdown: string }): string;   // marker + header + markdown

export async function upsertReviewComment(input: {
  client: ReviewCommentClient;
  owner: string;
  repo: string;
  prNumber: number;
  body: string;                 // already includes the marker
}): Promise<void>;
```

`upsertReviewComment` lists the PR's comments, finds the first whose body contains `REVIEW_COMMENT_MARKER`, and updates it; if none exists it creates one. This guarantees exactly one asyncs comment per PR, refreshed on each push.

### `action.ts`

```ts
export type RunReviewActionDeps = {
  event: PullRequestEvent;
  review: (event: PullRequestEvent) => Promise<ReviewRunResult>;   // wraps reviewDiff
  client: ReviewCommentClient;
};

export type ReviewActionOutcome = { ok: boolean };

export async function runReviewAction(deps: RunReviewActionDeps): Promise<ReviewActionOutcome>;
```

Orchestration with injected seams. It calls `review(event)`; on success it builds the body from `result.markdown` (plus a `base..head, N binaries skipped` header) and upserts it, returning `{ ok: true }`. On a review error it upserts a failure body (marker + `asyncs review failed: <reason>`) and returns `{ ok: false }` — it always leaves exactly one comment. It does not read env, construct a provider, or touch octokit directly; those are wired by the entry.

### `action-entry.ts`

Thin entry (`import.meta.main`), not unit-tested (like slice-5's `smoke.ts`). It reads the env, builds the real dependencies — `readPullRequestEvent(process.env)`, a `review` closure over `reviewDiff` + `resolveAnthropicProvider`, and `createReviewCommentClient(githubToken)` — calls `runReviewAction`, and exits `0` when `ok` and `1` otherwise. Setup failures before the event/token are known (not a pull-request event, missing token) are logged and exit non-zero without a comment.

## Config

### `apps/action/action.yml` (composite)

Inputs:
- `anthropic-api-key` — required.
- `github-token` — default `${{ github.token }}`.
- `model` — optional (falls back to `ASYNCS_MODEL` / `DEFAULT_REVIEW_MODEL`).

`runs.using: "composite"` with steps: set up Bun → `bun install` at the workspace root → run `action-entry.ts`, mapping `anthropic-api-key` → `ANTHROPIC_API_KEY`, `github-token` → `GITHUB_TOKEN`, `model` → `ASYNCS_MODEL` in the step env so the existing `resolveAnthropicProvider` reads them unchanged.

### `.github/workflows/asyncs-review.yml` (dogfood)

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
permissions:
  contents: read
  pull-requests: write
```

Job: `actions/checkout` with `fetch-depth: 0` (so both `baseSha` and `headSha` are present locally for `git diff base..head`), then `uses: ./apps/action` with `anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}`.

## Decisions

### 1. Composite action, run from source via Bun (no bundler)

A JS action normally needs a single bundled `dist/index.js` because a consumer's runner lacks the workspace's `node_modules`. v1 instead runs from source: the composite action sets up Bun, installs the workspace, and runs the TypeScript entry directly. This avoids introducing the repo's first bundler and keeps everything in Bun/TS. The per-run setup+install cost is negligible next to the LLM calls. A bundled, marketplace-ready action is a later slice.

### 2. Diff via `commitRange` over the checked-out repo — no GitHub diff API

The review diff comes from `reviewDiff({ diff: { kind: "commitRange", from: baseSha, to: headSha } })`, reusing `@asyncs/diff` (simple-git) against the repo `actions/checkout` already placed on disk. The PR event payload supplies the SHAs; `fetch-depth: 0` guarantees both are present. No octokit call is needed to fetch changed files — octokit is used only for the comment.

### 3. One upserted comment, found by a hidden marker

`REVIEW_COMMENT_MARKER` embedded in the body lets the action find and update its prior comment instead of posting a new one each push. Exactly one asyncs comment per PR.

### 4. octokit isolated behind a narrow seam

octokit is imported only in `github.ts`, which adapts it to `ReviewCommentClient`. `comment.ts`/`action.ts` depend on the seam, so they are unit-tested with a fake client — no network, consistent with the repo's vendor-isolation and gateway conventions.

### 5. Fail the run on genuine errors; always leave one comment

A real failure (missing key, coordinator `RetryExhaustedError`, malformed/non-PR event) exits non-zero so the run shows red in Checks; whether that blocks merges is the consumer's choice (a required check). On review failure the action still posts a failure comment so the cause is visible on the PR. An empty diff or zero findings is not a failure — it posts the normal "nothing to review" / "no findings" comment and exits `0`.

## Behavior & edge cases

- **Not a `pull_request` event / missing `GITHUB_REPOSITORY` or SHAs:** `parsePullRequestEvent` throws; the entry logs and exits non-zero without a comment (no PR to comment on).
- **Missing `anthropic-api-key`:** `resolveAnthropicProvider` throws `MissingApiKeyError`; the action posts a failure comment and exits non-zero.
- **Empty diff:** `reviewDiff` short-circuits (no model call); the action posts the "nothing to review" markdown and exits `0`.
- **Coordinator fails after retries:** `RetryExhaustedError` propagates into `runReviewAction`, which posts a failure comment and returns `{ ok: false }` → exit non-zero.
- **Re-run on a new push:** the marker upsert updates the existing comment in place rather than adding a new one.
- **Binary-only diff:** surfaced as `skippedBinaries` in the comment header; if no reviewable files remain, the empty-diff path applies.

## Testing

`bun:test` in `apps/action/test/`. No network, no real git — inject a fake `ReviewCommentClient` and a fake `review` function.

1. **`parsePullRequestEvent`:** a valid `pull_request` payload yields `{ owner, repo, prNumber, baseSha, headSha }`; a non-`pull_request` event name throws; a payload missing `pull_request.head.sha` throws.
2. **`upsertReviewComment`:** with a fake client returning no marked comment → `createComment` is called with a body containing the marker; with a fake client returning a comment whose body contains the marker → `updateComment` is called with that comment's id (not create).
3. **`runReviewAction`:** injected fake `review` returning a canned `{ result, diff }` → posts a body containing `result.markdown`, returns `{ ok: true }`; injected `review` that throws → posts a failure body (marker + reason) and returns `{ ok: false }`.

The composite `action.yml` and the dogfood workflow are validated by an actual PR run (manual acceptance), not unit tests.

## Roadmap fit

Completes the product goal: a PR on asyncs triggers a live review comment. Follow-on slices can add the bundled/marketplace-distributable action, `mode`/`agents` inputs, inline comments, and broader triggers — each on top of this GitHub layer.
