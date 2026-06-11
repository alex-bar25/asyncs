import type { ReviewFinding } from "@asyncs/core";
import { INLINE_COMMENT_MARKER } from "./constants";
import type { ReviewCommentClient, SyncInlineCommentsOutcome } from "./types";

export type InlineCommentFinding = ReviewFinding & {
  file: string;
  line: number;
};

export function buildInlineCommentBody(finding: ReviewFinding): string {
  return [
    INLINE_COMMENT_MARKER,
    "",
    `### ${finding.agent} — ${finding.title}`,
    "",
    `${finding.severity} severity, ${finding.confidence} confidence`,
    "",
    finding.message,
    "",
    `**Evidence:** ${finding.evidence}`,
    "",
    `**Recommendation:** ${finding.recommendation}`,
  ].join("\n");
}

export async function syncInlineComments(input: {
  client: ReviewCommentClient;
  owner: string;
  repo: string;
  prNumber: number;
  commitId: string;
  findings: readonly ReviewFinding[];
}): Promise<SyncInlineCommentsOutcome> {
  const existing = await input.client.listInlineComments({
    owner: input.owner,
    repo: input.repo,
    prNumber: input.prNumber,
  });
  const staleIds = existing
    .filter((comment) => comment.body.includes(INLINE_COMMENT_MARKER))
    .map((comment) => comment.id);

  const anchored = input.findings.filter(isInlineCommentFinding);
  let posted = 0;
  let skipped = 0;

  for (const finding of anchored) {
    try {
      await input.client.createInlineComment({
        owner: input.owner,
        repo: input.repo,
        prNumber: input.prNumber,
        commitId: input.commitId,
        path: finding.file,
        line: finding.line,
        body: buildInlineCommentBody(finding),
      });
      posted += 1;
    } catch {
      skipped += 1;
    }
  }

  for (const commentId of staleIds) {
    try {
      await input.client.deleteInlineComment({ owner: input.owner, repo: input.repo, commentId });
    } catch {
      continue;
    }
  }

  return { posted, skipped };
}

function isInlineCommentFinding(finding: ReviewFinding): finding is InlineCommentFinding {
  return finding.file !== undefined && finding.line !== undefined;
}
