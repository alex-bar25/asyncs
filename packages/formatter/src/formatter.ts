import type { ReviewFinding } from "@asyncs/core";
import { DEFAULT_EMPTY_REVIEW_MESSAGE, DEFAULT_REVIEW_REPORT_TITLE } from "./constants";
import type { FormatReviewReportOptions, SpecialistFailureLike } from "./types";

export function formatReviewReportMarkdown(options: FormatReviewReportOptions): string {
  const title = options.title ?? DEFAULT_REVIEW_REPORT_TITLE;
  const failures = options.failures ?? [];

  const headerLines = [
    `# ${title}`,
    "",
    `Findings: ${options.report.findings.length}`,
    `Deduplicated findings: ${options.report.duplicateCount}`,
    `Suppressed noisy findings: ${options.report.suppressedCount}`,
    "",
  ];

  const bodySections: string[] = [];

  if (options.report.findings.length === 0) {
    bodySections.push(DEFAULT_EMPTY_REVIEW_MESSAGE);
  } else {
    bodySections.push(...options.report.findings.map(formatFindingMarkdown));
  }

  if (failures.length > 0) {
    bodySections.push(formatFailuresMarkdown(failures));
  }

  return [...headerLines, bodySections.join("\n\n"), ""].join("\n");
}

function formatFailuresMarkdown(failures: readonly SpecialistFailureLike[]): string {
  const lines = ["## Specialists that failed", ""];

  for (const failure of failures) {
    const attemptLabel = failure.attempts === 1 ? "1 attempt" : `${failure.attempts} attempts`;
    lines.push(`- **${failure.agent.name}** — failed after ${attemptLabel}. Last error: \`${failure.error}\`.`);
  }

  return lines.join("\n");
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
