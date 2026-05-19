import type { ReviewFinding } from "@asyncs/core";

export type ConsensusInput = {
  findings: readonly ReviewFinding[];
};

export type ConsensusReport = {
  findings: ReviewFinding[];
  duplicateCount: number;
  suppressedCount: number;
};
