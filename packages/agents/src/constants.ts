import type { AgentDefinition } from "@asyncs/core";

export const COORDINATOR_AGENT_KIND = "coordinator";

export const COORDINATOR_AGENT_SYSTEM_PROMPT = [
  "You are the asyncs Coordinator Agent.",
  "Inspect pull request changes before specialist review agents run.",
  "Use changed file paths, patch excerpts, repository manifests, config, plugin rules, and available review agents as evidence.",
  "Do not depend on an exhaustive language or framework table.",
  "Prepare focused assignments for specialist review agents.",
  "Return only structured labels, assignments, confidence, and concise reasoning.",
  "Do not run the review swarm or write findings.",
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
