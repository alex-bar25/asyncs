import { REVIEW_CONFIDENCES, REVIEW_SEVERITIES } from "./constants";
import type { Confidence, Severity } from "./types";

export function isSeverity(value: string): value is Severity {
  return REVIEW_SEVERITIES.includes(value as Severity);
}

export function isConfidence(value: string): value is Confidence {
  return REVIEW_CONFIDENCES.includes(value as Confidence);
}
