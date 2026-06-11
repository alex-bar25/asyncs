import { describe, expect, test } from "bun:test";
import type { ReviewFinding } from "@asyncs/core";
import { INLINE_COMMENT_MARKER } from "../src/constants";
import { buildInlineCommentBody, syncInlineComments } from "../src/inlineComments";
import type { CreateInlineCommentInput, InlineComment, ReviewCommentClient } from "../src/types";

const finding: ReviewFinding = {
  agent: "backend",
  title: "Retry path lacks idempotency",
  message: "Retrying the charge without an idempotency key risks duplicate charges.",
  severity: "high",
  confidence: "high",
  file: "src/payments/retry.ts",
  line: 42,
  evidence: "The patch calls chargeWithRetry without an idempotency key.",
  recommendation: "Pass a stable idempotency key into chargeWithRetry.",
};

function createFakeClient(input: {
  existingInline?: readonly InlineComment[];
  failCreateForPaths?: readonly string[];
}) {
  const created: CreateInlineCommentInput[] = [];
  const deleted: number[] = [];
  const failPaths = new Set(input.failCreateForPaths ?? []);

  const client: ReviewCommentClient = {
    async listComments() {
      return [];
    },
    async createComment() {},
    async updateComment() {},
    async listInlineComments() {
      return input.existingInline ?? [];
    },
    async createInlineComment(create) {
      if (failPaths.has(create.path)) {
        throw new Error("Validation Failed: line must be part of the diff");
      }
      created.push(create);
    },
    async deleteInlineComment(remove) {
      deleted.push(remove.commentId);
    },
  };

  return { client, created, deleted };
}

describe("buildInlineCommentBody", () => {
  test("includes the marker, agent, title, evidence, and recommendation", () => {
    const body = buildInlineCommentBody(finding);

    expect(body).toContain(INLINE_COMMENT_MARKER);
    expect(body).toContain("backend");
    expect(body).toContain("Retry path lacks idempotency");
    expect(body).toContain("The patch calls chargeWithRetry without an idempotency key.");
    expect(body).toContain("Pass a stable idempotency key into chargeWithRetry.");
    expect(body).toContain("high severity");
  });
});

describe("syncInlineComments", () => {
  test("posts one inline comment per finding with file and line", async () => {
    const { client, created } = createFakeClient({});

    const outcome = await syncInlineComments({
      client,
      owner: "alex-bar25",
      repo: "asyncs",
      prNumber: 7,
      commitId: "head-sha",
      findings: [finding, { ...finding, file: undefined, line: undefined }],
    });

    expect(outcome).toEqual({ posted: 1, skipped: 0 });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      path: "src/payments/retry.ts",
      line: 42,
      commitId: "head-sha",
      prNumber: 7,
    });
  });

  test("deletes previous marker-tagged inline comments before posting", async () => {
    const { client, deleted } = createFakeClient({
      existingInline: [
        { id: 1, body: `${INLINE_COMMENT_MARKER}\n\nold finding` },
        { id: 2, body: "human comment, leave me alone" },
      ],
    });

    await syncInlineComments({
      client,
      owner: "alex-bar25",
      repo: "asyncs",
      prNumber: 7,
      commitId: "head-sha",
      findings: [finding],
    });

    expect(deleted).toEqual([1]);
  });

  test("tolerates per-comment create failures and counts them as skipped", async () => {
    const { client, created } = createFakeClient({ failCreateForPaths: ["src/outside-diff.ts"] });

    const outcome = await syncInlineComments({
      client,
      owner: "alex-bar25",
      repo: "asyncs",
      prNumber: 7,
      commitId: "head-sha",
      findings: [finding, { ...finding, file: "src/outside-diff.ts", line: 1 }],
    });

    expect(outcome).toEqual({ posted: 1, skipped: 1 });
    expect(created).toHaveLength(1);
  });
});
