import { describe, expect, test } from "bun:test";
import {
  BUILT_IN_AGENT_DEFINITIONS,
  BUILT_IN_AGENT_KINDS,
  CLASSIFIER_AGENT_KIND,
  buildClassifierAgentInput,
  getBuiltInAgentDefinition,
  getClassifierAgentDefinition,
  isBuiltInAgentKind,
  listBuiltInAgentDefinitions,
  type ClassifierAgentOutput,
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

describe("classifier agent contract", () => {
  test("exports classifier agent metadata separately from review agents", () => {
    const classifierAgent = getClassifierAgentDefinition();

    expect(CLASSIFIER_AGENT_KIND).toBe("classifier");
    expect(classifierAgent.kind).toBe("classifier");
    expect(classifierAgent.name).toBe("Classifier Agent");
    expect(classifierAgent.systemPrompt.join("\n")).toContain("Do not depend on an exhaustive language");
    expect(isBuiltInAgentKind(classifierAgent.kind)).toBe(false);
  });

  test("builds classifier agent input without deterministic language rules", () => {
    const files = [
      {
        path: "services/payments/retry.flow",
        status: "modified",
        additions: 12,
        deletions: 3,
        patch: "@@ retry payment orchestration",
      },
    ] as const;

    const input = buildClassifierAgentInput({
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

  test("defines classifier agent output contract", () => {
    const output = {
      labels: ["payments", "retry-flow"],
      suggestedAgents: ["backend", "security", "testing"],
      confidence: "high",
      reasoning: ["Payment retry changes should be reviewed for correctness and safety."],
    } satisfies ClassifierAgentOutput;

    expect(output.suggestedAgents).toContain("backend");
    expect(output.confidence).toBe("high");
  });
});
