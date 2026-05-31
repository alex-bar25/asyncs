# GitHub Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the slice-5 runner as a composite GitHub Action that reviews a PR's diff with a live provider and posts one upserted summary comment, plus a dogfood workflow that runs it on asyncs's own PRs.

**Architecture:** A thin GitHub layer added to `apps/action/src` — parse the `pull_request` event → call the reused `reviewDiff` over `commitRange(baseSha, headSha)` → post one marker-upserted comment via an octokit seam. octokit is isolated to `github.ts`; the orchestration (`runReviewAction`) takes injected seams so it is unit-tested with no network/git. Packaging is a composite `action.yml` (Bun source-run, no bundler) and a `.github/workflows` dogfood file.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Bun, zod v4 (event schema), `@octokit/rest` (comment posting). Reuses `@asyncs/diff`, `@asyncs/orchestration`, `@asyncs/providers`, and the slice-5 `reviewDiff` / `resolveAnthropicProvider` untouched.

---

## File Structure

All new TypeScript lives in the existing `apps/action` app (no `packages/github`).

- **Modify `apps/action/package.json`** — add `@octokit/rest` and `zod` dependencies.
- **Modify `apps/action/src/constants.ts`** — add `REVIEW_COMMENT_MARKER`.
- **Modify `apps/action/src/types.ts`** — add `PullRequestEvent`, `ReviewComment`, `ReviewCommentClient`, `RunReviewActionDeps`, `ReviewActionOutcome`.
- **Create `apps/action/src/event.ts`** — `parsePullRequestEvent` (zod, pure) + `readPullRequestEvent` (async, reads the event file).
- **Create `apps/action/src/comment.ts`** — `buildReviewBody` + `upsertReviewComment` (find-by-marker → update/create).
- **Create `apps/action/src/action.ts`** — `runReviewAction` orchestration over injected seams.
- **Create `apps/action/src/github.ts`** — `createReviewCommentClient` (the only octokit-importing file).
- **Create `apps/action/src/action-entry.ts`** — thin entry (`import.meta.main`), not unit-tested.
- **Create `apps/action/action.yml`** — composite action.
- **Create `.github/workflows/asyncs-review.yml`** — dogfood workflow.
- **Create tests** — `apps/action/test/{event,comment,action}.test.ts`.

`index.ts` needs no change: it already does `export type * from "./types"` (so the new types are re-exported) and `export * from "./constants"`. The GitHub functions and the entry stay internal (consumed by `action-entry.ts` and tests via relative imports), mirroring how `smoke.ts` is not exported.

**Contract facts the code relies on (verified against current code):**
- `reviewDiff(options): Promise<ReviewRunResult>` where `ReviewRunResult = { result: ReviewPipelineResult; diff: LocalDiffResult }` (`apps/action/src/runner.ts`, `types.ts`). `ReviewPipelineResult = { plan; report; markdown; failures }`; `LocalDiffResult = { baseRef; headRef; files; skippedBinaries }`.
- `resolveAnthropicProvider(options?): { provider; model }` reads `ANTHROPIC_API_KEY` / `ASYNCS_MODEL`, throws `MissingApiKeyError` if no key (`apps/action/src/provider.ts`). It reads `process.env.ASYNCS_MODEL` internally and combines with `??`, so an **empty-string** `ASYNCS_MODEL` would defeat the default — the entry must avoid setting it to `""` (see Task 6).
- zod v4 (`^4.4.3`) is imported `import { z } from "zod"`; `Schema.parse(value)` returns the narrowed type and throws `ZodError` on mismatch (`packages/agents/src/schemas.ts`). No `as` needed.
- `DEFAULT_REVIEW_REQUEST_OPTIONS = { mode: "low-noise"; agents: []; postComments: false; dryRun: false }` from `@asyncs/core`.
- `@octokit/rest` exposes `octokit.rest.issues.listComments/createComment/updateComment`; list items are `{ id: number; body?: string; ... }`.
- Root `tsconfig.json` globs `apps/**/*.ts`; `bun test` auto-discovers `apps/action/test/*.test.ts`; `skipLibCheck: true` keeps octokit's own d.ts out of typecheck.

---

### Task 1: Scaffold — dependencies, marker, and types

Add the two new dependencies and the shared constant/types the rest of the slice builds on. Verified by typecheck (no behavior yet).

**Files:**
- Modify: `apps/action/package.json`
- Modify: `apps/action/src/constants.ts`
- Modify: `apps/action/src/types.ts`

- [ ] **Step 1: Add the dependencies**

From the repo root:

```bash
cd apps/action && bun add @octokit/rest zod@^4.4.3 && cd ../..
```

This adds both to `apps/action/package.json` `dependencies` and updates the lockfile.

- [ ] **Step 2: Add the comment marker to `apps/action/src/constants.ts`**

Append:

```ts
export const REVIEW_COMMENT_MARKER = "<!-- asyncs-review -->";
```

- [ ] **Step 3: Add the new types to `apps/action/src/types.ts`**

Append (the file already imports/defines `ReviewRunResult`):

```ts
export type PullRequestEvent = {
  owner: string;
  repo: string;
  prNumber: number;
  baseSha: string;
  headSha: string;
};

export type ReviewComment = {
  id: number;
  body: string;
};

export type ReviewCommentClient = {
  listComments(input: { owner: string; repo: string; prNumber: number }): Promise<readonly ReviewComment[]>;
  createComment(input: { owner: string; repo: string; prNumber: number; body: string }): Promise<void>;
  updateComment(input: { owner: string; repo: string; commentId: number; body: string }): Promise<void>;
};

export type RunReviewActionDeps = {
  event: PullRequestEvent;
  review: (event: PullRequestEvent) => Promise<ReviewRunResult>;
  client: ReviewCommentClient;
};

export type ReviewActionOutcome = {
  ok: boolean;
};
```

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: PASS — `tsc --noEmit` clean (new types compile; `@octokit/rest`/`zod` resolve).

- [ ] **Step 5: Commit**

```bash
git add apps/action/package.json apps/action/src/constants.ts apps/action/src/types.ts bun.lock
git commit -m "$(cat <<'EOF'
feat(action): add octokit/zod deps, comment marker, and GitHub layer types

Scaffolds slice 6: @octokit/rest + zod dependencies, REVIEW_COMMENT_MARKER,
and the PullRequestEvent / ReviewCommentClient / RunReviewActionDeps types
the event parser, comment poster, and orchestration build on.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `event.ts` — parse the pull-request event

Parse and validate the GitHub event. `parsePullRequestEvent` is pure and zod-validated (unit-tested); `readPullRequestEvent` is the async file-reading wrapper (verified by typecheck + the dogfood run).

**Files:**
- Test: `apps/action/test/event.test.ts`
- Create: `apps/action/src/event.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/action/test/event.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { parsePullRequestEvent } from "../src/event";

const validPayload = {
  number: 7,
  pull_request: {
    base: { sha: "base-sha" },
    head: { sha: "head-sha" },
  },
};

describe("parsePullRequestEvent", () => {
  test("extracts owner, repo, prNumber, and SHAs from a pull_request event", () => {
    const event = parsePullRequestEvent({
      eventName: "pull_request",
      repository: "alex-bar25/asyncs",
      payload: validPayload,
    });

    expect(event).toEqual({
      owner: "alex-bar25",
      repo: "asyncs",
      prNumber: 7,
      baseSha: "base-sha",
      headSha: "head-sha",
    });
  });

  test("throws when the event is not a pull_request", () => {
    expect(() =>
      parsePullRequestEvent({ eventName: "push", repository: "alex-bar25/asyncs", payload: validPayload }),
    ).toThrow();
  });

  test("throws when the payload is missing the head SHA", () => {
    expect(() =>
      parsePullRequestEvent({
        eventName: "pull_request",
        repository: "alex-bar25/asyncs",
        payload: { number: 7, pull_request: { base: { sha: "base-sha" } } },
      }),
    ).toThrow();
  });

  test("throws when GITHUB_REPOSITORY is malformed", () => {
    expect(() =>
      parsePullRequestEvent({ eventName: "pull_request", repository: "no-slash", payload: validPayload }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/action/test/event.test.ts`
Expected: FAIL — cannot resolve `../src/event`.

- [ ] **Step 3: Create `apps/action/src/event.ts`**

```ts
import { z } from "zod";
import type { PullRequestEvent } from "./types";

const PullRequestPayloadSchema = z.object({
  number: z.number().int().positive(),
  pull_request: z.object({
    base: z.object({ sha: z.string().min(1) }),
    head: z.object({ sha: z.string().min(1) }),
  }),
});

export function parsePullRequestEvent(input: {
  eventName: string;
  repository: string;
  payload: unknown;
}): PullRequestEvent {
  if (input.eventName !== "pull_request") {
    throw new Error(`asyncs review expects a pull_request event, received: ${input.eventName}`);
  }

  const [owner, repo] = input.repository.split("/");

  if (owner === undefined || owner.length === 0 || repo === undefined || repo.length === 0) {
    throw new Error(`Invalid GITHUB_REPOSITORY: ${input.repository}`);
  }

  const payload = PullRequestPayloadSchema.parse(input.payload);

  return {
    owner,
    repo,
    prNumber: payload.number,
    baseSha: payload.pull_request.base.sha,
    headSha: payload.pull_request.head.sha,
  };
}

export async function readPullRequestEvent(env: Record<string, string | undefined>): Promise<PullRequestEvent> {
  const eventPath = env.GITHUB_EVENT_PATH;

  if (eventPath === undefined || eventPath.length === 0) {
    throw new Error("GITHUB_EVENT_PATH is not set.");
  }

  const payload: unknown = await Bun.file(eventPath).json();

  return parsePullRequestEvent({
    eventName: env.GITHUB_EVENT_NAME ?? "",
    repository: env.GITHUB_REPOSITORY ?? "",
    payload,
  });
}
```

Note: `readPullRequestEvent` is async (uses `Bun.file().json()`, not sync `fs`) per the repo's async-everywhere rule. No `as` casts — zod's `.parse` returns the narrowed type, and the `owner`/`repo` split is guarded for `noUncheckedIndexedAccess`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test apps/action/test/event.test.ts`
Expected: PASS — 4 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add apps/action/src/event.ts apps/action/test/event.test.ts
git commit -m "$(cat <<'EOF'
feat(action): parse the pull_request event

parsePullRequestEvent (zod-validated, pure) extracts owner/repo/prNumber
and base/head SHAs; readPullRequestEvent reads GITHUB_EVENT_PATH and
delegates. Throws on non-PR events or malformed payloads.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `comment.ts` — build the body and upsert one comment

Find the prior asyncs comment by marker and update it, else create a new one.

**Files:**
- Test: `apps/action/test/comment.test.ts`
- Create: `apps/action/src/comment.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/action/test/comment.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { REVIEW_COMMENT_MARKER } from "../src/constants";
import { buildReviewBody, upsertReviewComment } from "../src/comment";
import type { ReviewComment, ReviewCommentClient } from "../src/types";

type CreateCall = { owner: string; repo: string; prNumber: number; body: string };
type UpdateCall = { owner: string; repo: string; commentId: number; body: string };

function createFakeClient(existing: readonly ReviewComment[]) {
  const created: CreateCall[] = [];
  const updated: UpdateCall[] = [];

  const client: ReviewCommentClient = {
    async listComments() {
      return existing;
    },
    async createComment(input) {
      created.push(input);
    },
    async updateComment(input) {
      updated.push(input);
    },
  };

  return { client, created, updated };
}

describe("buildReviewBody", () => {
  test("prefixes the body with the marker", () => {
    const body = buildReviewBody({ header: "main..feature", markdown: "# review" });

    expect(body.startsWith(REVIEW_COMMENT_MARKER)).toBe(true);
    expect(body).toContain("main..feature");
    expect(body).toContain("# review");
  });
});

describe("upsertReviewComment", () => {
  test("creates a new comment when none is marked", async () => {
    const { client, created, updated } = createFakeClient([{ id: 1, body: "unrelated comment" }]);

    await upsertReviewComment({
      client,
      owner: "alex-bar25",
      repo: "asyncs",
      prNumber: 7,
      body: `${REVIEW_COMMENT_MARKER}\n\nreview`,
    });

    expect(created).toHaveLength(1);
    expect(updated).toHaveLength(0);
    expect(created[0]?.body).toContain(REVIEW_COMMENT_MARKER);
  });

  test("updates the existing marked comment", async () => {
    const { client, created, updated } = createFakeClient([
      { id: 1, body: "unrelated" },
      { id: 42, body: `${REVIEW_COMMENT_MARKER}\n\nold review` },
    ]);

    await upsertReviewComment({
      client,
      owner: "alex-bar25",
      repo: "asyncs",
      prNumber: 7,
      body: `${REVIEW_COMMENT_MARKER}\n\nnew review`,
    });

    expect(updated).toHaveLength(1);
    expect(created).toHaveLength(0);
    expect(updated[0]?.commentId).toBe(42);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/action/test/comment.test.ts`
Expected: FAIL — cannot resolve `../src/comment`.

- [ ] **Step 3: Create `apps/action/src/comment.ts`**

```ts
import { REVIEW_COMMENT_MARKER } from "./constants";
import type { ReviewCommentClient } from "./types";

export function buildReviewBody(input: { header: string; markdown: string }): string {
  return `${REVIEW_COMMENT_MARKER}\n\n${input.header}\n\n${input.markdown}`;
}

export async function upsertReviewComment(input: {
  client: ReviewCommentClient;
  owner: string;
  repo: string;
  prNumber: number;
  body: string;
}): Promise<void> {
  const comments = await input.client.listComments({
    owner: input.owner,
    repo: input.repo,
    prNumber: input.prNumber,
  });

  const existing = comments.find((comment) => comment.body.includes(REVIEW_COMMENT_MARKER));

  if (existing === undefined) {
    await input.client.createComment({
      owner: input.owner,
      repo: input.repo,
      prNumber: input.prNumber,
      body: input.body,
    });
    return;
  }

  await input.client.updateComment({
    owner: input.owner,
    repo: input.repo,
    commentId: existing.id,
    body: input.body,
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test apps/action/test/comment.test.ts`
Expected: PASS — 3 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add apps/action/src/comment.ts apps/action/test/comment.test.ts
git commit -m "$(cat <<'EOF'
feat(action): upsert one review comment by marker

buildReviewBody prefixes the hidden marker; upsertReviewComment lists the
PR comments, updates the marked one if present, else creates a new one.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `action.ts` — orchestrate review and comment

Run the review, build the body, and always post one comment — the review on success, a failure notice on error — signaling failure via `{ ok }`.

**Files:**
- Test: `apps/action/test/action.test.ts`
- Create: `apps/action/src/action.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/action/test/action.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { ReviewRequest } from "@asyncs/core";
import { REVIEW_COMMENT_MARKER } from "../src/constants";
import { runReviewAction } from "../src/action";
import type { PullRequestEvent, ReviewComment, ReviewCommentClient, ReviewRunResult } from "../src/types";

const event: PullRequestEvent = {
  owner: "alex-bar25",
  repo: "asyncs",
  prNumber: 7,
  baseSha: "base-sha",
  headSha: "head-sha",
};

const baseRequest: ReviewRequest = {
  prNumber: 7,
  mode: "low-noise",
  agents: [],
  postComments: false,
  dryRun: false,
};

const fakeRun: ReviewRunResult = {
  result: {
    plan: { request: baseRequest, routeSource: "coordinator", agents: [] },
    report: { findings: [], duplicateCount: 0, suppressedCount: 0 },
    markdown: "# asyncs review\n\nRetry path lacks idempotency.",
    failures: [],
  },
  diff: { baseRef: "base-sha", headRef: "head-sha", files: [], skippedBinaries: [] },
};

function createFakeClient(existing: readonly ReviewComment[]) {
  const posted: string[] = [];

  const client: ReviewCommentClient = {
    async listComments() {
      return existing;
    },
    async createComment(input) {
      posted.push(input.body);
    },
    async updateComment(input) {
      posted.push(input.body);
    },
  };

  return { client, posted };
}

describe("runReviewAction", () => {
  test("posts the review markdown and reports ok on success", async () => {
    const { client, posted } = createFakeClient([]);

    const outcome = await runReviewAction({
      event,
      review: async () => fakeRun,
      client,
    });

    expect(outcome.ok).toBe(true);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toContain(REVIEW_COMMENT_MARKER);
    expect(posted[0]).toContain("Retry path lacks idempotency");
  });

  test("posts a failure comment and reports not-ok when the review throws", async () => {
    const { client, posted } = createFakeClient([]);

    const outcome = await runReviewAction({
      event,
      review: async () => {
        throw new Error("provider exploded");
      },
      client,
    });

    expect(outcome.ok).toBe(false);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toContain("asyncs review failed");
    expect(posted[0]).toContain("provider exploded");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/action/test/action.test.ts`
Expected: FAIL — cannot resolve `../src/action`.

- [ ] **Step 3: Create `apps/action/src/action.ts`**

```ts
import { buildReviewBody, upsertReviewComment } from "./comment";
import type { ReviewActionOutcome, RunReviewActionDeps } from "./types";

export async function runReviewAction(deps: RunReviewActionDeps): Promise<ReviewActionOutcome> {
  let body: string;
  let ok: boolean;

  try {
    const run = await deps.review(deps.event);
    const header = `${run.diff.baseRef}..${run.diff.headRef}, ${run.diff.skippedBinaries.length} binaries skipped`;
    body = buildReviewBody({ header, markdown: run.result.markdown });
    ok = true;
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    body = buildReviewBody({ header: "asyncs review failed", markdown: `asyncs review failed: ${reason}` });
    ok = false;
  }

  await upsertReviewComment({
    client: deps.client,
    owner: deps.event.owner,
    repo: deps.event.repo,
    prNumber: deps.event.prNumber,
    body,
  });

  return { ok };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test apps/action/test/action.test.ts`
Expected: PASS — 2 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add apps/action/src/action.ts apps/action/test/action.test.ts
git commit -m "$(cat <<'EOF'
feat(action): orchestrate review and comment posting

runReviewAction runs the injected review, posts the markdown on success or
a failure notice on error, and always leaves exactly one comment, signaling
failure via { ok } for the entry's exit code.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `github.ts` — the octokit comment client

Adapt the real octokit issue-comment endpoints to the `ReviewCommentClient` seam. This is the only file that imports octokit; it is verified by typecheck (the seam is what the unit tests exercise).

**Files:**
- Create: `apps/action/src/github.ts`

- [ ] **Step 1: Create `apps/action/src/github.ts`**

```ts
import { Octokit } from "@octokit/rest";
import type { ReviewCommentClient } from "./types";

export function createReviewCommentClient(token: string): ReviewCommentClient {
  const octokit = new Octokit({ auth: token });

  return {
    async listComments(input) {
      const response = await octokit.rest.issues.listComments({
        owner: input.owner,
        repo: input.repo,
        issue_number: input.prNumber,
        per_page: 100,
      });

      return response.data.map((comment) => ({ id: comment.id, body: comment.body ?? "" }));
    },
    async createComment(input) {
      await octokit.rest.issues.createComment({
        owner: input.owner,
        repo: input.repo,
        issue_number: input.prNumber,
        body: input.body,
      });
    },
    async updateComment(input) {
      await octokit.rest.issues.updateComment({
        owner: input.owner,
        repo: input.repo,
        comment_id: input.commentId,
        body: input.body,
      });
    },
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS — `tsc --noEmit` clean (octokit's parameter names `issue_number`/`comment_id` match; `comment.body` is `string | undefined` so the `?? ""` is required).

- [ ] **Step 3: Commit**

```bash
git add apps/action/src/github.ts
git commit -m "$(cat <<'EOF'
feat(action): octokit-backed review comment client

createReviewCommentClient adapts octokit's issue-comment endpoints to the
narrow ReviewCommentClient seam, isolating the only octokit import.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `action-entry.ts` — the thin entry

Wire the real env into real dependencies and run the action. Not unit-tested (reads env, constructs octokit/provider), like slice-5's `smoke.ts`; verified by typecheck.

**Files:**
- Create: `apps/action/src/action-entry.ts`

- [ ] **Step 1: Create `apps/action/src/action-entry.ts`**

```ts
import { DEFAULT_REVIEW_REQUEST_OPTIONS, type ReviewRequest } from "@asyncs/core";
import { runReviewAction } from "./action";
import { readPullRequestEvent } from "./event";
import { createReviewCommentClient } from "./github";
import { resolveAnthropicProvider } from "./provider";
import { reviewDiff } from "./runner";
import type { PullRequestEvent, ReviewRunResult } from "./types";

export async function runActionEntry(env: Record<string, string | undefined>): Promise<number> {
  const githubToken = env.GITHUB_TOKEN ?? "";

  if (githubToken.length === 0) {
    process.stderr.write("GITHUB_TOKEN is not set.\n");
    return 1;
  }

  let event: PullRequestEvent;

  try {
    event = await readPullRequestEvent(env);
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  const modelInput = env.ASYNCS_MODEL_INPUT;
  const resolveOptions = modelInput !== undefined && modelInput.length > 0 ? { model: modelInput } : {};

  const review = async (pullRequest: PullRequestEvent): Promise<ReviewRunResult> => {
    const { provider, model } = resolveAnthropicProvider(resolveOptions);

    const request: ReviewRequest = {
      prNumber: pullRequest.prNumber,
      mode: DEFAULT_REVIEW_REQUEST_OPTIONS.mode,
      agents: [...DEFAULT_REVIEW_REQUEST_OPTIONS.agents],
      postComments: DEFAULT_REVIEW_REQUEST_OPTIONS.postComments,
      dryRun: DEFAULT_REVIEW_REQUEST_OPTIONS.dryRun,
    };

    return reviewDiff({
      request,
      diff: { kind: "commitRange", from: pullRequest.baseSha, to: pullRequest.headSha },
      provider,
      model,
      repository: `${pullRequest.owner}/${pullRequest.repo}`,
    });
  };

  const client = createReviewCommentClient(githubToken);
  const outcome = await runReviewAction({ event, review, client });

  return outcome.ok ? 0 : 1;
}

if (import.meta.main) {
  const code = await runActionEntry(process.env);
  process.exit(code);
}
```

Note: the model input arrives as `ASYNCS_MODEL_INPUT` (not `ASYNCS_MODEL`) so an empty value never reaches `resolveAnthropicProvider`'s internal `process.env.ASYNCS_MODEL` fallback (an empty string there would defeat the `??` default). The entry normalizes empty → omitted and passes a real model explicitly. Constructing the provider inside the `review` closure means a missing key surfaces as a posted failure comment (caught by `runReviewAction`) rather than an uncommented crash.

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS — `tsc --noEmit` clean (top-level `await` under the `import.meta.main` guard is valid; `process.env` is assignable to `Record<string, string | undefined>`).

- [ ] **Step 3: Commit**

```bash
git add apps/action/src/action-entry.ts
git commit -m "$(cat <<'EOF'
feat(action): wire the action entry point

action-entry resolves the event, provider, and comment client from env and
runs runReviewAction, exiting non-zero on failure. Resolves the provider
inside the review closure so a missing key posts a failure comment.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Composite action and dogfood workflow

Package the entry as a composite action (Bun source-run) and add the workflow that runs it on asyncs's PRs. Validated by an actual PR run (manual acceptance), not unit tests.

**Files:**
- Create: `apps/action/action.yml`
- Create: `.github/workflows/asyncs-review.yml`

- [ ] **Step 1: Create `apps/action/action.yml`**

```yaml
name: "asyncs review"
description: "Run asyncs sub-agent PR review and post a summary comment."
inputs:
  anthropic-api-key:
    description: "Anthropic API key for the review provider."
    required: true
  github-token:
    description: "Token used to post the review comment."
    required: false
    default: ${{ github.token }}
  model:
    description: "Model id override (defaults to the asyncs default)."
    required: false
    default: ""
runs:
  using: "composite"
  steps:
    - name: Set up Bun
      uses: oven-sh/setup-bun@v2
      with:
        bun-version: latest
    - name: Install workspace
      shell: bash
      working-directory: ${{ github.action_path }}/../..
      run: bun install --frozen-lockfile
    - name: Run asyncs review
      shell: bash
      working-directory: ${{ github.action_path }}/../..
      env:
        ANTHROPIC_API_KEY: ${{ inputs.anthropic-api-key }}
        GITHUB_TOKEN: ${{ inputs.github-token }}
        ASYNCS_MODEL_INPUT: ${{ inputs.model }}
      run: bun run apps/action/src/action-entry.ts
```

`${{ github.action_path }}` is `<checkout>/apps/action`; `/../..` is the workspace root where `bun install` and the entry run. The `model` input is passed as `ASYNCS_MODEL_INPUT` (see Task 6).

- [ ] **Step 2: Create `.github/workflows/asyncs-review.yml`**

```yaml
name: asyncs review
on:
  pull_request:
    types: [opened, synchronize, reopened]
permissions:
  contents: read
  pull-requests: write
concurrency:
  group: asyncs-review-${{ github.event.pull_request.number }}
  cancel-in-progress: true
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: asyncs review
        uses: ./apps/action
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

`fetch-depth: 0` makes both base and head SHAs available locally for `git diff base..head`. The workflow needs an `ANTHROPIC_API_KEY` repository secret (a manual prerequisite). Secrets are withheld from fork PRs, so the dogfood covers same-repo branches.

- [ ] **Step 3: Sanity-check the YAML parses (best-effort)**

If your Bun version exposes `Bun.YAML` (1.2+):

Run: `bun -e "for (const p of ['apps/action/action.yml','.github/workflows/asyncs-review.yml']) { Bun.YAML.parse(await Bun.file(p).text()); console.log(p,'ok'); }"`
Expected: prints `apps/action/action.yml ok` and `.github/workflows/asyncs-review.yml ok`.

If `Bun.YAML` is undefined in your version, skip this check — the YAML files are fully validated by the actual PR run (manual acceptance). Do not add a YAML dependency just for this.

- [ ] **Step 4: Commit**

```bash
git add apps/action/action.yml .github/workflows/asyncs-review.yml
git commit -m "$(cat <<'EOF'
feat(action): composite action.yml and dogfood workflow

Composite action sets up Bun, installs the workspace, and runs the entry
from source. The dogfood workflow runs it on asyncs PRs (fetch-depth 0,
pull-requests: write, one review per PR via concurrency).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full check**

Run: `bun run check`
Expected: `tsc --noEmit` clean, `eslint .` clean for the new files, `prettier --check .` clean, and all `bun test` pass (new `event` (4) + `comment` (3) + `action` (2) tests plus the existing suite).

Note: `eslint .` / `prettier --check .` may report pre-existing issues under `.remember/` (a local, gitignored scratch dir unrelated to this slice). Ignore those; the new `apps/action` files must be clean.

- [ ] **Step 2: If `prettier --check` flags our files**

Run `bun run format`, then re-run `bun run check`. If it changed tracked files under `apps/action`, `.github/`, commit them:

```bash
git add apps/action .github
git commit -m "$(cat <<'EOF'
chore(action): apply prettier formatting

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If the files were already clean, skip — do not create an empty commit.

---

## Notes for the implementer

- **Vendor isolation:** octokit is imported only in `github.ts`; `comment.ts`/`action.ts` depend on the `ReviewCommentClient` seam. Do not import `@octokit/rest` elsewhere in `apps/action`.
- **Zero `as` casts:** none are needed. zod `.parse` narrows the event payload; the `owner`/`repo` split is guarded; octokit's `body` is normalized with `?? ""`.
- **async/await everywhere:** `readPullRequestEvent` uses `Bun.file().json()` (no sync `fs`).
- **`exactOptionalPropertyTypes`:** the entry's `resolveOptions` is `{ model }` or `{}` (never `{ model: undefined }`).
- **Do not modify** `runner.ts`, `provider.ts`, `smoke.ts`, or any reused package — slice 6 is pure addition.
- **Model input:** passed as `ASYNCS_MODEL_INPUT` and normalized in the entry so an empty value never defeats `resolveAnthropicProvider`'s `??` default. (`mode`/`agents` inputs remain out of scope.)
- **Dogfood prerequisite:** an `ANTHROPIC_API_KEY` repository secret must exist for the workflow to run; the action.yml + workflow are only fully exercised by an actual PR.
