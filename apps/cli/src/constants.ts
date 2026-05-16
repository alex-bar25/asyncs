export const CLI_VERSION = "0.1.0";

export const PR_REVIEW_COMMAND = ["pr", "review"] as const;

export const PR_REVIEW_OPTIONS = {
  agents: "--agents",
  dryRun: "--dry-run",
  mode: "--mode",
  postComments: "--post-comments",
} as const;

export const AUTO_AGENT_SELECTION_LABEL = "auto";
