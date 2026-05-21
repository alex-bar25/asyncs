import { getBuiltInAgentDefinition, isBuiltInAgentKind, runCoordinatorAgent, runSpecialistAgent } from "@asyncs/agents";
import type { AgentAssignment } from "@asyncs/agents";
import { noopLogger } from "@asyncs/core";
import { resolveAgentRoute } from "@asyncs/routing";
import PQueue from "p-queue";
import { DEFAULT_CALL_TIMEOUT_MS, DEFAULT_RETRY_POLICY, DEFAULT_SPECIALIST_CONCURRENCY } from "./constants";
import { RetryExhaustedError, withRetries, withTimeout } from "./robustness";
import type {
  CreateCoordinatedReviewRunPlanOptions,
  CreateReviewRunPlanOptions,
  ExecuteSpecialistAssignmentsOptions,
  ReviewRunPlan,
  SpecialistAssignmentExecutionResult,
  SpecialistAssignmentRun,
  SpecialistFailure,
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
  const concurrency = options.concurrency ?? DEFAULT_SPECIALIST_CONCURRENCY;
  const timeoutMs = options.timeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
  const retryPolicy = options.retryPolicy ?? DEFAULT_RETRY_POLICY;
  const logger = options.logger ?? noopLogger;

  const eligibleAssignments = (options.plan.coordinatorOutput?.assignments ?? []).flatMap((assignment) => {
    if (!isBuiltInAgentKind(assignment.agent)) {
      return [];
    }

    const agent = getBuiltInAgentDefinition(assignment.agent);

    return agent === undefined ? [] : [{ assignment, agent }];
  });

  const queue = new PQueue({ concurrency });

  const settled = await Promise.allSettled(
    eligibleAssignments.map(({ assignment, agent }) =>
      queue.add(async () => {
        const { value, attempts } = await withRetries(
          () =>
            withTimeout(
              (signal) =>
                runSpecialistAgent({
                  agent,
                  assignment,
                  files: options.files,
                  mode: options.plan.request.mode,
                  model: options.model,
                  provider: options.provider,
                  signal,
                }),
              timeoutMs,
            ),
          retryPolicy,
          { logger, agentLabel: agent.kind },
        );

        const run: SpecialistAssignmentRun = { agent, attempts, ...value };
        return run;
      }),
    ),
  );

  const runs: SpecialistAssignmentRun[] = [];
  const failures: SpecialistFailure[] = [];

  for (let index = 0; index < settled.length; index += 1) {
    const settlement = settled[index];
    const eligible = eligibleAssignments[index];

    if (settlement === undefined || eligible === undefined) {
      continue;
    }

    if (settlement.status === "fulfilled") {
      if (settlement.value === undefined) {
        continue;
      }
      runs.push(settlement.value);
      continue;
    }

    const error = settlement.reason;
    const attempts = error instanceof RetryExhaustedError ? error.attempts : 1;
    const message = error instanceof Error ? error.message : String(error);

    logger.error(`${eligible.agent.kind} review failed after ${attempts} attempt(s)`, {
      agentLabel: eligible.agent.kind,
      attempts,
      error: message,
    });

    failures.push({ agent: eligible.agent, attempts, error: message });
  }

  return {
    runs,
    findings: runs.flatMap((run) => [...run.output.findings]),
    failures,
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
