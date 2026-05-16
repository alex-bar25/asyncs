import type { AgentKind, ChangedFile, Confidence } from "@asyncs/core";
import type { BUILT_IN_AGENT_KINDS, CLASSIFIER_AGENT_KIND } from "./constants";

export type BuiltInAgentKind = (typeof BUILT_IN_AGENT_KINDS)[number];

export type ClassifierAgentKind = typeof CLASSIFIER_AGENT_KIND;

export type ClassifierAgentDefinition = {
  kind: ClassifierAgentKind;
  name: string;
  purpose: string;
  systemPrompt: readonly string[];
};

export type ClassifierAgentInput = {
  files: readonly ChangedFile[];
  availableAgents: readonly AgentKind[];
  manifests: Readonly<Record<string, string>>;
  repository?: string;
  configSummary?: string;
};

export type ClassifierAgentInputOptions = {
  files: readonly ChangedFile[];
  availableAgents?: readonly AgentKind[];
  manifests?: Readonly<Record<string, string>>;
  repository?: string;
  configSummary?: string;
};

export type ClassifierAgentOutput = {
  labels: readonly string[];
  suggestedAgents: readonly AgentKind[];
  confidence: Confidence;
  reasoning: readonly string[];
};
