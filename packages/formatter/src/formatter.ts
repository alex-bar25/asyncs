import type { ReviewFinding } from "@asyncs/core";
import { DEFAULT_EMPTY_REVIEW_MESSAGE, DEFAULT_REVIEW_REPORT_TITLE } from "./constants";
import type { FormatReviewReportOptions } from "./types";

export function formatReviewReportMarkdown(options: FormatReviewReportOptions): string {
  const title = options.title ?? DEFAULT_REVIEW_REPORT_TITLE;
  const lines = [
    `# ${title}`,
    "",
    `Findings: ${options.report.findings.length}`,
    `Deduplicated findings: ${options.report.duplicateCount}`,
    `Suppressed noisy findings: ${options.report.suppressedCount}`,
    "",
  ];

  if (options.report.findings.length === 0) {
    return [...lines, DEFAULT_EMPTY_REVIEW_MESSAGE, ""].join("\n");
  }

  return [...lines, ...options.report.findings.map(formatFindingMarkdown)].join("\n\n");
}

export function formatFindingMarkdown(finding: ReviewFinding): string {
  return [
    `### ${formatAgentName(finding.agent)} - ${finding.title}`,
    "",
    `Severity: ${finding.severity}`,
    `Confidence: ${finding.confidence}`,
    `Location: ${formatLocation(finding)}`,
    "",
    "Why this matters:",
    finding.message,
    "",
    "Evidence:",
    finding.evidence,
    "",
    "Recommendation:",
    finding.recommendation,
  ].join("\n");
}

function formatAgentName(agent: ReviewFinding["agent"]): string {
  return agent
    .toString()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function formatLocation(finding: ReviewFinding): string {
  if (finding.file === undefined) {
    return "`unknown`";
  }

  if (finding.line === undefined) {
    return `\`${finding.file}\``;
  }

  return `\`${finding.file}:${finding.line}\``;
}
