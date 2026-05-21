import { getBuiltInAgentDefinition, isBuiltInAgentKind, runCoordinatorAgent, runSpecialistAgent } from "@asyncs/agents";
import type { AgentAssignment } from "@asyncs/agents";
import { resolveAgentRoute } from "@asyncs/routing";
import type {
  CreateCoordinatedReviewRunPlanOptions,
  CreateReviewRunPlanOptions,
  ExecuteSpecialistAssignmentsOptions,
  ReviewRunPlan,
  SpecialistAssignmentExecutionResult,
} from "./types";

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

export async function createCoordinatedReviewRunPlan(
  options: CreateCoordinatedReviewRunPlanOptions,
): Promise<ReviewRunPlan> {
  const result = await runCoordinatorAgent({
    input: options.coordinatorInput,
    model: options.coordinatorModel,
    provider: options.provider,
  });

  return createReviewRunPlan({
    request: options.request,
    coordinatorOutput: result.output,
  });
}

export async function executeSpecialistAssignments(
  options: ExecuteSpecialistAssignmentsOptions,
): Promise<SpecialistAssignmentExecutionResult> {
  const eligibleAssignments = (options.plan.coordinatorOutput?.assignments ?? []).flatMap((assignment) => {
    if (!isBuiltInAgentKind(assignment.agent)) {
      return [];
    }

    const agent = getBuiltInAgentDefinition(assignment.agent);

    return agent === undefined ? [] : [{ assignment, agent }];
  });

  const runs = await Promise.all(
    eligibleAssignments.map(async ({ assignment, agent }) => {
      const run = await runSpecialistAgent({
        agent,
        assignment,
        files: options.files,
        mode: options.plan.request.mode,
        model: options.model,
        provider: options.provider,
      });

      return { agent, attempts: 1, ...run };
    }),
  );

  return {
    runs,
    findings: runs.flatMap((run) => [...run.output.findings]),
    failures: [],
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
