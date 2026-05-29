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
