import { describe, expect, test } from "bun:test";
import {
  AGENT_KINDS,
  ASYNCS_DESCRIPTION,
  ASYNCS_PACKAGE_NAME,
  DEFAULT_REVIEW_MODE,
  DEFAULT_REVIEW_REQUEST_OPTIONS,
  REVIEW_CONFIDENCES,
  REVIEW_MODES,
  REVIEW_SEVERITIES,
  isConfidence,
  isAgentKind,
  isReviewMode,
  isSeverity,
  type AgentDefinition,
  type ReviewRequest,
  type ReviewFinding,
  type ReviewReport,
} from "../src/index";

describe("core metadata", () => {
  test("exports asyncs project metadata", () => {
    expect(ASYNCS_PACKAGE_NAME).toBe("asyncs");
    expect(ASYNCS_DESCRIPTION).toContain("sub-agent");
  });

  test("exports review vocabulary", () => {
    expect(REVIEW_SEVERITIES).toEqual(["low", "medium", "high", "critical"]);
    expect(REVIEW_CONFIDENCES).toEqual(["low", "medium", "high"]);
    expect(REVIEW_MODES).toEqual(["low-noise", "full", "security", "architecture", "testing"]);
    expect(DEFAULT_REVIEW_MODE).toBe("low-noise");
    expect(DEFAULT_REVIEW_REQUEST_OPTIONS).toEqual({
      mode: "low-noise",
      agents: [],
      postComments: false,
      dryRun: false,
    });
    expect(AGENT_KINDS).toContain("backend");
    expect(AGENT_KINDS).toContain("security");
  });

  test("checks severity and confidence values", () => {
    expect(isSeverity("critical")).toBe(true);
    expect(isSeverity("cosmetic")).toBe(false);
    expect(isConfidence("medium")).toBe(true);
    expect(isConfidence("certain")).toBe(false);
    expect(isReviewMode("low-noise")).toBe(true);
    expect(isReviewMode("noisy")).toBe(false);
    expect(isAgentKind("security")).toBe(true);
    expect(isAgentKind("payments")).toBe(false);
  });

  test("supports typed review findings and reports", () => {
    const backendAgent: AgentDefinition = {
      kind: "backend",
      name: "Backend Agent",
      purpose: "Review backend correctness and service boundaries.",
    };

    const finding: ReviewFinding = {
      agent: backendAgent.kind,
      title: "Missing idempotency strategy",
      message: "Payment retries need a duplicate-charge strategy.",
      severity: "high",
      confidence: "high",
      file: "src/payments/retry.ts",
      line: 42,
      evidence: "The retry path was changed without a deduplication key.",
      recommendation: "Add an idempotency key or document the existing guard.",
    };

    const report: ReviewReport = {
      pullRequest: {
        number: 3213,
        title: "Add payment retry orchestration",
        repository: "alex/payment-service",
        baseRef: "main",
        headRef: "payment-retries",
      },
      mode: "low-noise",
      findings: [finding],
      agents: [backendAgent],
    };

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.severity).toBe("high");
  });

  test("supports typed review requests", () => {
    const request: ReviewRequest = {
      prNumber: 3213,
      mode: "low-noise",
      agents: ["backend", "security"],
      postComments: false,
      dryRun: true,
    };

    expect(request.agents).toEqual(["backend", "security"]);
    expect(request.dryRun).toBe(true);
  });
});
