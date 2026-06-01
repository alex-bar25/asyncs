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
