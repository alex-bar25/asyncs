import { getBuiltInAgentDefinition, isBuiltInAgentKind } from "@asyncs/agents";
import type { AgentKind, ReviewRequest } from "@asyncs/core";
import { AUTO_AGENT_KINDS_BY_MODE } from "./constants";
import type { AgentRoute } from "./types";

export function resolveAgentRoute(request: ReviewRequest): AgentRoute {
  const requestedAgentKinds = request.agents.length > 0 ? request.agents : AUTO_AGENT_KINDS_BY_MODE[request.mode];

  return {
    source: request.agents.length > 0 ? "explicit" : "auto",
    agents: resolveBuiltInAgentDefinitions(requestedAgentKinds),
  };
}

export function resolveAgentRoutes(requests: readonly ReviewRequest[]): AgentRoute[] {
  return requests.map(resolveAgentRoute);
}

function resolveBuiltInAgentDefinitions(agentKinds: readonly AgentKind[]): AgentRoute["agents"] {
  return agentKinds.flatMap((agentKind) => {
    if (!isBuiltInAgentKind(agentKind)) {
      return [];
    }

    const agent = getBuiltInAgentDefinition(agentKind);

    return agent === undefined ? [] : [agent];
  });
}
