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
