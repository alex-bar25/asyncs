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
    async listInlineComments() {
      return [];
    },
    async createInlineComment() {},
    async deleteInlineComment() {},
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
