import { DEFAULT_REVIEW_MODE, isAgentKind, isReviewMode } from "@asyncs/core";
import type { AgentKind, ReviewMode } from "@asyncs/core";

export type ReviewOptionsInput = {
  mode?: string | undefined;
  agents?: string | undefined;
};

export type ParsedReviewOptions = {
  mode: ReviewMode;
  agents: AgentKind[];
};

export function parseReviewOptionsInput(input: ReviewOptionsInput): ParsedReviewOptions {
  return {
    mode: parseMode(input.mode),
    agents: parseAgents(input.agents),
  };
}

function parseMode(value: string | undefined): ReviewMode {
  if (value === undefined || value.length === 0) {
    return DEFAULT_REVIEW_MODE;
  }

  if (!isReviewMode(value)) {
    throw new Error(`Invalid mode input: "${value}"`);
  }

  return value;
}

function parseAgents(value: string | undefined): AgentKind[] {
  if (value === undefined || value.length === 0) {
    return [];
  }

  return value.split(",").map((entry) => {
    const trimmed = entry.trim();

    if (!isAgentKind(trimmed)) {
      throw new Error(`Invalid agent input: "${trimmed}"`);
    }

    return trimmed;
  });
}
