import type { AgentDefinition } from "@asyncs/core";
import {
  BUILT_IN_AGENT_DEFINITIONS,
  BUILT_IN_AGENT_KINDS,
  COORDINATOR_AGENT_DEFINITION,
  DEFAULT_COORDINATOR_AVAILABLE_AGENTS,
} from "./constants";
import type {
  BuiltInAgentKind,
  CoordinatorAgentDefinition,
  CoordinatorAgentInput,
  CoordinatorAgentInputOptions,
} from "./types";

export function listBuiltInAgentDefinitions(): AgentDefinition[] {
  return [...BUILT_IN_AGENT_DEFINITIONS];
}

export function getBuiltInAgentDefinition(kind: BuiltInAgentKind): AgentDefinition | undefined {
  return BUILT_IN_AGENT_DEFINITIONS.find((agent) => agent.kind === kind);
}

export function isBuiltInAgentKind(kind: string): kind is BuiltInAgentKind {
  return BUILT_IN_AGENT_KINDS.includes(kind as BuiltInAgentKind);
}

export function getCoordinatorAgentDefinition(): CoordinatorAgentDefinition {
  return COORDINATOR_AGENT_DEFINITION;
}

export function buildCoordinatorAgentInput(options: CoordinatorAgentInputOptions): CoordinatorAgentInput {
  return {
    files: options.files,
    availableAgents: options.availableAgents ?? DEFAULT_COORDINATOR_AVAILABLE_AGENTS,
    manifests: options.manifests ?? {},
    ...(options.repository === undefined ? {} : { repository: options.repository }),
    ...(options.configSummary === undefined ? {} : { configSummary: options.configSummary }),
  };
}
