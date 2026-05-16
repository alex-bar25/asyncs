import { describe, expect, test } from "bun:test";
import {
  BUILT_IN_AGENT_DEFINITIONS,
  BUILT_IN_AGENT_KINDS,
  getBuiltInAgentDefinition,
  isBuiltInAgentKind,
  listBuiltInAgentDefinitions,
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
