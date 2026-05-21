import type { AgentDefinition, ChangedFile, Logger, ReviewFinding, ReviewRequest } from "@asyncs/core";
import type { CoordinatorAgentInput, CoordinatorAgentOutput, SpecialistAgentRunResult } from "@asyncs/agents";
import type { ConsensusReport } from "@asyncs/consensus";
import type { ProviderClient } from "@asyncs/providers";
import type { REVIEW_RUN_ROUTE_SOURCES } from "./constants";
import type { RetryPolicy } from "./robustness";

export type ReviewRunRouteSource = (typeof REVIEW_RUN_ROUTE_SOURCES)[number];

export type ReviewRunPlan = {
  request: ReviewRequest;
  routeSource: ReviewRunRouteSource;
  agents: AgentDefinition[];
  coordinatorOutput?: CoordinatorAgentOutput;
};

export type CreateReviewRunPlanOptions = {
  request: ReviewRequest;
  coordinatorOutput?: CoordinatorAgentOutput;
};

export type CreateCoordinatedReviewRunPlanOptions = {
  request: ReviewRequest;
  coordinatorInput: CoordinatorAgentInput;
  coordinatorModel: string;
  provider: ProviderClient;
} & Pick<RobustnessOptions, "timeoutMs" | "retryPolicy" | "logger">;

export type SpecialistAssignmentRun = SpecialistAgentRunResult & {
  agent: AgentDefinition;
  attempts: number;
};

export type SpecialistAssignmentExecutionResult = {
  runs: SpecialistAssignmentRun[];
  findings: ReviewFinding[];
  failures: SpecialistFailure[];
};

export type ExecuteSpecialistAssignmentsOptions = {
  plan: ReviewRunPlan;
  files: readonly ChangedFile[];
  model: string;
  provider: ProviderClient;
} & RobustnessOptions;

export type RunPreviewReviewPipelineOptions = {
  request: ReviewRequest;
};

export type PreviewReviewPipelineResult = {
  plan: ReviewRunPlan;
  files: readonly ChangedFile[];
  report: ConsensusReport;
  markdown: string;
};

export type SpecialistFailure = {
  agent: AgentDefinition;
  attempts: number;
  error: string;
};

export type RobustnessOptions = {
  timeoutMs?: number;
  retryPolicy?: RetryPolicy;
  concurrency?: number;
  logger?: Logger;
};

export type { RetryPolicy } from "./robustness";
