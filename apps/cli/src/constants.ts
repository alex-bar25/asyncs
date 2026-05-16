import { DEFAULT_REVIEW_MODE } from "@asyncs/core";

export const CLI_VERSION = "0.1.0";

export const PR_REVIEW_COMMAND = ["pr", "review"] as const;

export const PR_REVIEW_OPTIONS = {
  agents: "--agents",
  mode: "--mode",
  postComments: "--post-comments",
} as const;

export const DEFAULT_PR_REVIEW_OPTIONS = {
  mode: DEFAULT_REVIEW_MODE,
  agents: [],
  postComments: false,
} as const;

export const AUTO_AGENT_SELECTION_LABEL = "auto";
