import type { AgentDefinition } from "@asyncs/core";

export const BUILT_IN_AGENT_KINDS = [
  "backend",
  "frontend",
  "security",
  "architecture",
  "testing",
  "performance",
  "devops",
] as const;

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
