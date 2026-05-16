import type { AgentKind, ReviewMode } from "@asyncs/core";

export const AUTO_AGENT_KINDS_BY_MODE = {
  "low-noise": ["backend", "security", "architecture", "testing"],
  full: ["backend", "frontend", "security", "architecture", "testing", "devops"],
  security: ["security"],
  architecture: ["architecture"],
  testing: ["testing"],
} as const satisfies Record<ReviewMode, readonly AgentKind[]>;
