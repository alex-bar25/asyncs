# Review Pipeline Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `runReviewPipeline` to `@asyncs/orchestration` — one async function that takes changed files plus an injected provider and returns a formatted review (coordinator → specialists → consensus → markdown), surfacing partial failures.

**Architecture:** Pure composition over existing, untouched stages. `runReviewPipeline` builds a coordinator input (`buildCoordinatorAgentInput`), runs the coordinator (`createCoordinatedReviewRunPlan`), runs the assigned specialists in parallel (`executeSpecialistAssignments`), merges findings (`createConsensusReport`), and renders markdown (`formatReviewReportMarkdown`). Empty `files` short-circuits before any provider call. No surface, no live provider, no AI SDK import.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Bun test runner, zod v4 (only inside reused stages), `p-queue` (only inside the reused specialist stage). Tests inject a fake `ProviderClient` — no network.

---

## File Structure

- **Create `packages/orchestration/src/engine.ts`** — the `runReviewPipeline` composition (~50 lines). One responsibility: chain the existing stages and own the empty-files short-circuit and the hardcoded markdown title.
- **Modify `packages/orchestration/src/types.ts`** — add `RunReviewPipelineOptions` and `ReviewPipelineResult`. (Already re-exported via `export type * from "./types"` in `index.ts`, so no index change for types.)
- **Modify `packages/orchestration/src/index.ts`** — add `export * from "./engine";` so the function is part of the package surface.
- **Create `packages/orchestration/test/engine.test.ts`** — four contract tests using a fake `ProviderClient` keyed by `schemaName` (`"CoordinatorAgentOutput"` vs `"SpecialistAgentOutput"`).

**No dependency changes.** `@asyncs/orchestration` already depends on `@asyncs/agents`, `@asyncs/consensus`, `@asyncs/core`, `@asyncs/formatter`, `@asyncs/providers`, and `@asyncs/routing` (see `packages/orchestration/package.json`).

**Contract facts the tests rely on (verified against current code):**
- `ProviderClient.generateObject(request)` receives `request.schemaName` — `"CoordinatorAgentOutput"` for the coordinator call, `"SpecialistAgentOutput"` for each specialist call (`packages/agents/src/runner.ts:28,49`).
- The coordinator prompt renders available agents as `- <Name> (<kind>): <purpose>` lines (`packages/agents/src/prompt.ts:55-67`). Constraining to `["security"]` yields a `(security):` line and drops `(backend):` / `(frontend):`. The `(backend):` substring appears **only** when backend is available — the system prompt's output contract uses the `"backend" |` form, not `(backend):` (`packages/agents/src/constants.ts:33`).
- `createConsensusReport` dedupes on `file:line:normalizedTitle` and suppresses only `severity === "low" && confidence === "low"` (`packages/consensus/src/consensus.ts`).
- The formatter renders `# <title>`, a `## Specialists that failed` section when `failures.length > 0`, and `No actionable findings after consensus filtering.` when there are zero findings (`packages/formatter/src/formatter.ts`, `packages/formatter/src/constants.ts`).
- `createReviewRunPlan({ request })` with `request.agents === []` and no coordinator output yields `routeSource === "auto"` (`packages/orchestration/src/pipeline.ts:21-33`).

---

### Task 1: Compose the coordinator-driven happy path

Build the core composition: coordinator input → coordinated plan → specialists → consensus → markdown. This task deliberately does **not** map `request.agents`, surface `failures`, or short-circuit empty files — those are added in Tasks 2–4 so each has a genuine failing test first.

**Files:**
- Test: `packages/orchestration/test/engine.test.ts`
- Modify: `packages/orchestration/src/types.ts`
- Create: `packages/orchestration/src/engine.ts`
- Modify: `packages/orchestration/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/orchestration/test/engine.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { ChangedFile, ReviewFinding, ReviewRequest } from "@asyncs/core";
import type { ProviderClient, ProviderGenerateObjectRequest } from "@asyncs/providers";
import { runReviewPipeline } from "../src/index";

const baseRequest: ReviewRequest = {
  prNumber: 42,
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

describe("runReviewPipeline", () => {
  test("composes a coordinator-driven review and dedupes specialist findings", async () => {
    // Both specialists return this identical finding, so consensus dedupes two into one.
    const duplicateFinding: ReviewFinding = {
      agent: "backend",
      title: "Retry path lacks idempotency",
      message: "Retrying the charge without an idempotency key risks duplicate charges.",
      severity: "high",
      confidence: "high",
      file: "src/payments/retry.ts",
      line: 10,
      evidence: "The patch calls chargeWithRetry without an idempotency key.",
      recommendation: "Pass a stable idempotency key into chargeWithRetry.",
    };

    const provider: ProviderClient = {
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
                {
                  agent: "security",
                  purpose: "Review duplicate-charge risk.",
                  files: ["src/payments/retry.ts"],
                  focusAreas: ["duplicate charge"],
                  context: "Retries can double-charge.",
                },
              ],
              confidence: "high",
              reasoning: ["Retry changes need correctness and safety review."],
            },
          };
        }

        return { object: { findings: [duplicateFinding], summary: "Reviewed retry assignment." } };
      },
    };

    const result = await runReviewPipeline({
      request: baseRequest,
      files: changedFiles,
      provider,
      model: "test-model",
    });

    expect(result.plan.routeSource).toBe("coordinator");
    expect(result.plan.agents.map((agent) => agent.kind)).toEqual(["backend", "security"]);
    expect(result.report.findings).toHaveLength(1);
    expect(result.report.duplicateCount).toBe(1);
    expect(result.failures).toHaveLength(0);
    expect(result.markdown).toContain("# asyncs review");
    expect(result.markdown).toContain("### Backend - Retry path lacks idempotency");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/orchestration/test/engine.test.ts`
Expected: FAIL — `runReviewPipeline is not a function` (not yet exported).

- [ ] **Step 3: Add the option and result types**

In `packages/orchestration/src/types.ts`, add these two types (the file already imports `ChangedFile`, `ReviewRequest`, `ProviderClient`, `ConsensusReport`, and already defines `ReviewRunPlan`, `SpecialistFailure`, `RobustnessOptions`). Insert after the `ExecuteSpecialistAssignmentsOptions` block (around line 45):

```ts
export type RunReviewPipelineOptions = {
  request: ReviewRequest;
  files: readonly ChangedFile[];
  provider: ProviderClient;
  model: string;
  repository?: string;
} & RobustnessOptions;

export type ReviewPipelineResult = {
  plan: ReviewRunPlan;
  report: ConsensusReport;
  markdown: string;
  failures: SpecialistFailure[];
};
```

- [ ] **Step 4: Create the engine (initial version)**

Create `packages/orchestration/src/engine.ts`:

```ts
import { buildCoordinatorAgentInput } from "@asyncs/agents";
import { createConsensusReport } from "@asyncs/consensus";
import { formatReviewReportMarkdown } from "@asyncs/formatter";
import { createCoordinatedReviewRunPlan, executeSpecialistAssignments } from "./pipeline";
import type { ReviewPipelineResult, RobustnessOptions, RunReviewPipelineOptions } from "./types";

const REVIEW_TITLE = "asyncs review";

export async function runReviewPipeline(options: RunReviewPipelineOptions): Promise<ReviewPipelineResult> {
  const coordinatorInput = buildCoordinatorAgentInput({
    files: options.files,
    ...(options.repository === undefined ? {} : { repository: options.repository }),
  });

  const sharedRobustness: Pick<RobustnessOptions, "timeoutMs" | "retryPolicy" | "logger"> = {
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.retryPolicy === undefined ? {} : { retryPolicy: options.retryPolicy }),
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  };

  const plan = await createCoordinatedReviewRunPlan({
    request: options.request,
    coordinatorInput,
    coordinatorModel: options.model,
    provider: options.provider,
    ...sharedRobustness,
  });

  const { findings } = await executeSpecialistAssignments({
    plan,
    files: options.files,
    model: options.model,
    provider: options.provider,
    ...sharedRobustness,
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
  });

  const report = createConsensusReport({ findings });

  return {
    plan,
    report,
    markdown: formatReviewReportMarkdown({ report, title: REVIEW_TITLE }),
    failures: [],
  };
}
```

Note: `failures: []` is a deliberate stub — Task 3 wires real failures. The conditional-spread idiom is required by `exactOptionalPropertyTypes` (you cannot pass `timeoutMs: undefined` to a `timeoutMs?: number` field).

- [ ] **Step 5: Export the engine**

In `packages/orchestration/src/index.ts`, add the engine export. The file becomes:

```ts
export * from "./constants";
export * from "./engine";
export * from "./pipeline";
export * from "./preview";
export * from "./robustness";
export type * from "./types";
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `bun test packages/orchestration/test/engine.test.ts`
Expected: PASS — 1 pass, 0 fail.

- [ ] **Step 7: Commit**

```bash
git add packages/orchestration/src/engine.ts packages/orchestration/src/types.ts packages/orchestration/src/index.ts packages/orchestration/test/engine.test.ts
git commit -m "$(cat <<'EOF'
feat(orchestration): compose runReviewPipeline engine

Chains coordinator -> specialists -> consensus -> markdown over the
existing, untouched stages. request.agents mapping, failure surfacing,
and the empty-files short-circuit land in follow-up commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Constrain coordinator agents from `request.agents`

When `request.agents` is non-empty, pass those kinds as the coordinator's `availableAgents` so `--agents` narrows the swarm. When empty, omit it so `buildCoordinatorAgentInput` falls back to all built-in kinds.

**Files:**
- Test: `packages/orchestration/test/engine.test.ts` (append a test)
- Modify: `packages/orchestration/src/engine.ts`

- [ ] **Step 1: Write the failing test**

Append this test inside the existing `describe("runReviewPipeline", ...)` block in `packages/orchestration/test/engine.test.ts` (the imports, `baseRequest`, and `changedFiles` already exist from Task 1):

```ts
  test("maps request.agents into the coordinator's available agents", async () => {
    let coordinatorPrompt = "";

    const provider: ProviderClient = {
      kind: "custom",
      async generateText() {
        return { text: "unused" };
      },
      async generateObject(request: ProviderGenerateObjectRequest) {
        if (request.schemaName === "CoordinatorAgentOutput") {
          coordinatorPrompt = request.messages.map((message) => message.content).join("\n");
          return {
            object: {
              labels: ["security"],
              assignments: [
                {
                  agent: "security",
                  purpose: "Review auth changes.",
                  files: ["src/payments/retry.ts"],
                  focusAreas: ["authorization"],
                  context: "Security-sensitive change.",
                },
              ],
              confidence: "high",
              reasoning: ["Security-only review requested."],
            },
          };
        }

        return { object: { findings: [], summary: "No issues." } };
      },
    };

    await runReviewPipeline({
      request: { ...baseRequest, agents: ["security"] },
      files: changedFiles,
      provider,
      model: "test-model",
    });

    expect(coordinatorPrompt).toContain("(security):");
    expect(coordinatorPrompt).not.toContain("(backend):");
    expect(coordinatorPrompt).not.toContain("(frontend):");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/orchestration/test/engine.test.ts -t "maps request.agents"`
Expected: FAIL — `coordinatorPrompt` still lists every built-in agent, so `expect(...).not.toContain("(backend):")` fails (the engine currently always defaults `availableAgents`).

- [ ] **Step 3: Map `request.agents` into the coordinator input**

In `packages/orchestration/src/engine.ts`, replace the `coordinatorInput` construction. Change:

```ts
  const coordinatorInput = buildCoordinatorAgentInput({
    files: options.files,
    ...(options.repository === undefined ? {} : { repository: options.repository }),
  });
```

to:

```ts
  const coordinatorInput = buildCoordinatorAgentInput({
    files: options.files,
    ...(options.request.agents.length === 0 ? {} : { availableAgents: options.request.agents }),
    ...(options.repository === undefined ? {} : { repository: options.repository }),
  });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test packages/orchestration/test/engine.test.ts`
Expected: PASS — 2 pass, 0 fail (Task 1's happy path uses `agents: []`, so it still defaults and stays green).

- [ ] **Step 5: Commit**

```bash
git add packages/orchestration/src/engine.ts packages/orchestration/test/engine.test.ts
git commit -m "$(cat <<'EOF'
feat(orchestration): constrain coordinator agents from request.agents

Non-empty request.agents now narrows the coordinator's availableAgents;
empty falls back to all built-in kinds.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Surface specialist failures in the result and markdown

`executeSpecialistAssignments` already partitions failed specialists into `failures`. Thread that through the result and into the formatter's failures section.

**Files:**
- Test: `packages/orchestration/test/engine.test.ts` (append a test)
- Modify: `packages/orchestration/src/engine.ts`

- [ ] **Step 1: Write the failing test**

Append this test inside the `describe("runReviewPipeline", ...)` block:

```ts
  test("returns a review with a failures section when every specialist fails", async () => {
    const provider: ProviderClient = {
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
                {
                  agent: "security",
                  purpose: "Review duplicate-charge risk.",
                  files: ["src/payments/retry.ts"],
                  focusAreas: ["duplicate charge"],
                  context: "Retries can double-charge.",
                },
              ],
              confidence: "high",
              reasoning: ["Two specialists assigned."],
            },
          };
        }

        throw new Error("specialist provider exploded");
      },
    };

    const result = await runReviewPipeline({
      request: baseRequest,
      files: changedFiles,
      provider,
      model: "test-model",
      retryPolicy: { maxAttempts: 1, delaysMs: [] },
    });

    expect(result.failures).toHaveLength(2);
    expect(result.failures.map((failure) => failure.agent.kind).sort()).toEqual(["backend", "security"]);
    expect(result.report.findings).toHaveLength(0);
    expect(result.markdown).toContain("## Specialists that failed");
    expect(result.markdown).toContain("No actionable findings after consensus filtering.");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/orchestration/test/engine.test.ts -t "failures section"`
Expected: FAIL — the engine returns `failures: []` and renders no failures section, so `expect(result.failures).toHaveLength(2)` fails.

- [ ] **Step 3: Wire failures through the result and formatter**

In `packages/orchestration/src/engine.ts`, change the destructure to capture `failures`:

```ts
  const { findings } = await executeSpecialistAssignments({
```

to:

```ts
  const { findings, failures } = await executeSpecialistAssignments({
```

Then change the return statement:

```ts
  return {
    plan,
    report,
    markdown: formatReviewReportMarkdown({ report, title: REVIEW_TITLE }),
    failures: [],
  };
```

to:

```ts
  return {
    plan,
    report,
    markdown: formatReviewReportMarkdown({ report, title: REVIEW_TITLE, failures }),
    failures,
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test packages/orchestration/test/engine.test.ts`
Expected: PASS — 3 pass, 0 fail (the happy path has zero failures, so its `failures` stays empty and no section renders).

- [ ] **Step 5: Commit**

```bash
git add packages/orchestration/src/engine.ts packages/orchestration/test/engine.test.ts
git commit -m "$(cat <<'EOF'
feat(orchestration): surface specialist failures in the pipeline result

Partial specialist failures now flow into ReviewPipelineResult.failures
and the markdown "Specialists that failed" section.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Short-circuit on empty files

When `files` is empty there is nothing to review and no provider call should happen. Return a structurally valid plan (pure routing, no coordinator), an empty consensus report, and the standard markdown.

**Files:**
- Test: `packages/orchestration/test/engine.test.ts` (append a test)
- Modify: `packages/orchestration/src/engine.ts`

- [ ] **Step 1: Write the failing test**

Append this test inside the `describe("runReviewPipeline", ...)` block:

```ts
  test("short-circuits on empty files without calling the provider", async () => {
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

    const result = await runReviewPipeline({
      request: baseRequest,
      files: [],
      provider,
      model: "test-model",
    });

    expect(providerCalled).toBe(false);
    expect(result.plan.routeSource).toBe("auto");
    expect(result.report.findings).toHaveLength(0);
    expect(result.failures).toHaveLength(0);
    expect(result.markdown).toContain("# asyncs review");
    expect(result.markdown).toContain("No actionable findings after consensus filtering.");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/orchestration/test/engine.test.ts -t "short-circuits on empty files"`
Expected: FAIL — the engine still calls the coordinator, so `expect(providerCalled).toBe(false)` fails.

- [ ] **Step 3: Add `createReviewRunPlan` to the imports**

In `packages/orchestration/src/engine.ts`, change the pipeline import:

```ts
import { createCoordinatedReviewRunPlan, executeSpecialistAssignments } from "./pipeline";
```

to:

```ts
import { createCoordinatedReviewRunPlan, createReviewRunPlan, executeSpecialistAssignments } from "./pipeline";
```

- [ ] **Step 4: Add the short-circuit guard**

In `packages/orchestration/src/engine.ts`, insert this block as the first statement inside `runReviewPipeline`, before the `coordinatorInput` construction:

```ts
  if (options.files.length === 0) {
    const plan = createReviewRunPlan({ request: options.request });
    const report = createConsensusReport({ findings: [] });

    return {
      plan,
      report,
      markdown: formatReviewReportMarkdown({ report, title: REVIEW_TITLE }),
      failures: [],
    };
  }

```

After this edit the full file reads:

```ts
import { buildCoordinatorAgentInput } from "@asyncs/agents";
import { createConsensusReport } from "@asyncs/consensus";
import { formatReviewReportMarkdown } from "@asyncs/formatter";
import { createCoordinatedReviewRunPlan, createReviewRunPlan, executeSpecialistAssignments } from "./pipeline";
import type { ReviewPipelineResult, RobustnessOptions, RunReviewPipelineOptions } from "./types";

const REVIEW_TITLE = "asyncs review";

export async function runReviewPipeline(options: RunReviewPipelineOptions): Promise<ReviewPipelineResult> {
  if (options.files.length === 0) {
    const plan = createReviewRunPlan({ request: options.request });
    const report = createConsensusReport({ findings: [] });

    return {
      plan,
      report,
      markdown: formatReviewReportMarkdown({ report, title: REVIEW_TITLE }),
      failures: [],
    };
  }

  const coordinatorInput = buildCoordinatorAgentInput({
    files: options.files,
    ...(options.request.agents.length === 0 ? {} : { availableAgents: options.request.agents }),
    ...(options.repository === undefined ? {} : { repository: options.repository }),
  });

  const sharedRobustness: Pick<RobustnessOptions, "timeoutMs" | "retryPolicy" | "logger"> = {
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.retryPolicy === undefined ? {} : { retryPolicy: options.retryPolicy }),
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  };

  const plan = await createCoordinatedReviewRunPlan({
    request: options.request,
    coordinatorInput,
    coordinatorModel: options.model,
    provider: options.provider,
    ...sharedRobustness,
  });

  const { findings, failures } = await executeSpecialistAssignments({
    plan,
    files: options.files,
    model: options.model,
    provider: options.provider,
    ...sharedRobustness,
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
  });

  const report = createConsensusReport({ findings });

  return {
    plan,
    report,
    markdown: formatReviewReportMarkdown({ report, title: REVIEW_TITLE, failures }),
    failures,
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test packages/orchestration/test/engine.test.ts`
Expected: PASS — 4 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add packages/orchestration/src/engine.ts packages/orchestration/test/engine.test.ts
git commit -m "$(cat <<'EOF'
feat(orchestration): short-circuit runReviewPipeline on empty files

Empty files returns a pure-routed plan, an empty report, and the
standard markdown without touching the provider.

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
Expected: PASS — `tsc --noEmit` clean, `eslint .` clean, `prettier --check .` clean, and all `bun test` files pass (the four new `engine.test.ts` tests plus the existing suite).

- [ ] **Step 2: If `prettier --check` reports formatting**

Run: `bun run format` then re-run `bun run check`. If `format` changed files, commit them:

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(orchestration): apply prettier formatting

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If `bun run check` passed clean in Step 1, skip this step — do not create an empty commit.

---

## Notes for the implementer

- **Vendor neutrality:** `engine.ts` must not import any AI SDK. It only imports from `@asyncs/agents`, `@asyncs/consensus`, `@asyncs/formatter`, and its own `./pipeline` / `./types`. This is correct as written — keep it that way.
- **Zero `as` casts:** none are needed anywhere in this plan. If you reach for one, stop and restructure.
- **The hardcoded title** (`REVIEW_TITLE = "asyncs review"`) is intentional for v1 (spec Decision: "not worth an input yet"). It happens to equal the formatter's default, but the engine owns its title explicitly rather than relying on that default.
- **Do not modify** `pipeline.ts`, `preview.ts`, `consensus`, `formatter`, or `agents` — this slice is pure composition over those untouched stages.
