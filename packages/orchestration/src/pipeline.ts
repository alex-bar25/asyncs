import { getBuiltInAgentDefinition, isBuiltInAgentKind, runCoordinatorAgent, runSpecialistAgent } from "@asyncs/agents";
import type { AgentAssignment } from "@asyncs/agents";
import type { AgentDefinition, ChangedFile, Logger, ReviewMode } from "@asyncs/core";
import { noopLogger } from "@asyncs/core";
import type { ProviderClient } from "@asyncs/providers";
import { resolveAgentRoute } from "@asyncs/routing";
import PQueue from "p-queue";
import { DEFAULT_CALL_TIMEOUT_MS, DEFAULT_RETRY_POLICY, DEFAULT_SPECIALIST_CONCURRENCY } from "./constants";
import { RetryExhaustedError, withRetries, withTimeout } from "./robustness";
import type { RetryPolicy } from "./robustness";
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
  const coordinatorAgents =
    options.request.agents.length === 0 ? resolveCoordinatorAgents(options.coordinatorOutput?.assignments ?? []) : [];
  const useCoordinator = coordinatorAgents.length > 0;

  return {
    request: options.request,
    routeSource: useCoordinator ? "coordinator" : route.source,
    agents: useCoordinator ? coordinatorAgents : route.agents,
    ...(options.coordinatorOutput === undefined ? {} : { coordinatorOutput: options.coordinatorOutput }),
  };
}

export async function createCoordinatedReviewRunPlan(
  options: CreateCoordinatedReviewRunPlanOptions,
): Promise<ReviewRunPlan> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
  const retryPolicy = options.retryPolicy ?? DEFAULT_RETRY_POLICY;
  const logger = options.logger ?? noopLogger;

  const { value: result } = await withRetries(
    () =>
      withTimeout(
        (signal) =>
          runCoordinatorAgent({
            input: options.coordinatorInput,
            model: options.coordinatorModel,
            provider: options.provider,
            signal,
          }),
        timeoutMs,
      ),
    retryPolicy,
    { logger, agentLabel: "coordinator" },
  );

  return createReviewRunPlan({
    request: options.request,
    coordinatorOutput: result.output,
  });
}

export async function executeSpecialistAssignments(
  options: ExecuteSpecialistAssignmentsOptions,
): Promise<SpecialistAssignmentExecutionResult> {
  const concurrency = options.concurrency ?? DEFAULT_SPECIALIST_CONCURRENCY;
  const logger = options.logger ?? noopLogger;
  const runOptions: SpecialistRunOptions = {
    files: options.files,
    mode: options.plan.request.mode,
    model: options.model,
    provider: options.provider,
    timeoutMs: options.timeoutMs ?? DEFAULT_CALL_TIMEOUT_MS,
    retryPolicy: options.retryPolicy ?? DEFAULT_RETRY_POLICY,
    logger,
  };

  const eligible = selectEligibleAssignments(options.plan);
  const queue = new PQueue({ concurrency });

  const settled = await Promise.allSettled(
    eligible.map((slot) => queue.add(() => runSpecialistWithRobustness(slot, runOptions))),
  );

  const runs: SpecialistAssignmentRun[] = [];
  const failures: SpecialistFailure[] = [];

  for (let index = 0; index < settled.length; index += 1) {
    const settlement = settled[index];
    const slot = eligible[index];

    if (settlement === undefined || slot === undefined) {
      continue;
    }

    if (settlement.status === "fulfilled") {
      if (settlement.value === undefined) {
        continue;
      }
      runs.push(settlement.value);
      continue;
    }

    failures.push(recordFailure(settlement.reason, slot.agent, logger));
  }

  return {
    runs,
    findings: runs.flatMap((run) => [...run.output.findings]),
    failures,
  };
}

type EligibleAssignment = { assignment: AgentAssignment; agent: AgentDefinition };

type SpecialistRunOptions = {
  files: readonly ChangedFile[];
  mode: ReviewMode;
  model: string;
  provider: ProviderClient;
  timeoutMs: number;
  retryPolicy: RetryPolicy;
  logger: Logger;
};

function selectEligibleAssignments(plan: ReviewRunPlan): EligibleAssignment[] {
  return (plan.coordinatorOutput?.assignments ?? []).flatMap((assignment) => {
    if (!isBuiltInAgentKind(assignment.agent)) {
      return [];
    }

    const agent = getBuiltInAgentDefinition(assignment.agent);

    return agent === undefined ? [] : [{ assignment, agent }];
  });
}

async function runSpecialistWithRobustness(
  slot: EligibleAssignment,
  options: SpecialistRunOptions,
): Promise<SpecialistAssignmentRun> {
  const { value, attempts } = await withRetries(
    () =>
      withTimeout(
        (signal) =>
          runSpecialistAgent({
            agent: slot.agent,
            assignment: slot.assignment,
            files: options.files,
            mode: options.mode,
            model: options.model,
            provider: options.provider,
            signal,
          }),
        options.timeoutMs,
      ),
    options.retryPolicy,
    { logger: options.logger, agentLabel: slot.agent.kind },
  );

  return { agent: slot.agent, attempts, ...value };
}

function recordFailure(error: unknown, agent: AgentDefinition, logger: Logger): SpecialistFailure {
  const attempts = error instanceof RetryExhaustedError ? error.attempts : 1;
  const message = error instanceof Error ? error.message : String(error);

  logger.error(`${agent.kind} review failed after ${attempts} attempt(s)`, {
    agentLabel: agent.kind,
    attempts,
    error: message,
  });

  return { agent, attempts, error: message };
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
