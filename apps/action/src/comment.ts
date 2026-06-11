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
