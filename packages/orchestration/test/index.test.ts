import { describe, expect, test } from "bun:test";
import type { ReviewRequest } from "@asyncs/core";
import type { ProviderGenerateObjectRequest } from "@asyncs/providers";
import {
  createCoordinatedReviewRunPlan,
  createReviewRunPlan,
  executeSpecialistAssignments,
  type ReviewRunPlan,
} from "../src/index";

const baseRequest: ReviewRequest = {
  mode: "low-noise",
  agents: [],
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
        async generateObject(request: ProviderGenerateObjectRequest) {
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
            },
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

  test("executes coordinator assignments with specialist agents", async () => {
    const plan = createReviewRunPlan({
      request: baseRequest,
      coordinatorOutput: {
        labels: ["payments"],
        assignments: [
          {
            agent: "backend",
            purpose: "Review payment retry correctness.",
            files: ["services/payments/retry.ts"],
            focusAreas: ["retry behavior"],
            context: "Payment retry behavior changed.",
          },
          {
            agent: "custom",
            purpose: "Custom plugin review.",
            files: ["services/payments/retry.ts"],
            focusAreas: ["custom policy"],
            context: "No built-in definition exists yet.",
          },
        ],
        confidence: "high",
        reasoning: ["Coordinator selected backend and custom review."],
      },
    });
    const calledSchemas: string[] = [];
    const result = await executeSpecialistAssignments({
      plan,
      files: [
        {
          path: "services/payments/retry.ts",
          status: "modified",
          additions: 10,
          deletions: 2,
          patch: "@@ retryPayment\n+ await chargeWithRetry(orderId)",
        },
      ],
      model: "specialist-test-model",
      provider: {
        kind: "custom",
        async generateText() {
          return { text: "unused" };
        },
        async generateObject(request: ProviderGenerateObjectRequest) {
          calledSchemas.push(request.schemaName);

          return {
            object: {
              findings: [
                {
                  agent: "backend",
                  title: "Retry path needs idempotency evidence",
                  message: "The retry path should show how duplicate charges are prevented.",
                  severity: "high",
                  confidence: "medium",
                  file: "services/payments/retry.ts",
                  evidence: "The patch calls chargeWithRetry in retryPayment.",
                  recommendation: "Preserve or add an idempotency key around retries.",
                },
              ],
              summary: "Backend reviewed the retry assignment.",
            },
          };
        },
      },
    });

    expect(calledSchemas).toEqual(["SpecialistAgentOutput"]);
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]?.agent.kind).toBe("backend");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.title).toBe("Retry path needs idempotency evidence");
  });

  test("partitions a failing specialist into failures with attempts", async () => {
    const plan = createReviewRunPlan({
      request: baseRequest,
      coordinatorOutput: {
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
        reasoning: ["Coordinator selected backend review."],
      },
    });

    const result = await executeSpecialistAssignments({
      plan,
      files: [
        {
          path: "services/payments/retry.ts",
          status: "modified",
          additions: 1,
          deletions: 0,
          patch: "@@ change",
        },
      ],
      model: "specialist-test-model",
      retryPolicy: { maxAttempts: 1, delaysMs: [] },
      timeoutMs: 5_000,
      provider: {
        kind: "custom",
        async generateText() {
          return { text: "unused" };
        },
        async generateObject() {
          throw new Error("non-transient failure");
        },
      },
    });

    expect(result.runs).toHaveLength(0);
    expect(result.findings).toHaveLength(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.agent.kind).toBe("backend");
    expect(result.failures[0]?.attempts).toBe(1);
    expect(result.failures[0]?.error).toContain("non-transient failure");
  });

  test("retries the coordinator on transient errors and succeeds on second attempt", async () => {
    let calls = 0;

    const plan = await createCoordinatedReviewRunPlan({
      request: baseRequest,
      coordinatorInput: {
        files: [
          {
            path: "services/payments/retry.ts",
            status: "modified",
            additions: 1,
            deletions: 0,
          },
        ],
        availableAgents: ["backend"],
        manifests: {},
      },
      coordinatorModel: "coordinator-test-model",
      retryPolicy: { maxAttempts: 3, delaysMs: [1, 1] },
      timeoutMs: 5_000,
      provider: {
        kind: "custom",
        async generateText() {
          return { text: "unused" };
        },
        async generateObject() {
          calls += 1;
          if (calls === 1) {
            const err: Error & { status?: number } = new Error("429");
            err.status = 429;
            throw err;
          }
          return {
            object: {
              labels: ["payments"],
              assignments: [
                {
                  agent: "backend",
                  purpose: "Review retry correctness.",
                  files: ["services/payments/retry.ts"],
                  focusAreas: ["retry behavior"],
                  context: "Retry changed.",
                },
              ],
              confidence: "high",
              reasoning: ["Recovered after one transient failure."],
            },
          };
        },
      },
    });

    expect(calls).toBe(2);
    expect(plan.routeSource).toBe("coordinator");
    expect(plan.agents.map((agent) => agent.kind)).toEqual(["backend"]);
  });

  test("rethrows when the coordinator fails after retries are exhausted", async () => {
    await expect(
      createCoordinatedReviewRunPlan({
        request: baseRequest,
        coordinatorInput: { files: [], availableAgents: ["backend"], manifests: {} },
        coordinatorModel: "coordinator-test-model",
        retryPolicy: { maxAttempts: 2, delaysMs: [1] },
        timeoutMs: 5_000,
        provider: {
          kind: "custom",
          async generateText() {
            return { text: "unused" };
          },
          async generateObject() {
            const err: Error & { status?: number } = new Error("503");
            err.status = 503;
            throw err;
          },
        },
      }),
    ).rejects.toThrow();
  });

  test("respects the concurrency cap when running specialists", async () => {
    const plan = createReviewRunPlan({
      request: baseRequest,
      coordinatorOutput: {
        labels: ["multi"],
        assignments: [
          {
            agent: "backend",
            purpose: "Review.",
            files: [],
            focusAreas: [],
            context: "",
          },
          {
            agent: "frontend",
            purpose: "Review.",
            files: [],
            focusAreas: [],
            context: "",
          },
          {
            agent: "security",
            purpose: "Review.",
            files: [],
            focusAreas: [],
            context: "",
          },
          {
            agent: "architecture",
            purpose: "Review.",
            files: [],
            focusAreas: [],
            context: "",
          },
        ],
        confidence: "high",
        reasoning: ["wide review"],
      },
    });

    let inFlight = 0;
    let observedMax = 0;

    const result = await executeSpecialistAssignments({
      plan,
      files: [],
      model: "specialist-test-model",
      concurrency: 2,
      timeoutMs: 5_000,
      retryPolicy: { maxAttempts: 1, delaysMs: [] },
      provider: {
        kind: "custom",
        async generateText() {
          return { text: "unused" };
        },
        async generateObject() {
          inFlight += 1;
          observedMax = Math.max(observedMax, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 20));
          inFlight -= 1;
          return {
            object: {
              findings: [],
              summary: "ok",
            },
          };
        },
      },
    });

    expect(observedMax).toBeLessThanOrEqual(2);
    expect(observedMax).toBe(2);
    expect(result.runs).toHaveLength(4);
    expect(result.failures).toHaveLength(0);
  });

  test("classifies a timeout as transient and retries until exhaustion", async () => {
    const plan = createReviewRunPlan({
      request: baseRequest,
      coordinatorOutput: {
        labels: ["payments"],
        assignments: [
          {
            agent: "backend",
            purpose: "Review.",
            files: [],
            focusAreas: [],
            context: "",
          },
        ],
        confidence: "high",
        reasoning: ["one specialist"],
      },
    });

    const result = await executeSpecialistAssignments({
      plan,
      files: [],
      model: "specialist-test-model",
      concurrency: 1,
      timeoutMs: 10,
      retryPolicy: { maxAttempts: 2, delaysMs: [1] },
      provider: {
        kind: "custom",
        async generateText() {
          return { text: "unused" };
        },
        async generateObject(request) {
          return new Promise((_, reject) => {
            request.signal?.addEventListener("abort", () => {
              const error = new Error("aborted by signal");
              error.name = "AbortError";
              reject(error);
            });
          });
        },
      },
    });

    expect(result.runs).toHaveLength(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.attempts).toBe(2);
    expect(result.failures[0]?.error).toContain("Timed out after 10ms");
  });
});
