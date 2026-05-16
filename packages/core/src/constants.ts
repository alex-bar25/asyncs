export const ASYNCS_PACKAGE_NAME = "asyncs";

export const ASYNCS_DESCRIPTION = "Open-source sub-agent driven AI PR review harness.";

export const REVIEW_SEVERITIES = ["low", "medium", "high", "critical"] as const;

export const REVIEW_CONFIDENCES = ["low", "medium", "high"] as const;

export const REVIEW_MODES = ["low-noise", "full", "security", "architecture", "testing"] as const;

export const DEFAULT_REVIEW_MODE = REVIEW_MODES[0];

export const DEFAULT_REVIEW_REQUEST_OPTIONS = {
  mode: DEFAULT_REVIEW_MODE,
  agents: [],
  postComments: false,
  dryRun: false,
} as const;

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

export const CHANGED_FILE_STATUSES = ["added", "modified", "deleted", "renamed"] as const;
