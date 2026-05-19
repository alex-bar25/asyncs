import type { Confidence, Severity } from "@asyncs/core";

export const SEVERITY_RANKS = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
} as const satisfies Record<Severity, number>;

export const CONFIDENCE_RANKS = {
  low: 1,
  medium: 2,
  high: 3,
} as const satisfies Record<Confidence, number>;
