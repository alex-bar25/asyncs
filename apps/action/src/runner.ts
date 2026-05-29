import { loadLocalDiff } from "@asyncs/diff";
import { runReviewPipeline } from "@asyncs/orchestration";
import type { ReviewDiffOptions, ReviewRunResult } from "./types";

export async function reviewDiff(options: ReviewDiffOptions): Promise<ReviewRunResult> {
  const loadDiff = options.loadDiff ?? loadLocalDiff;

  const diff = await loadDiff({
    mode: options.diff,
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
  });

  const result = await runReviewPipeline({
    request: options.request,
    files: diff.files,
    provider: options.provider,
    model: options.model,
    ...(options.repository === undefined ? {} : { repository: options.repository }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.retryPolicy === undefined ? {} : { retryPolicy: options.retryPolicy }),
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  });

  return { result, diff };
}
