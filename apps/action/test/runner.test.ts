import { describe, expect, test } from "bun:test";
import type { ChangedFile, ReviewRequest } from "@asyncs/core";
import type { LoadLocalDiffOptions, LocalDiffResult } from "@asyncs/diff";
import type { ProviderClient, ProviderGenerateObjectRequest } from "@asyncs/providers";
import { reviewDiff } from "../src/runner";

const baseRequest: ReviewRequest = {
  prNumber: 7,
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

function fakeDiffResult(files: ChangedFile[]): LocalDiffResult {
  return {
    baseRef: "main",
    headRef: "feature",
    files,
    skippedBinaries: [],
  };
}

function createReviewingProvider(): ProviderClient {
  return {
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
            ],
            confidence: "high",
            reasoning: ["Retry changes need review."],
          },
        };
      }

      return {
        object: {
          findings: [
            {
              agent: "backend",
              title: "Retry path lacks idempotency",
              message: "Retrying the charge without an idempotency key risks duplicate charges.",
              severity: "high",
              confidence: "high",
              file: "src/payments/retry.ts",
              line: 10,
              evidence: "The patch calls chargeWithRetry without an idempotency key.",
              recommendation: "Pass a stable idempotency key into chargeWithRetry.",
            },
          ],
          summary: "Reviewed retry assignment.",
        },
      };
    },
  };
}

describe("reviewDiff", () => {
  test("loads the diff with the given mode and runs the live pipeline", async () => {
    const seenOptions: LoadLocalDiffOptions[] = [];
    const diffResult = fakeDiffResult(changedFiles);

    const run = await reviewDiff({
      request: baseRequest,
      diff: { kind: "commitRange", from: "main", to: "feature" },
      provider: createReviewingProvider(),
      model: "test-model",
      cwd: "/tmp/repo",
      loadDiff: async (options) => {
        seenOptions.push(options);
        return diffResult;
      },
    });

    expect(seenOptions).toHaveLength(1);
    expect(seenOptions[0]).toEqual({
      mode: { kind: "commitRange", from: "main", to: "feature" },
      cwd: "/tmp/repo",
    });
    expect(run.diff).toBe(diffResult);
    expect(run.result.plan.routeSource).toBe("coordinator");
    expect(run.result.report.findings).toHaveLength(1);
    expect(run.result.markdown).toContain("### Backend - Retry path lacks idempotency");
  });

  test("short-circuits on an empty diff without calling the provider", async () => {
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

    const run = await reviewDiff({
      request: baseRequest,
      diff: { kind: "workingTree" },
      provider,
      model: "test-model",
      loadDiff: async () => fakeDiffResult([]),
    });

    expect(providerCalled).toBe(false);
    expect(run.diff.files).toHaveLength(0);
    expect(run.result.report.findings).toHaveLength(0);
    expect(run.result.markdown).toContain("No actionable findings after consensus filtering.");
  });
});
