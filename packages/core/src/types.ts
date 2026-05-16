import type {
  AGENT_KINDS,
  CHANGED_FILE_STATUSES,
  REVIEW_CONFIDENCES,
  REVIEW_MODES,
  REVIEW_SEVERITIES,
} from "./constants";

export type Severity = (typeof REVIEW_SEVERITIES)[number];

export type Confidence = (typeof REVIEW_CONFIDENCES)[number];

export type ReviewMode = (typeof REVIEW_MODES)[number];

export type AgentKind = (typeof AGENT_KINDS)[number];

export type ChangedFileStatus = (typeof CHANGED_FILE_STATUSES)[number];

export type PullRequest = {
  number: number;
  title: string;
  repository: string;
  baseRef: string;
  headRef: string;
};

export type ChangedFile = {
  path: string;
  status: ChangedFileStatus;
  additions: number;
  deletions: number;
  patch?: string;
};

export type ReviewRequest = {
  prNumber: number;
  mode: ReviewMode;
  agents: AgentKind[];
  postComments: boolean;
  dryRun: boolean;
};

export type ReviewFinding = {
  agent: AgentKind | string;
  title: string;
  message: string;
  severity: Severity;
  confidence: Confidence;
  file?: string;
  line?: number;
  evidence: string;
  recommendation: string;
};

export type AgentDefinition = {
  kind: AgentKind;
  name: string;
  purpose: string;
};

export type ReviewContext = {
  pullRequest: PullRequest;
  files: ChangedFile[];
  mode: ReviewMode;
};

export type ReviewReport = {
  pullRequest: PullRequest;
  mode: ReviewMode;
  findings: ReviewFinding[];
  agents: AgentDefinition[];
};
