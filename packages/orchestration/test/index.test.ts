import { describe, expect, test } from "bun:test";
import type { ReviewRequest } from "@asyncs/core";
import { createReviewRunPlan, type ReviewRunPlan } from "../src/index";

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
});
