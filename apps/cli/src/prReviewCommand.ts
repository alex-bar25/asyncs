import { DEFAULT_REVIEW_MODE, isAgentKind, isReviewMode, type AgentKind, type ReviewMode } from "@asyncs/core";

type PrReviewOptions = {
  prNumber: number;
  mode: ReviewMode;
  agents: AgentKind[];
  postComments: boolean;
};

type ParseResult =
  | {
      ok: true;
      options: PrReviewOptions;
    }
  | {
      ok: false;
      error: string;
    };

export function runPrReviewCommand(args: readonly string[]) {
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
    stdout: renderPrReviewPreview(parsed.options),
    stderr: "",
  };
}

function parsePrReviewArgs(args: readonly string[]): ParseResult {
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
    mode: DEFAULT_REVIEW_MODE,
    agents: [],
    postComments: false,
  };

  for (let index = 0; index < optionArgs.length; index += 1) {
    const option = optionArgs[index];

    if (option === "--post-comments") {
      options.postComments = true;
      continue;
    }

    if (option === "--mode") {
      const mode = optionArgs[index + 1];

      if (mode === undefined) {
        return { ok: false, error: "Missing value for --mode." };
      }

      if (!isReviewMode(mode)) {
        return { ok: false, error: `Invalid review mode: ${mode}` };
      }

      options.mode = mode;
      index += 1;
      continue;
    }

    if (option === "--agents") {
      const agentsValue = optionArgs[index + 1];

      if (agentsValue === undefined) {
        return { ok: false, error: "Missing value for --agents." };
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

  return { ok: true, options };
}

function renderPrReviewPreview(options: PrReviewOptions): string {
  const agents = options.agents.length > 0 ? options.agents.join(",") : "auto";

  return `Review request
PR: ${options.prNumber}
Mode: ${options.mode}
Agents: ${agents}
Post comments: ${options.postComments}
`;
}
