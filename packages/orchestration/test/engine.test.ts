import { describe, expect, test } from "bun:test";
import type { ChangedFile, ReviewFinding, ReviewRequest } from "@asyncs/core";
import type { ProviderClient, ProviderGenerateObjectRequest } from "@asyncs/providers";
import { runReviewPipeline } from "../src/index";

const baseRequest: ReviewRequest = {
  mode: "low-noise",
  agents: [],
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

  test("maps request.agents into the coordinator's available agents", async () => {
    let coordinatorPrompt = "";

    const provider: ProviderClient = {
      kind: "custom",
      async generateText() {
        return { text: "unused" };
      },
      async generateObject(request: ProviderGenerateObjectRequest) {
        if (request.schemaName === "CoordinatorAgentOutput") {
          coordinatorPrompt = request.messages.map((message) => message.content).join("\n");
          return {
            object: {
              labels: ["security"],
              assignments: [
                {
                  agent: "security",
                  purpose: "Review auth changes.",
                  files: ["src/payments/retry.ts"],
                  focusAreas: ["authorization"],
                  context: "Security-sensitive change.",
                },
              ],
              confidence: "high",
              reasoning: ["Security-only review requested."],
            },
          };
        }

        return { object: { findings: [], summary: "No issues." } };
      },
    };

    await runReviewPipeline({
      request: { ...baseRequest, agents: ["security"] },
      files: changedFiles,
      provider,
      model: "test-model",
    });

    expect(coordinatorPrompt).toContain("(security):");
    expect(coordinatorPrompt).not.toContain("(backend):");
    expect(coordinatorPrompt).not.toContain("(frontend):");
  });

  test("returns a review with a failures section when every specialist fails", async () => {
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
              reasoning: ["Two specialists assigned."],
            },
          };
        }

        throw new Error("specialist provider exploded");
      },
    };

    const result = await runReviewPipeline({
      request: baseRequest,
      files: changedFiles,
      provider,
      model: "test-model",
      retryPolicy: { maxAttempts: 1, delaysMs: [] },
    });

    expect(result.failures).toHaveLength(2);
    expect(result.failures.map((failure) => failure.agent.kind).sort()).toEqual(["backend", "security"]);
    expect(result.report.findings).toHaveLength(0);
    expect(result.markdown).toContain("## Specialists that failed");
    expect(result.markdown).toContain("No actionable findings after consensus filtering.");
  });

  test("short-circuits on empty files without calling the provider", async () => {
    let providerCalled = false;

    const provider: ProviderClient = {
      kind: "custom",
      async generateText() {
        providerCalled = true;
        return { text: "unused" };
      },
      async generateObject() {
        providerCalled = true;
        return { object: {} };
      },
    };

    const result = await runReviewPipeline({
      request: baseRequest,
      files: [],
      provider,
      model: "test-model",
    });

    expect(providerCalled).toBe(false);
    expect(result.plan.routeSource).toBe("auto");
    expect(result.report.findings).toHaveLength(0);
    expect(result.failures).toHaveLength(0);
    expect(result.markdown).toContain("# asyncs review");
    expect(result.markdown).toContain("No actionable findings after consensus filtering.");
  });
});
