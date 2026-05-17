import type { AgentKind, ChangedFile, Confidence } from "@asyncs/core";
import type { ProviderClient, ProviderUsage } from "@asyncs/providers";
import type { BUILT_IN_AGENT_KINDS, COORDINATOR_AGENT_KIND } from "./constants";

export type BuiltInAgentKind = (typeof BUILT_IN_AGENT_KINDS)[number];

export type CoordinatorAgentKind = typeof COORDINATOR_AGENT_KIND;

export type CoordinatorAgentDefinition = {
  kind: CoordinatorAgentKind;
  name: string;
  purpose: string;
  systemPrompt: readonly string[];
};

export type CoordinatorAgentInput = {
  files: readonly ChangedFile[];
  availableAgents: readonly AgentKind[];
  manifests: Readonly<Record<string, string>>;
  repository?: string;
  configSummary?: string;
};

export type CoordinatorAgentInputOptions = {
  files: readonly ChangedFile[];
  availableAgents?: readonly AgentKind[];
  manifests?: Readonly<Record<string, string>>;
  repository?: string;
  configSummary?: string;
};

export type AgentAssignment = {
  agent: AgentKind;
  purpose: string;
  files: readonly string[];
  focusAreas: readonly string[];
  context: string;
};

export type CoordinatorAgentOutput = {
  labels: readonly string[];
  assignments: readonly AgentAssignment[];
  confidence: Confidence;
  reasoning: readonly string[];
};

export type RunCoordinatorAgentOptions = {
  input: CoordinatorAgentInput;
  model: string;
  provider: ProviderClient;
};

export type CoordinatorAgentRunResult = {
  output: CoordinatorAgentOutput;
  usage?: ProviderUsage;
  rawText?: string;
};
