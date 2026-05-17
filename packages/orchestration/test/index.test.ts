import { describe, expect, test } from "bun:test";
import type { ReviewRequest } from "@asyncs/core";
import type { ProviderGenerateObjectRequest } from "@asyncs/providers";
import { createCoordinatedReviewRunPlan, createReviewRunPlan, type ReviewRunPlan } from "../src/index";

const baseRequest: ReviewRequest = {
  prNumber: 3213,
  mode: "low-noise",
  agents: [],
  postComments: false,
  dryRun: true,
};

describe("review run planning", () => {
  test("uses explicit request agents before coordinator assignments", () => {
    const plan = createReviewRunPlan({
      request: {
        ...baseRequest,
        agents: ["security"],
      },
      coordinatorOutput: {
        labels: ["backend-change"],
        assignments: [
          {
            agent: "backend",
            purpose: "Review backend behavior.",
            files: ["services/payments/retry.flow"],
            focusAreas: ["retry behavior"],
            context: "The coordinator sees backend behavior changes.",
          },
        ],
        confidence: "high",
        reasoning: ["The coordinator sees backend behavior changes."],
      },
    });

    expect(plan.routeSource).toBe("explicit");
    expect(plan.agents.map((agent) => agent.kind)).toEqual(["security"]);
  });

  test("uses coordinator assignments when no agents are explicit", () => {
    const plan = createReviewRunPlan({
      request: baseRequest,
      coordinatorOutput: {
        labels: ["payments", "retry-flow"],
        assignments: [
          {
            agent: "backend",
            purpose: "Review payment retry correctness.",
            files: ["services/payments/retry.flow"],
            focusAreas: ["retry behavior", "idempotency"],
            context: "Payment retry orchestration changed.",
          },
          {
            agent: "security",
            purpose: "Review money movement safety.",
            files: ["services/payments/retry.flow"],
            focusAreas: ["authorization", "duplicate charge risk"],
            context: "Payment retries can create repeated charge risk.",
          },
          {
            agent: "testing",
            purpose: "Review coverage for retry edge cases.",
            files: ["services/payments/retry.flow"],
            focusAreas: ["failure paths", "duplicate event handling"],
            context: "Retry behavior changed and needs regression coverage.",
          },
        ],
        confidence: "high",
        reasoning: ["Payment retry changes need correctness, safety, and coverage review."],
      },
    });

    expect(plan.routeSource).toBe("coordinator");
    expect(plan.agents.map((agent) => agent.kind)).toEqual(["backend", "security", "testing"]);
    expect(plan.coordinatorOutput?.confidence).toBe("high");
  });

  test("falls back to mode defaults without coordinator assignments", () => {
    const plan = createReviewRunPlan({
      request: {
        ...baseRequest,
        mode: "architecture",
      },
    });

    expect(plan.routeSource).toBe("auto");
    expect(plan.agents.map((agent) => agent.kind)).toEqual(["architecture"]);
  });

  test("exports the review run plan contract", () => {
    const plan = {
      request: baseRequest,
      routeSource: "auto",
      agents: [],
    } satisfies ReviewRunPlan;

    expect(plan.routeSource).toBe("auto");
  });

  test("runs the coordinator agent before building a run plan", async () => {
    let capturedModel = "";
    let capturedMessageText = "";

    const plan = await createCoordinatedReviewRunPlan({
      request: baseRequest,
      coordinatorInput: {
        files: [
          {
            path: "services/payments/retry.ts",
            status: "modified",
            additions: 10,
            deletions: 2,
            patch: "@@ retryPayment",
          },
        ],
        availableAgents: ["backend", "security"],
        manifests: {},
      },
      coordinatorModel: "coordinator-test-model",
      provider: {
        kind: "custom",
        async generateText() {
          return { text: "unused" };
        },
        async generateObject<TObject>(request: ProviderGenerateObjectRequest) {
          capturedModel = request.model;
          capturedMessageText = request.messages.map((message) => message.content).join("\n");

          return {
            object: {
              labels: ["payments"],
              assignments: [
                {
                  agent: "backend",
                  purpose: "Review payment retry correctness.",
                  files: ["services/payments/retry.ts"],
                  focusAreas: ["retry behavior"],
                  context: "Payment retry behavior changed.",
                },
              ],
              confidence: "high",
              reasoning: ["Coordinator selected backend review for retry behavior."],
            } as TObject,
          };
        },
      },
    });

    expect(capturedModel).toBe("coordinator-test-model");
    expect(capturedMessageText).toContain("leader/planner for the asyncs review swarm");
    expect(capturedMessageText).toContain("services/payments/retry.ts");
    expect(plan.routeSource).toBe("coordinator");
    expect(plan.agents.map((agent) => agent.kind)).toEqual(["backend"]);
    expect(plan.coordinatorOutput?.labels).toEqual(["payments"]);
  });
});
