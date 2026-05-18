import { describe, expect, test } from "bun:test";
import type { ProviderGenerateObjectRequest } from "@asyncs/providers";
import {
  BUILT_IN_AGENT_DEFINITIONS,
  BUILT_IN_AGENT_KINDS,
  COORDINATOR_AGENT_KIND,
  COORDINATOR_AGENT_OUTPUT_SCHEMA_NAME,
  SPECIALIST_AGENT_OUTPUT_SCHEMA_NAME,
  buildCoordinatorAgentInput,
  buildCoordinatorAgentMessages,
  buildSpecialistAgentMessages,
  getBuiltInAgentDefinition,
  getCoordinatorAgentDefinition,
  isBuiltInAgentKind,
  listBuiltInAgentDefinitions,
  runCoordinatorAgent,
  runSpecialistAgent,
  type CoordinatorAgentOutput,
  type SpecialistAgentOutput,
} from "../src/index";

describe("built-in agent definitions", () => {
  test("exports the built-in agent kinds in review order", () => {
    expect(BUILT_IN_AGENT_KINDS).toEqual([
      "backend",
      "frontend",
      "security",
      "architecture",
      "testing",
      "performance",
      "devops",
    ]);
  });

  test("exports definitions for every built-in agent kind", () => {
    expect(BUILT_IN_AGENT_DEFINITIONS).toHaveLength(BUILT_IN_AGENT_KINDS.length);
    expect(BUILT_IN_AGENT_DEFINITIONS.map((agent) => agent.kind)).toEqual([...BUILT_IN_AGENT_KINDS]);
  });

  test("looks up an agent definition by kind", () => {
    const securityAgent = getBuiltInAgentDefinition("security");

    expect(securityAgent?.name).toBe("Security Agent");
    expect(securityAgent?.purpose).toContain("auth");
  });

  test("checks whether an agent kind is built in", () => {
    expect(isBuiltInAgentKind("backend")).toBe(true);
    expect(isBuiltInAgentKind("custom")).toBe(false);
  });

  test("returns a copy of the built-in definitions", () => {
    const definitions = listBuiltInAgentDefinitions();

    definitions.pop();

    expect(definitions).toHaveLength(BUILT_IN_AGENT_KINDS.length - 1);
    expect(listBuiltInAgentDefinitions()).toHaveLength(BUILT_IN_AGENT_KINDS.length);
  });
});

describe("coordinator agent contract", () => {
  test("exports coordinator agent metadata separately from review agents", () => {
    const coordinatorAgent = getCoordinatorAgentDefinition();

    expect(COORDINATOR_AGENT_KIND).toBe("coordinator");
    expect(coordinatorAgent.kind).toBe("coordinator");
    expect(coordinatorAgent.name).toBe("Coordinator Agent");
    expect(coordinatorAgent.systemPrompt.join("\n")).toContain("Prepare focused assignments");
    expect(isBuiltInAgentKind(coordinatorAgent.kind)).toBe(false);
  });

  test("builds coordinator agent input without deterministic language rules", () => {
    const files = [
      {
        path: "services/payments/retry.flow",
        status: "modified",
        additions: 12,
        deletions: 3,
        patch: "@@ retry payment orchestration",
      },
    ] as const;

    const input = buildCoordinatorAgentInput({
      files,
      repository: "alex/payments",
      manifests: {
        "repo-map.txt": "payments service owns retry orchestration",
      },
    });

    expect(input.files).toBe(files);
    expect(input.repository).toBe("alex/payments");
    expect(input.availableAgents).toEqual([...BUILT_IN_AGENT_KINDS]);
    expect(input.manifests["repo-map.txt"]).toContain("payments service");
  });

  test("defines coordinator agent output contract with focused assignments", () => {
    const output = {
      labels: ["payments", "retry-flow"],
      assignments: [
        {
          agent: "backend",
          purpose: "Review payment retry correctness and idempotency.",
          files: ["services/payments/retry.flow"],
          focusAreas: ["retry behavior", "idempotency"],
          context: "Payment retry orchestration changed.",
        },
        {
          agent: "security",
          purpose: "Review unsafe repeated charge or authorization risks.",
          files: ["services/payments/retry.flow"],
          focusAreas: ["authorization", "duplicate charge risk"],
          context: "Payment retry behavior can affect money movement safety.",
        },
      ],
      confidence: "high",
      reasoning: ["Payment retry changes should be split between backend and security review."],
    } satisfies CoordinatorAgentOutput;

    expect(output.assignments.map((assignment) => assignment.agent)).toEqual(["backend", "security"]);
    expect(output.confidence).toBe("high");
  });

  test("builds a rich coordinator prompt from review context", () => {
    const input = buildCoordinatorAgentInput({
      files: [
        {
          path: "services/payments/retry.ts",
          status: "modified",
          additions: 24,
          deletions: 6,
          patch: "@@ retryPayment\n+ await chargeWithRetry(orderId)",
        },
        {
          path: ".github/workflows/review.yml",
          status: "added",
          additions: 18,
          deletions: 0,
        },
      ],
      repository: "alex/payments",
      configSummary: "low-noise mode; prefer high-confidence production-impacting findings",
      manifests: {
        "package.json": '{ "dependencies": { "stripe": "^18.0.0" } }',
      },
    });

    const messages = buildCoordinatorAgentMessages(input);
    const systemMessage = messages[0]?.content ?? "";
    const userMessage = messages[1]?.content ?? "";

    expect(messages.map((message) => message.role)).toEqual(["system", "user"]);
    expect(systemMessage).toContain("leader/planner for the asyncs review swarm");
    expect(systemMessage).toContain("Do not write review findings");
    expect(systemMessage).toContain("assignments");
    expect(systemMessage).toContain("purpose");
    expect(systemMessage).toContain("focusAreas");
    expect(systemMessage).toContain("context");
    expect(systemMessage).toContain("Only assign an agent when its domain is materially relevant");
    expect(userMessage).toContain("Repository: alex/payments");
    expect(userMessage).toContain("Available specialist agents");
    expect(userMessage).toContain("Backend Agent");
    expect(userMessage).toContain("Security Agent");
    expect(userMessage).toContain("low-noise mode");
    expect(userMessage).toContain("package.json");
    expect(userMessage).toContain("services/payments/retry.ts");
    expect(userMessage).toContain("chargeWithRetry");
    expect(userMessage).toContain(".github/workflows/review.yml");
  });

  test("runs the coordinator agent through a structured provider", async () => {
    const input = buildCoordinatorAgentInput({
      files: [
        {
          path: "services/payments/retry.ts",
          status: "modified",
          additions: 24,
          deletions: 6,
        },
      ],
    });
    const output: CoordinatorAgentOutput = {
      labels: ["payments"],
      assignments: [
        {
          agent: "backend",
          purpose: "Review retry correctness.",
          files: ["services/payments/retry.ts"],
          focusAreas: ["retry behavior"],
          context: "Payment retry code changed.",
        },
      ],
      confidence: "high",
      reasoning: ["Payment retry behavior changed."],
    };
    let capturedModel = "";
    let capturedSchemaName = "";
    let capturedMessageText = "";

    const result = await runCoordinatorAgent({
      input,
      model: "coordinator-test-model",
      provider: {
        kind: "custom",
        async generateText() {
          return { text: "unused" };
        },
        async generateObject<TObject>(request: ProviderGenerateObjectRequest) {
          capturedModel = request.model;
          capturedSchemaName = request.schemaName;
          capturedMessageText = request.messages.map((message) => message.content).join("\n");

          return {
            object: output as TObject,
            rawText: '{"labels":["payments"]}',
            usage: {
              inputTokens: 10,
              outputTokens: 20,
            },
          };
        },
      },
    });

    expect(capturedModel).toBe("coordinator-test-model");
    expect(capturedSchemaName).toBe(COORDINATOR_AGENT_OUTPUT_SCHEMA_NAME);
    expect(capturedMessageText).toContain("leader/planner for the asyncs review swarm");
    expect(capturedMessageText).toContain("services/payments/retry.ts");
    expect(result.output).toBe(output);
    expect(result.rawText).toBe('{"labels":["payments"]}');
    expect(result.usage?.outputTokens).toBe(20);
  });

  test("fails clearly when the provider cannot generate structured output", async () => {
    const input = buildCoordinatorAgentInput({
      files: [],
    });

    await expect(
      runCoordinatorAgent({
        input,
        model: "coordinator-test-model",
        provider: {
          kind: "custom",
          async generateText() {
            return { text: "plain text only" };
          },
        },
      }),
    ).rejects.toThrow("Coordinator Agent requires a provider with structured object generation.");
  });
});

describe("specialist agent contract", () => {
  test("builds a focused specialist prompt from an assignment", () => {
    const backendAgent = getBuiltInAgentDefinition("backend");

    if (backendAgent === undefined) {
      throw new Error("Expected backend agent definition.");
    }

    const messages = buildSpecialistAgentMessages({
      agent: backendAgent,
      assignment: {
        agent: "backend",
        purpose: "Review payment retry correctness and idempotency.",
        files: ["services/payments/retry.ts"],
        focusAreas: ["retry behavior", "idempotency", "failure paths"],
        context: "Payment retry behavior changed and may affect duplicate charge safety.",
      },
      files: [
        {
          path: "services/payments/retry.ts",
          status: "modified",
          additions: 24,
          deletions: 6,
          patch: "@@ retryPayment\n+ await chargeWithRetry(orderId)",
        },
      ],
      repository: "alex/payments",
      mode: "low-noise",
    });
    const systemMessage = messages[0]?.content ?? "";
    const userMessage = messages[1]?.content ?? "";

    expect(messages.map((message) => message.role)).toEqual(["system", "user"]);
    expect(systemMessage).toContain("You are the Backend Agent");
    expect(systemMessage).toContain("Stay inside your specialist domain");
    expect(systemMessage).toContain("Every finding must cite concrete evidence");
    expect(systemMessage).toContain("Suppress vague, preference-only, or low-confidence comments");
    expect(systemMessage).toContain("SpecialistAgentOutput");
    expect(userMessage).toContain("Repository: alex/payments");
    expect(userMessage).toContain("Review mode: low-noise");
    expect(userMessage).toContain("Review payment retry correctness and idempotency");
    expect(userMessage).toContain("retry behavior");
    expect(userMessage).toContain("services/payments/retry.ts");
    expect(userMessage).toContain("chargeWithRetry");
  });

  test("runs a specialist agent through a structured provider", async () => {
    const securityAgent = getBuiltInAgentDefinition("security");

    if (securityAgent === undefined) {
      throw new Error("Expected security agent definition.");
    }

    const output: SpecialistAgentOutput = {
      findings: [
        {
          agent: "security",
          title: "Missing authorization check",
          message: "The changed retry path should preserve authorization checks.",
          severity: "high",
          confidence: "medium",
          file: "services/payments/retry.ts",
          line: 42,
          evidence: "The patch calls chargeWithRetry without showing an authorization guard.",
          recommendation: "Confirm the caller is authorized before retrying the charge.",
        },
      ],
      summary: "Security reviewed the payment retry assignment.",
    };
    let capturedModel = "";
    let capturedSchemaName = "";
    let capturedMessageText = "";

    const result = await runSpecialistAgent({
      agent: securityAgent,
      assignment: {
        agent: "security",
        purpose: "Review money movement safety.",
        files: ["services/payments/retry.ts"],
        focusAreas: ["authorization", "duplicate charge risk"],
        context: "Payment retry behavior changed.",
      },
      files: [
        {
          path: "services/payments/retry.ts",
          status: "modified",
          additions: 24,
          deletions: 6,
          patch: "@@ retryPayment\n+ await chargeWithRetry(orderId)",
        },
      ],
      model: "specialist-test-model",
      provider: {
        kind: "custom",
        async generateText() {
          return { text: "unused" };
        },
        async generateObject<TObject>(request: ProviderGenerateObjectRequest) {
          capturedModel = request.model;
          capturedSchemaName = request.schemaName;
          capturedMessageText = request.messages.map((message) => message.content).join("\n");

          return {
            object: output as TObject,
            usage: {
              inputTokens: 11,
              outputTokens: 22,
            },
          };
        },
      },
    });

    expect(capturedModel).toBe("specialist-test-model");
    expect(capturedSchemaName).toBe(SPECIALIST_AGENT_OUTPUT_SCHEMA_NAME);
    expect(capturedMessageText).toContain("Security Agent");
    expect(capturedMessageText).toContain("duplicate charge risk");
    expect(result.output).toBe(output);
    expect(result.usage?.outputTokens).toBe(22);
  });

  test("fails clearly when a specialist provider cannot generate structured output", async () => {
    const testingAgent = getBuiltInAgentDefinition("testing");

    if (testingAgent === undefined) {
      throw new Error("Expected testing agent definition.");
    }

    await expect(
      runSpecialistAgent({
        agent: testingAgent,
        assignment: {
          agent: "testing",
          purpose: "Review coverage.",
          files: [],
          focusAreas: ["regression coverage"],
          context: "No files provided.",
        },
        files: [],
        model: "specialist-test-model",
        provider: {
          kind: "custom",
          async generateText() {
            return { text: "plain text only" };
          },
        },
      }),
    ).rejects.toThrow("Specialist Agent requires a provider with structured object generation.");
  });
});
