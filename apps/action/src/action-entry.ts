import { DEFAULT_REVIEW_REQUEST_OPTIONS, type ReviewRequest } from "@asyncs/core";
import { runReviewAction } from "./action";
import { readPullRequestEvent } from "./event";
import { createReviewCommentClient } from "./github";
import { parseReviewOptionsInput, type ParsedReviewOptions } from "./inputs";
import { resolveAnthropicProvider } from "./provider";
import { reviewDiff } from "./runner";
import type { PullRequestEvent, ReviewRunResult } from "./types";

export async function runActionEntry(env: Record<string, string | undefined>): Promise<number> {
  const githubToken = env.GITHUB_TOKEN ?? "";

  if (githubToken.length === 0) {
    process.stderr.write("GITHUB_TOKEN is not set.\n");
    return 1;
  }

  let event: PullRequestEvent;

  try {
    event = await readPullRequestEvent(env);
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  const modelInput = env.ASYNCS_MODEL_INPUT;
  const resolveOptions = modelInput !== undefined && modelInput.length > 0 ? { model: modelInput } : {};

  let reviewOptions: ParsedReviewOptions;

  try {
    reviewOptions = parseReviewOptionsInput({ mode: env.ASYNCS_MODE_INPUT, agents: env.ASYNCS_AGENTS_INPUT });
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  const review = async (pullRequest: PullRequestEvent): Promise<ReviewRunResult> => {
    const { provider, model } = resolveAnthropicProvider(resolveOptions);

    const request: ReviewRequest = {
      prNumber: pullRequest.prNumber,
      mode: reviewOptions.mode,
      agents: reviewOptions.agents,
      postComments: DEFAULT_REVIEW_REQUEST_OPTIONS.postComments,
      dryRun: DEFAULT_REVIEW_REQUEST_OPTIONS.dryRun,
    };

    return reviewDiff({
      request,
      diff: { kind: "commitRange", from: pullRequest.baseSha, to: pullRequest.headSha },
      provider,
      model,
      repository: `${pullRequest.owner}/${pullRequest.repo}`,
    });
  };

  const client = createReviewCommentClient(githubToken);
  const outcome = await runReviewAction({ event, review, client });

  return outcome.ok ? 0 : 1;
}

if (import.meta.main) {
  const code = await runActionEntry(process.env);
  process.exit(code);
}
