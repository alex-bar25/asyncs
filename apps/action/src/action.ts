import { buildReviewBody, upsertReviewComment } from "./comment";
import type { ReviewActionOutcome, RunReviewActionDeps } from "./types";

export async function runReviewAction(deps: RunReviewActionDeps): Promise<ReviewActionOutcome> {
  let body: string;
  let ok: boolean;

  try {
    const run = await deps.review(deps.event);
    const header = `${run.diff.baseRef}..${run.diff.headRef}, ${run.diff.skippedBinaries.length} binaries skipped`;
    body = buildReviewBody({ header, markdown: run.result.markdown });
    ok = true;
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    body = buildReviewBody({ header: "asyncs review failed", markdown: `asyncs review failed: ${reason}` });
    ok = false;
  }

  await upsertReviewComment({
    client: deps.client,
    owner: deps.event.owner,
    repo: deps.event.repo,
    prNumber: deps.event.prNumber,
    body,
  });

  return { ok };
}
