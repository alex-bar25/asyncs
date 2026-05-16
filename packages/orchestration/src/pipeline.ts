import { getBuiltInAgentDefinition, isBuiltInAgentKind } from "@asyncs/agents";
import type { AgentKind } from "@asyncs/core";
import { resolveAgentRoute } from "@asyncs/routing";
import type { CreateReviewRunPlanOptions, ReviewRunPlan } from "./types";

export function createReviewRunPlan(options: CreateReviewRunPlanOptions): ReviewRunPlan {
  if (options.request.agents.length > 0) {
    const route = resolveAgentRoute(options.request);

    return {
      request: options.request,
      routeSource: route.source,
      agents: route.agents,
      ...(options.classifierOutput === undefined ? {} : { classifierOutput: options.classifierOutput }),
    };
  }

  const classifierAgents = resolveClassifierAgents(options.classifierOutput?.suggestedAgents ?? []);

  if (classifierAgents.length > 0) {
    return {
      request: options.request,
      routeSource: "classifier",
      agents: classifierAgents,
      ...(options.classifierOutput === undefined ? {} : { classifierOutput: options.classifierOutput }),
    };
  }

  const route = resolveAgentRoute(options.request);

  return {
    request: options.request,
    routeSource: route.source,
    agents: route.agents,
    ...(options.classifierOutput === undefined ? {} : { classifierOutput: options.classifierOutput }),
  };
}

function resolveClassifierAgents(agentKinds: readonly AgentKind[]): ReviewRunPlan["agents"] {
  const uniqueAgentKinds = new Set<AgentKind>();

  for (const agentKind of agentKinds) {
    uniqueAgentKinds.add(agentKind);
  }

  return [...uniqueAgentKinds].flatMap((agentKind) => {
    if (!isBuiltInAgentKind(agentKind)) {
      return [];
    }

    const agent = getBuiltInAgentDefinition(agentKind);

    return agent === undefined ? [] : [agent];
  });
}
