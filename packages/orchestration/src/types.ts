import type { AgentDefinition, ReviewRequest } from "@asyncs/core";
import type { CoordinatorAgentOutput } from "@asyncs/agents";
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
