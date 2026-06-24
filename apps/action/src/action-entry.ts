import type { Logger, ReviewRequest } from "@asyncs/core";
import { runReviewAction } from "./action";
import { readPullRequestEvent } from "./event";
import { createReviewCommentClient } from "./github";
import { parseReviewOptionsInput, type ParsedReviewOptions } from "./inputs";
import { resolveProvider } from "./provider";
import { reviewDiff } from "./runner";
import type { PullRequestEvent, ReviewRunResult } from "./types";

function formatMeta(meta?: Record<string, unknown>): string {
  return meta === undefined ? "" : ` ${JSON.stringify(meta)}`;
}

const consoleLogger: Logger = {
  debug: () => {},
  info: (message, meta) => process.stdout.write(`${message}${formatMeta(meta)}\n`),
  warn: (message, meta) => process.stderr.write(`${message}${formatMeta(meta)}\n`),
  error: (message, meta) => process.stderr.write(`${message}${formatMeta(meta)}\n`),
};

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
  const providerInput = env.ASYNCS_PROVIDER_INPUT;
  const resolveOptions = {
    ...(providerInput === undefined || providerInput.length === 0 ? {} : { provider: providerInput }),
    ...(modelInput === undefined || modelInput.length === 0 ? {} : { model: modelInput }),
    ...(env.OPENAI_API_KEY === undefined ? {} : { openAIApiKey: env.OPENAI_API_KEY }),
    ...(env.ANTHROPIC_API_KEY === undefined ? {} : { anthropicApiKey: env.ANTHROPIC_API_KEY }),
  };

  let reviewOptions: ParsedReviewOptions;

  try {
    reviewOptions = parseReviewOptionsInput({ mode: env.ASYNCS_MODE_INPUT, agents: env.ASYNCS_AGENTS_INPUT });
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  const review = async (pullRequest: PullRequestEvent): Promise<ReviewRunResult> => {
    const { provider, model } = resolveProvider(resolveOptions);

    const request: ReviewRequest = {
      mode: reviewOptions.mode,
      agents: reviewOptions.agents,
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
  const outcome = await runReviewAction({ event, review, client, logger: consoleLogger });

  return outcome.ok ? 0 : 1;
}

if (import.meta.main) {
  const code = await runActionEntry(process.env);
  process.exit(code);
}
