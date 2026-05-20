import type { AgentDefinition, ChangedFile, ReviewFinding, ReviewRequest } from "@asyncs/core";
import type { CoordinatorAgentInput, CoordinatorAgentOutput, SpecialistAgentRunResult } from "@asyncs/agents";
import type { ConsensusReport } from "@asyncs/consensus";
import type { ProviderClient } from "@asyncs/providers";
import type { REVIEW_RUN_ROUTE_SOURCES } from "./constants";

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
};

export type SpecialistAssignmentRun = SpecialistAgentRunResult & {
  agent: AgentDefinition;
};

export type SpecialistAssignmentExecutionResult = {
  runs: SpecialistAssignmentRun[];
  findings: ReviewFinding[];
};

export type ExecuteSpecialistAssignmentsOptions = {
  plan: ReviewRunPlan;
  files: readonly ChangedFile[];
  model: string;
  provider: ProviderClient;
};

export type RunPreviewReviewPipelineOptions = {
  request: ReviewRequest;
};

export type PreviewReviewPipelineResult = {
  plan: ReviewRunPlan;
  files: readonly ChangedFile[];
  report: ConsensusReport;
  markdown: string;
};
