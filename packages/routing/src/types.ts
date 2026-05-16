import type { AgentDefinition, ReviewRequest } from "@asyncs/core";

export type AgentRouteSource = "auto" | "explicit";

export type AgentRoute = {
  request: ReviewRequest;
  source: AgentRouteSource;
  agents: AgentDefinition[];
};
