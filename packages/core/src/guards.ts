import { AGENT_KINDS, REVIEW_CONFIDENCES, REVIEW_MODES, REVIEW_SEVERITIES } from "./constants";
import type { AgentKind, Confidence, ReviewMode, Severity } from "./types";

export function isSeverity(value: string): value is Severity {
  return REVIEW_SEVERITIES.includes(value as Severity);
}

export function isConfidence(value: string): value is Confidence {
  return REVIEW_CONFIDENCES.includes(value as Confidence);
}

export function isReviewMode(value: string): value is ReviewMode {
  return REVIEW_MODES.includes(value as ReviewMode);
}

export function isAgentKind(value: string): value is AgentKind {
  return AGENT_KINDS.includes(value as AgentKind);
}
