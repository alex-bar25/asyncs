import { describe, expect, test } from "bun:test";
import type { ChangedFile, ReviewFinding, ReviewRequest } from "@asyncs/core";
import type { ProviderClient, ProviderGenerateObjectRequest } from "@asyncs/providers";
import { runReviewPipeline } from "../src/index";

const baseRequest: ReviewRequest = {
  prNumber: 42,
  mode: "low-noise",
  agents: [],
  postComments: false,
  dryRun: true,
};

const changedFiles: ChangedFile[] = [
  {
    path: "src/payments/retry.ts",
    status: "modified",
    additions: 12,
    deletions: 3,
    patch: "@@ retryPayment\n+ await chargeWithRetry(orderId)",
  },
];

describe("runReviewPipeline", () => {
  test("composes a coordinator-driven review and dedupes specialist findings", async () => {
    // Both specialists return this identical finding, so consensus dedupes two into one.
    const duplicateFinding: ReviewFinding = {
      agent: "backend",
      title: "Retry path lacks idempotency",
      message: "Retrying the charge without an idempotency key risks duplicate charges.",
      severity: "high",
      confidence: "high",
      file: "src/payments/retry.ts",
      line: 10,
      evidence: "The patch calls chargeWithRetry without an idempotency key.",
      recommendation: "Pass a stable idempotency key into chargeWithRetry.",
    };

    const provider: ProviderClient = {
      kind: "custom",
      async generateText() {
        return { text: "unused" };
      },
      async generateObject(request: ProviderGenerateObjectRequest) {
        if (request.schemaName === "CoordinatorAgentOutput") {
          return {
            object: {
              labels: ["payments"],
              assignments: [
                {
                  agent: "backend",
                  purpose: "Review retry correctness.",
                  files: ["src/payments/retry.ts"],
                  focusAreas: ["retry behavior"],
                  context: "Payment retry behavior changed.",
                },
                {
                  agent: "security",
                  purpose: "Review duplicate-charge risk.",
                  files: ["src/payments/retry.ts"],
                  focusAreas: ["duplicate charge"],
                  context: "Retries can double-charge.",
                },
              ],
              confidence: "high",
              reasoning: ["Retry changes need correctness and safety review."],
            },
          };
        }

        return { object: { findings: [duplicateFinding], summary: "Reviewed retry assignment." } };
      },
    };

    const result = await runReviewPipeline({
      request: baseRequest,
      files: changedFiles,
      provider,
      model: "test-model",
    });

    expect(result.plan.routeSource).toBe("coordinator");
    expect(result.plan.agents.map((agent) => agent.kind)).toEqual(["backend", "security"]);
    expect(result.report.findings).toHaveLength(1);
    expect(result.report.duplicateCount).toBe(1);
    expect(result.failures).toHaveLength(0);
    expect(result.markdown).toContain("# asyncs review");
    expect(result.markdown).toContain("### Backend - Retry path lacks idempotency");
  });
});
