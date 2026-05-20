import { createConsensusReport } from "@asyncs/consensus";
import type { AgentKind, ChangedFile, ReviewFinding } from "@asyncs/core";
import { formatReviewReportMarkdown } from "@asyncs/formatter";
import { createReviewRunPlan } from "./pipeline";
import type { PreviewReviewPipelineResult, RunPreviewReviewPipelineOptions } from "./types";

const PREVIEW_CHANGED_FILES: [ChangedFile, ...ChangedFile[]] = [
  {
    path: "preview/request.ts",
    status: "modified",
    additions: 8,
    deletions: 2,
    patch: "@@ asyncs preview request",
  },
];

export function runPreviewReviewPipeline(options: RunPreviewReviewPipelineOptions): PreviewReviewPipelineResult {
  const plan = createReviewRunPlan({ request: options.request });
  const report = createConsensusReport({
    findings: createPreviewFindings(plan.agents[0]?.kind ?? "backend", PREVIEW_CHANGED_FILES[0]),
  });

  return {
    plan,
    files: PREVIEW_CHANGED_FILES,
    report,
    markdown: formatReviewReportMarkdown({
      report,
      title: "asyncs review preview",
    }),
  };
}

function createPreviewFindings(agent: AgentKind, file: ChangedFile): ReviewFinding[] {
  const finding: ReviewFinding = {
    agent,
    title: "Preview finding: route smoke test",
    message: "This is deterministic preview data showing how asyncs will render a routed agent finding.",
    severity: "medium",
    confidence: "medium",
    file: file.path,
    line: 1,
    evidence: `The CLI planned a review for ${file.path} and passed findings through consensus.`,
    recommendation: "Replace preview data with provider-backed specialist findings when PR loading is wired.",
  };

  return [
    finding,
    {
      ...finding,
      confidence: "high",
    },
    {
      ...finding,
      title: "Preview finding: suppressed low-value note",
      severity: "low",
      confidence: "low",
    },
  ];
}
