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
  test("uses explicit request agents before classifier recommendations", () => {
    const plan = createReviewRunPlan({
      request: {
        ...baseRequest,
        agents: ["security"],
      },
      classifierOutput: {
        labels: ["backend-change"],
        suggestedAgents: ["backend", "testing"],
        confidence: "high",
        reasoning: ["The classifier sees backend behavior changes."],
      },
    });

    expect(plan.routeSource).toBe("explicit");
    expect(plan.agents.map((agent) => agent.kind)).toEqual(["security"]);
  });

  test("uses classifier recommendations when no agents are explicit", () => {
    const plan = createReviewRunPlan({
      request: baseRequest,
      classifierOutput: {
        labels: ["payments", "retry-flow"],
        suggestedAgents: ["backend", "security", "testing"],
        confidence: "high",
        reasoning: ["Payment retry changes need correctness, safety, and coverage review."],
      },
    });

    expect(plan.routeSource).toBe("classifier");
    expect(plan.agents.map((agent) => agent.kind)).toEqual(["backend", "security", "testing"]);
    expect(plan.classifierOutput?.confidence).toBe("high");
  });

  test("falls back to mode defaults without classifier recommendations", () => {
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
