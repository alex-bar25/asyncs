import { getBuiltInAgentDefinition, isBuiltInAgentKind } from "@asyncs/agents";
import type { AgentAssignment } from "@asyncs/agents";
import { resolveAgentRoute } from "@asyncs/routing";
import type { CreateReviewRunPlanOptions, ReviewRunPlan } from "./types";

export function createReviewRunPlan(options: CreateReviewRunPlanOptions): ReviewRunPlan {
  const route = resolveAgentRoute(options.request);

  if (options.request.agents.length > 0) {
    return {
      request: options.request,
      routeSource: route.source,
      agents: route.agents,
      ...(options.coordinatorOutput === undefined ? {} : { coordinatorOutput: options.coordinatorOutput }),
    };
  }

  const coordinatorAgents = resolveCoordinatorAgents(options.coordinatorOutput?.assignments ?? []);
  if (coordinatorAgents.length > 0) {
    return {
      request: options.request,
      routeSource: "coordinator",
      agents: coordinatorAgents,
      ...(options.coordinatorOutput === undefined ? {} : { coordinatorOutput: options.coordinatorOutput }),
    };
  }

  return {
    request: options.request,
    routeSource: route.source,
    agents: route.agents,
    ...(options.coordinatorOutput === undefined ? {} : { coordinatorOutput: options.coordinatorOutput }),
  };
}

function resolveCoordinatorAgents(assignments: readonly AgentAssignment[]): ReviewRunPlan["agents"] {
  const uniqueAgentKinds = new Set<AgentAssignment["agent"]>();

  for (const assignment of assignments) {
    uniqueAgentKinds.add(assignment.agent);
  }

  return [...uniqueAgentKinds].flatMap((agentKind) => {
    if (!isBuiltInAgentKind(agentKind)) {
      return [];
    }

    const agent = getBuiltInAgentDefinition(agentKind);

    return agent === undefined ? [] : [agent];
  });
}
