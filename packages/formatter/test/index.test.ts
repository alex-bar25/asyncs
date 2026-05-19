import { describe, expect, test } from "bun:test";
import type { ConsensusReport } from "@asyncs/consensus";
import type { ReviewFinding } from "@asyncs/core";
import {
  DEFAULT_EMPTY_REVIEW_MESSAGE,
  DEFAULT_REVIEW_REPORT_TITLE,
  formatFindingMarkdown,
  formatReviewReportMarkdown,
} from "../src/index";

const finding: ReviewFinding = {
  agent: "backend",
  title: "Retry path needs idempotency evidence",
  message: "The retry path should show how duplicate charges are prevented.",
  severity: "high",
  confidence: "medium",
  file: "services/payments/retry.ts",
  line: 42,
  evidence: "The patch calls chargeWithRetry in retryPayment.",
  recommendation: "Preserve or add an idempotency key around retries.",
};

describe("review formatter", () => {
  test("exports formatter defaults", () => {
    expect(DEFAULT_REVIEW_REPORT_TITLE).toBe("asyncs review");
    expect(DEFAULT_EMPTY_REVIEW_MESSAGE).toContain("No actionable findings");
  });

  test("formats a single finding as markdown", () => {
    const markdown = formatFindingMarkdown(finding);

    expect(markdown).toContain("### Backend - Retry path needs idempotency evidence");
    expect(markdown).toContain("Severity: high");
    expect(markdown).toContain("Confidence: medium");
    expect(markdown).toContain("Location: `services/payments/retry.ts:42`");
    expect(markdown).toContain("Why this matters:");
    expect(markdown).toContain(finding.message);
    expect(markdown).toContain("Evidence:");
    expect(markdown).toContain(finding.evidence);
    expect(markdown).toContain("Recommendation:");
    expect(markdown).toContain(finding.recommendation);
  });

  test("formats an empty consensus report", () => {
    const report: ConsensusReport = {
      findings: [],
      duplicateCount: 0,
      suppressedCount: 2,
    };

    const markdown = formatReviewReportMarkdown({ report });

    expect(markdown).toContain("# asyncs review");
    expect(markdown).toContain(DEFAULT_EMPTY_REVIEW_MESSAGE);
    expect(markdown).toContain("Suppressed noisy findings: 2");
  });

  test("formats a consensus report with findings and counts", () => {
    const report: ConsensusReport = {
      findings: [finding],
      duplicateCount: 1,
      suppressedCount: 2,
    };

    const markdown = formatReviewReportMarkdown({
      report,
      title: "asyncs PR review",
    });

    expect(markdown).toContain("# asyncs PR review");
    expect(markdown).toContain("Findings: 1");
    expect(markdown).toContain("Deduplicated findings: 1");
    expect(markdown).toContain("Suppressed noisy findings: 2");
    expect(markdown).toContain("### Backend - Retry path needs idempotency evidence");
  });
});
