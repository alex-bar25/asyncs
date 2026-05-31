import type { ReviewRequest } from "@asyncs/core";
import type { LoadLocalDiffOptions, LocalDiffMode, LocalDiffResult } from "@asyncs/diff";
import type { ReviewPipelineResult, RobustnessOptions } from "@asyncs/orchestration";
import type { ProviderClient } from "@asyncs/providers";

export type ResolveAnthropicProviderOptions = {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
};

export type ResolvedProvider = {
  provider: ProviderClient;
  model: string;
};

export type ReviewDiffOptions = {
  request: ReviewRequest;
  diff: LocalDiffMode;
  provider: ProviderClient;
  model: string;
  cwd?: string;
  repository?: string;
  loadDiff?: (options: LoadLocalDiffOptions) => Promise<LocalDiffResult>;
} & RobustnessOptions;

export type ReviewRunResult = {
  result: ReviewPipelineResult;
  diff: LocalDiffResult;
};

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
