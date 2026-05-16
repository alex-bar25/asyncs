import type { AgentDefinition, ReviewRequest } from "@asyncs/core";
import type { ClassifierAgentOutput } from "@asyncs/agents";
import type { REVIEW_RUN_ROUTE_SOURCES } from "./constants";

export type ReviewRunRouteSource = (typeof REVIEW_RUN_ROUTE_SOURCES)[number];

export type ReviewRunPlan = {
  request: ReviewRequest;
  routeSource: ReviewRunRouteSource;
  agents: AgentDefinition[];
  classifierOutput?: ClassifierAgentOutput;
};

export type CreateReviewRunPlanOptions = {
  request: ReviewRequest;
  classifierOutput?: ClassifierAgentOutput;
};
