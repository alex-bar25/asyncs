import { AGENT_KINDS, REVIEW_CONFIDENCES, REVIEW_MODES, REVIEW_SEVERITIES } from "./constants";
import type { AgentKind, Confidence, ReviewMode, Severity } from "./types";

const SEVERITY_VALUES: ReadonlySet<string> = new Set(REVIEW_SEVERITIES);
const CONFIDENCE_VALUES: ReadonlySet<string> = new Set(REVIEW_CONFIDENCES);
const REVIEW_MODE_VALUES: ReadonlySet<string> = new Set(REVIEW_MODES);
const AGENT_KIND_VALUES: ReadonlySet<string> = new Set(AGENT_KINDS);

export function isSeverity(value: string): value is Severity {
  return SEVERITY_VALUES.has(value);
}

export function isConfidence(value: string): value is Confidence {
  return CONFIDENCE_VALUES.has(value);
}

export function isReviewMode(value: string): value is ReviewMode {
  return REVIEW_MODE_VALUES.has(value);
}

export function isAgentKind(value: string): value is AgentKind {
  return AGENT_KIND_VALUES.has(value);
}
