import { buildCoordinatorAgentInput } from "@asyncs/agents";
import { createConsensusReport } from "@asyncs/consensus";
import { formatReviewReportMarkdown } from "@asyncs/formatter";
import { createCoordinatedReviewRunPlan, executeSpecialistAssignments } from "./pipeline";
import type { ReviewPipelineResult, RobustnessOptions, RunReviewPipelineOptions } from "./types";

const REVIEW_TITLE = "asyncs review";

export async function runReviewPipeline(options: RunReviewPipelineOptions): Promise<ReviewPipelineResult> {
  const coordinatorInput = buildCoordinatorAgentInput({
    files: options.files,
    ...(options.request.agents.length === 0 ? {} : { availableAgents: options.request.agents }),
    ...(options.repository === undefined ? {} : { repository: options.repository }),
  });

  const sharedRobustness: Pick<RobustnessOptions, "timeoutMs" | "retryPolicy" | "logger"> = {
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.retryPolicy === undefined ? {} : { retryPolicy: options.retryPolicy }),
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  };

  const plan = await createCoordinatedReviewRunPlan({
    request: options.request,
    coordinatorInput,
    coordinatorModel: options.model,
    provider: options.provider,
    ...sharedRobustness,
  });

  const { findings } = await executeSpecialistAssignments({
    plan,
    files: options.files,
    model: options.model,
    provider: options.provider,
    ...sharedRobustness,
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
  });

  const report = createConsensusReport({ findings });

  return {
    plan,
    report,
    markdown: formatReviewReportMarkdown({ report, title: REVIEW_TITLE }),
    failures: [],
  };
}
