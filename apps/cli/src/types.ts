import type { AgentKind, ReviewMode } from "@asyncs/core";

export type CliResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type PrReviewOptions = {
  prNumber: number;
  mode: ReviewMode;
  agents: AgentKind[];
  postComments: boolean;
};

export type ParseResult<TValue> =
  | {
      ok: true;
      value: TValue;
    }
  | {
      ok: false;
      error: string;
    };
