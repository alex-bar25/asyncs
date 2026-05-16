import type { AgentDefinition } from "@asyncs/core";
import {
  BUILT_IN_AGENT_DEFINITIONS,
  BUILT_IN_AGENT_KINDS,
  CLASSIFIER_AGENT_DEFINITION,
  DEFAULT_CLASSIFIER_AVAILABLE_AGENTS,
} from "./constants";
import type {
  BuiltInAgentKind,
  ClassifierAgentDefinition,
  ClassifierAgentInput,
  ClassifierAgentInputOptions,
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

export function getClassifierAgentDefinition(): ClassifierAgentDefinition {
  return CLASSIFIER_AGENT_DEFINITION;
}

export function buildClassifierAgentInput(options: ClassifierAgentInputOptions): ClassifierAgentInput {
  return {
    files: options.files,
    availableAgents: options.availableAgents ?? DEFAULT_CLASSIFIER_AVAILABLE_AGENTS,
    manifests: options.manifests ?? {},
    ...(options.repository === undefined ? {} : { repository: options.repository }),
    ...(options.configSummary === undefined ? {} : { configSummary: options.configSummary }),
  };
}
