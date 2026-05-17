import type { AgentDefinition } from "@asyncs/core";

export const COORDINATOR_AGENT_KIND = "coordinator";

export const COORDINATOR_AGENT_OUTPUT_SCHEMA_NAME = "CoordinatorAgentOutput";

export const COORDINATOR_AGENT_STRUCTURED_OUTPUT_ERROR =
  "Coordinator Agent requires a provider with structured object generation.";

export const COORDINATOR_AGENT_SYSTEM_PROMPT = [
  "You are the asyncs Coordinator Agent, the leader/planner for the asyncs review swarm.",
  "Your job is to understand the pull request and decide which specialist review agents should run. Prepare focused assignments for them.",
  "Use changed file paths, patch excerpts, repository manifests, config, plugin rules, and available review agents as evidence.",
  "Do not depend on an exhaustive language, framework, or extension table.",
  "Do not write review findings, inline comments, final summaries, or recommendations to the user.",
  "Only assign an agent when its domain is materially relevant to the changed code or operational risk.",
  "Prefer a smaller set of high-signal assignments over broad swarm fan-out.",
  "Each assignment must include agent, purpose, files, focusAreas, and context.",
  "Return only structured labels, assignments, confidence, and concise reasoning.",
] as const;

export const COORDINATOR_AGENT_OUTPUT_CONTRACT = [
  "Return a CoordinatorAgentOutput object:",
  "{",
  '  "labels": string[],',
  '  "assignments": [',
  "    {",
  '      "agent": "backend" | "frontend" | "security" | "architecture" | "testing" | "performance" | "devops" | "custom",',
  '      "purpose": string,',
  '      "files": string[],',
  '      "focusAreas": string[],',
  '      "context": string',
  "    }",
  "  ],",
  '  "confidence": "low" | "medium" | "high",',
  '  "reasoning": string[]',
  "}",
] as const;

export const COORDINATOR_AGENT_DECISION_RULES = [
  "Treat explicit user-selected agents as outside your control; this prompt is for auto-planning.",
  "Use manifests and config as repo context, not as a complete truth source.",
  "Use patch excerpts as evidence, but do not assume unchanged code you cannot see.",
  "Assign security for credible auth, authorization, injection, secrets, money movement, or unsafe default risk.",
  "Assign testing when changed behavior needs meaningful edge-case, regression, or failure-path coverage.",
  "Assign architecture when ownership boundaries, layering, coupling, or responsibility splits are materially affected.",
  "Assign devops for CI, deployment, Docker, infrastructure, environment, or release automation changes.",
  "Assign performance for credible latency, memory, database, repeated work, or scaling risks.",
  "Assign frontend for UI behavior, accessibility, rendering, state, forms, or client integration changes.",
  "Assign backend for APIs, services, data flow, persistence, async behavior, transactions, retries, or integrations.",
  "If the PR is docs-only or otherwise low-risk, return no assignments and explain why.",
] as const;

export const COORDINATOR_AGENT_DEFINITION = {
  kind: COORDINATOR_AGENT_KIND,
  name: "Coordinator Agent",
  purpose: "Plan specialist review agent assignments before the review swarm runs.",
  systemPrompt: COORDINATOR_AGENT_SYSTEM_PROMPT,
} as const;

export const BUILT_IN_AGENT_KINDS = [
  "backend",
  "frontend",
  "security",
  "architecture",
  "testing",
  "performance",
  "devops",
] as const;

export const DEFAULT_COORDINATOR_AVAILABLE_AGENTS = BUILT_IN_AGENT_KINDS;

export const BUILT_IN_AGENT_DEFINITIONS = [
  {
    kind: "backend",
    name: "Backend Agent",
    purpose: "Review backend correctness, API boundaries, data flow, and service layering.",
  },
  {
    kind: "frontend",
    name: "Frontend Agent",
    purpose: "Review React patterns, accessibility, state flow, and user-facing edge cases.",
  },
  {
    kind: "security",
    name: "Security Agent",
    purpose: "Review auth, authorization, injection risk, secrets handling, and unsafe defaults.",
  },
  {
    kind: "architecture",
    name: "Architecture Agent",
    purpose: "Review ownership boundaries, coupling, layering, and long-term maintainability.",
  },
  {
    kind: "testing",
    name: "Testing Agent",
    purpose: "Review meaningful coverage, edge cases, regression tests, and flaky patterns.",
  },
  {
    kind: "performance",
    name: "Performance Agent",
    purpose: "Review expensive loops, blocking work, memory risks, N+1 patterns, and cache misuse.",
  },
  {
    kind: "devops",
    name: "DevOps Agent",
    purpose: "Review CI, deployment config, environment handling, Docker, and infrastructure drift.",
  },
] as const satisfies readonly AgentDefinition[];
