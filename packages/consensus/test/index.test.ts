import { describe, expect, test } from "bun:test";
import type { ReviewFinding } from "@asyncs/core";
import {
  CONFIDENCE_RANKS,
  SEVERITY_RANKS,
  createConsensusReport,
  dedupeFindings,
  filterNoisyFindings,
  sortFindingsByRisk,
} from "../src/index";

const baseFinding: ReviewFinding = {
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

describe("consensus", () => {
  test("exports severity and confidence ranks", () => {
    expect(SEVERITY_RANKS.critical).toBeGreaterThan(SEVERITY_RANKS.high);
    expect(CONFIDENCE_RANKS.high).toBeGreaterThan(CONFIDENCE_RANKS.medium);
  });

  test("deduplicates exact same finding location and title", () => {
    const findings = dedupeFindings([
      baseFinding,
      {
        ...baseFinding,
        agent: "security",
        confidence: "high",
      },
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.agent).toBe("security");
    expect(findings[0]?.confidence).toBe("high");
  });

  test("filters low confidence and low severity noise", () => {
    const findings = filterNoisyFindings([
      {
        ...baseFinding,
        severity: "low",
        confidence: "low",
      },
      {
        ...baseFinding,
        title: "Critical authorization bypass",
        severity: "critical",
        confidence: "low",
      },
    ]);

    expect(findings.map((finding) => finding.title)).toEqual(["Critical authorization bypass"]);
  });

  test("sorts findings by severity then confidence", () => {
    const findings = sortFindingsByRisk([
      {
        ...baseFinding,
        title: "Medium confidence medium issue",
        severity: "medium",
        confidence: "medium",
      },
      {
        ...baseFinding,
        title: "High confidence high issue",
        severity: "high",
        confidence: "high",
      },
      {
        ...baseFinding,
        title: "Low confidence critical issue",
        severity: "critical",
        confidence: "low",
      },
    ]);

    expect(findings.map((finding) => finding.title)).toEqual([
      "Low confidence critical issue",
      "High confidence high issue",
      "Medium confidence medium issue",
    ]);
  });

  test("creates a consensus report from specialist findings", () => {
    const report = createConsensusReport({
      findings: [
        baseFinding,
        {
          ...baseFinding,
          agent: "security",
          confidence: "high",
        },
        {
          ...baseFinding,
          title: "Tiny style nit",
          severity: "low",
          confidence: "low",
        },
      ],
    });

    expect(report.findings).toHaveLength(1);
    expect(report.suppressedCount).toBe(1);
    expect(report.duplicateCount).toBe(1);
  });
});
