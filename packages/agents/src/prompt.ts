import type { ProviderMessage } from "@asyncs/providers";
import {
  BUILT_IN_AGENT_DEFINITIONS,
  COORDINATOR_AGENT_DECISION_RULES,
  COORDINATOR_AGENT_OUTPUT_CONTRACT,
  COORDINATOR_AGENT_SYSTEM_PROMPT,
  SPECIALIST_AGENT_OUTPUT_CONTRACT,
  SPECIALIST_AGENT_SYSTEM_RULES,
} from "./constants";
import type { CoordinatorAgentInput, SpecialistAgentInput } from "./types";

export function buildCoordinatorAgentMessages(input: CoordinatorAgentInput): ProviderMessage[] {
  return [
    {
      role: "system",
      content: buildCoordinatorSystemPrompt(),
    },
    {
      role: "user",
      content: buildCoordinatorUserPrompt(input),
    },
  ];
}

function buildCoordinatorSystemPrompt(): string {
  return [
    ...COORDINATOR_AGENT_SYSTEM_PROMPT,
    "",
    "Decision rules:",
    ...COORDINATOR_AGENT_DECISION_RULES.map((rule) => `- ${rule}`),
    "",
    "Output contract:",
    ...COORDINATOR_AGENT_OUTPUT_CONTRACT,
  ].join("\n");
}

function buildCoordinatorUserPrompt(input: CoordinatorAgentInput): string {
  return [
    `Repository: ${input.repository ?? "unknown"}`,
    "",
    "Config summary:",
    input.configSummary ?? "No config summary provided.",
    "",
    "Available specialist agents:",
    formatAvailableAgents(input),
    "",
    "Repository manifests and context:",
    formatManifests(input.manifests),
    "",
    "Changed files and patch excerpts:",
    formatChangedFiles(input),
  ].join("\n");
}

function formatAvailableAgents(input: CoordinatorAgentInput): string {
  return input.availableAgents
    .map((agentKind) => {
      const definition = BUILT_IN_AGENT_DEFINITIONS.find((agent) => agent.kind === agentKind);

      if (definition === undefined) {
        return `- ${agentKind}: Custom or plugin-provided review agent.`;
      }

      return `- ${definition.name} (${definition.kind}): ${definition.purpose}`;
    })
    .join("\n");
}

function formatManifests(manifests: CoordinatorAgentInput["manifests"]): string {
  const entries = Object.entries(manifests);

  if (entries.length === 0) {
    return "No manifests provided.";
  }

  return entries.map(([path, content]) => [`### ${path}`, fenced(content)].join("\n")).join("\n\n");
}

function formatChangedFiles(input: Pick<CoordinatorAgentInput, "files">): string {
  if (input.files.length === 0) {
    return "No changed files provided.";
  }

  return input.files
    .map((file) =>
      [
        `### ${file.path}`,
        `Status: ${file.status}`,
        `Additions: ${file.additions}`,
        `Deletions: ${file.deletions}`,
        "Patch excerpt:",
        file.patch === undefined ? "No patch excerpt provided." : fenced(file.patch),
      ].join("\n"),
    )
    .join("\n\n");
}

function fenced(content: string): string {
  const longestBacktickRun = (content.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));

  return [fence, content, fence].join("\n");
}

export function buildSpecialistAgentMessages(input: SpecialistAgentInput): ProviderMessage[] {
  return [
    {
      role: "system",
      content: buildSpecialistSystemPrompt(input),
    },
    {
      role: "user",
      content: buildSpecialistUserPrompt(input),
    },
  ];
}

function buildSpecialistSystemPrompt(input: SpecialistAgentInput): string {
  return [
    `You are the ${input.agent.name}.`,
    input.agent.purpose,
    "",
    "Review rules:",
    ...SPECIALIST_AGENT_SYSTEM_RULES.map((rule) => `- ${rule}`),
    "",
    "Output contract:",
    ...SPECIALIST_AGENT_OUTPUT_CONTRACT,
  ].join("\n");
}

function buildSpecialistUserPrompt(input: SpecialistAgentInput): string {
  return [
    `Repository: ${input.repository ?? "unknown"}`,
    `Review mode: ${input.mode ?? "low-noise"}`,
    "",
    "Coordinator assignment:",
    `Purpose: ${input.assignment.purpose}`,
    `Context: ${input.assignment.context}`,
    `Focus areas: ${input.assignment.focusAreas.join(", ") || "none"}`,
    `Assigned files: ${input.assignment.files.join(", ") || "none"}`,
    "",
    "Changed files and patch excerpts:",
    formatChangedFiles(input),
  ].join("\n");
}
