import { isAgentKind, isReviewMode, type AgentKind } from "@asyncs/core";
import { AUTO_AGENT_SELECTION_LABEL, DEFAULT_PR_REVIEW_OPTIONS, PR_REVIEW_OPTIONS } from "./constants";
import type { CliResult, ParseResult, PrReviewOptions } from "./types";

export function runPrReviewCommand(args: readonly string[]): CliResult {
  const parsed = parsePrReviewArgs(args);

  if (!parsed.ok) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `${parsed.error}\n`,
    };
  }

  return {
    exitCode: 0,
    stdout: renderPrReviewPreview(parsed.value),
    stderr: "",
  };
}

function parsePrReviewArgs(args: readonly string[]): ParseResult<PrReviewOptions> {
  const [prNumberValue, ...optionArgs] = args;
  const prNumber = Number(prNumberValue);

  if (!Number.isInteger(prNumber) || prNumber < 1) {
    return {
      ok: false,
      error: "PR number must be a positive integer.",
    };
  }

  const options: PrReviewOptions = {
    prNumber,
    mode: DEFAULT_PR_REVIEW_OPTIONS.mode,
    agents: [...DEFAULT_PR_REVIEW_OPTIONS.agents],
    postComments: DEFAULT_PR_REVIEW_OPTIONS.postComments,
  };

  for (let index = 0; index < optionArgs.length; index += 1) {
    const option = optionArgs[index];

    if (option === PR_REVIEW_OPTIONS.postComments) {
      options.postComments = true;
      continue;
    }

    if (option === PR_REVIEW_OPTIONS.mode) {
      const mode = optionArgs[index + 1];

      if (mode === undefined) {
        return { ok: false, error: `Missing value for ${PR_REVIEW_OPTIONS.mode}.` };
      }

      if (!isReviewMode(mode)) {
        return { ok: false, error: `Invalid review mode: ${mode}` };
      }

      options.mode = mode;
      index += 1;
      continue;
    }

    if (option === PR_REVIEW_OPTIONS.agents) {
      const agentsValue = optionArgs[index + 1];

      if (agentsValue === undefined) {
        return { ok: false, error: `Missing value for ${PR_REVIEW_OPTIONS.agents}.` };
      }

      const agents: AgentKind[] = [];

      for (const agent of agentsValue.split(",").filter(Boolean)) {
        if (!isAgentKind(agent)) {
          return { ok: false, error: `Invalid agent: ${agent}` };
        }

        agents.push(agent);
      }

      options.agents = agents;
      index += 1;
      continue;
    }

    return { ok: false, error: `Unknown option: ${option ?? ""}` };
  }

  return { ok: true, value: options };
}

function renderPrReviewPreview(options: PrReviewOptions): string {
  const agents = options.agents.length > 0 ? options.agents.join(",") : AUTO_AGENT_SELECTION_LABEL;

  return `Review request
PR: ${options.prNumber}
Mode: ${options.mode}
Agents: ${agents}
Post comments: ${options.postComments}
`;
}
