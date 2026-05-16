import type { AgentDefinition } from "@asyncs/core";
import { BUILT_IN_AGENT_DEFINITIONS } from "./constants";
import type { BuiltInAgentKind } from "./types";

export function listBuiltInAgentDefinitions(): AgentDefinition[] {
  return [...BUILT_IN_AGENT_DEFINITIONS];
}

export function getBuiltInAgentDefinition(kind: BuiltInAgentKind): AgentDefinition | undefined {
  return BUILT_IN_AGENT_DEFINITIONS.find((agent) => agent.kind === kind);
}
