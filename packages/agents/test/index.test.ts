import { describe, expect, test } from "bun:test";
import {
  BUILT_IN_AGENT_DEFINITIONS,
  BUILT_IN_AGENT_KINDS,
  COORDINATOR_AGENT_KIND,
  buildCoordinatorAgentInput,
  getBuiltInAgentDefinition,
  getCoordinatorAgentDefinition,
  isBuiltInAgentKind,
  listBuiltInAgentDefinitions,
  type CoordinatorAgentOutput,
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
});
