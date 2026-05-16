export const ASYNCS_PACKAGE_NAME = "asyncs";

export const ASYNCS_DESCRIPTION = "Open-source sub-agent driven AI PR review harness.";

export const REVIEW_SEVERITIES = ["low", "medium", "high", "critical"] as const;

export type Severity = (typeof REVIEW_SEVERITIES)[number];

export const REVIEW_CONFIDENCES = ["low", "medium", "high"] as const;

export type Confidence = (typeof REVIEW_CONFIDENCES)[number];

export const REVIEW_MODES = ["low-noise", "full", "security", "architecture", "testing"] as const;

export type ReviewMode = (typeof REVIEW_MODES)[number];

export const AGENT_KINDS = [
  "backend",
  "frontend",
  "security",
  "architecture",
  "testing",
  "performance",
  "devops",
  "custom",
] as const;

export type AgentKind = (typeof AGENT_KINDS)[number];

export type PullRequest = {
  number: number;
  title: string;
  repository: string;
  baseRef: string;
  headRef: string;
};

export type ChangedFile = {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  patch?: string;
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

export function isSeverity(value: string): value is Severity {
  return REVIEW_SEVERITIES.includes(value as Severity);
}

export function isConfidence(value: string): value is Confidence {
  return REVIEW_CONFIDENCES.includes(value as Confidence);
}
