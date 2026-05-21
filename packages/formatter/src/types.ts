import type { ConsensusReport } from "@asyncs/consensus";
import type { AgentDefinition } from "@asyncs/core";

export type SpecialistFailureLike = {
  agent: AgentDefinition;
  attempts: number;
  error: string;
};

export type FormatReviewReportOptions = {
  report: ConsensusReport;
  title?: string;
  failures?: readonly SpecialistFailureLike[];
};
