import type { AgentDefinition } from "@asyncs/core";

export type AgentRouteSource = "auto" | "explicit";

export type AgentRoute = {
  source: AgentRouteSource;
  agents: AgentDefinition[];
};
