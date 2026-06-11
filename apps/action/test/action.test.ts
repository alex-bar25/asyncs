import { describe, expect, test } from "bun:test";
import type { ReviewFinding, ReviewRequest } from "@asyncs/core";
import { INLINE_COMMENT_MARKER, REVIEW_COMMENT_MARKER } from "../src/constants";
import { runReviewAction } from "../src/action";
import type {
  CreateInlineCommentInput,
  PullRequestEvent,
  ReviewComment,
  ReviewCommentClient,
  ReviewRunResult,
} from "../src/types";

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

function createFakeClient(existing: readonly ReviewComment[], existingInline: readonly ReviewComment[] = []) {
  const posted: string[] = [];
  const postedInline: CreateInlineCommentInput[] = [];
  const deletedInline: number[] = [];

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
    async listInlineComments() {
      return existingInline;
    },
    async createInlineComment(input) {
      postedInline.push(input);
    },
    async deleteInlineComment(input) {
      deletedInline.push(input.commentId);
    },
  };

  return { client, posted, postedInline, deletedInline };
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
    expect(outcome.inline).toEqual({ posted: 0, skipped: 0 });
    expect(posted).toHaveLength(1);
    expect(posted[0]).toContain("asyncs review failed");
    expect(posted[0]).toContain("provider exploded");
  });

  test("posts inline comments for anchored findings on success", async () => {
    const { client, postedInline } = createFakeClient([]);

    const finding: ReviewFinding = {
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

    const run: ReviewRunResult = {
      ...fakeRun,
      result: { ...fakeRun.result, report: { findings: [finding], duplicateCount: 0, suppressedCount: 0 } },
    };

    const outcome = await runReviewAction({
      event,
      review: async () => run,
      client,
    });

    expect(outcome).toEqual({ ok: true, inline: { posted: 1, skipped: 0 } });
    expect(postedInline).toHaveLength(1);
    expect(postedInline[0]).toMatchObject({ path: "src/payments/retry.ts", line: 10, commitId: "head-sha" });
    expect(postedInline[0]?.body).toContain(INLINE_COMMENT_MARKER);
  });

  test("cleans up stale inline comments when the review fails", async () => {
    const { client, deletedInline } = createFakeClient(
      [],
      [{ id: 9, body: `${INLINE_COMMENT_MARKER}\n\nstale finding` }],
    );

    const outcome = await runReviewAction({
      event,
      review: async () => {
        throw new Error("provider exploded");
      },
      client,
    });

    expect(outcome.ok).toBe(false);
    expect(deletedInline).toEqual([9]);
  });
});
