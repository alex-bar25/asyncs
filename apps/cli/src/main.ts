#!/usr/bin/env bun

import { ASYNCS_DESCRIPTION, ASYNCS_PACKAGE_NAME } from "@asyncs/core";
import { CLI_VERSION, PR_REVIEW_COMMAND } from "./constants";
import { runPrReviewCommand } from "./prReviewCommand";
import type { CliResult } from "./types";

export function runCli(args: readonly string[]): CliResult {
  if (args[0] === PR_REVIEW_COMMAND[0] && args[1] === PR_REVIEW_COMMAND[1]) {
    return runPrReviewCommand(args.slice(2));
  }

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    return {
      exitCode: 0,
      stdout: renderHelp(),
      stderr: "",
    };
  }

  if (args.length === 1 && (args[0] === "--version" || args[0] === "-v")) {
    return {
      exitCode: 0,
      stdout: `${CLI_VERSION}\n`,
      stderr: "",
    };
  }

  const unknownArgument = args[0] ?? "";

  return {
    exitCode: 1,
    stdout: renderHelp(),
    stderr: `Unknown argument: ${unknownArgument}\n`,
  };
}

function renderHelp(): string {
  return `${ASYNCS_PACKAGE_NAME}
${ASYNCS_DESCRIPTION}

Usage:
  asyncs
  asyncs --help
  asyncs --version

Planned commands:
  asyncs pr review 3213
  asyncs pr review 3213 --agents backend,security
  asyncs pr review 3213 --mode low-noise
`;
}

if (import.meta.main) {
  const result = runCli(Bun.argv.slice(2));

  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr.length > 0) {
    process.stderr.write(result.stderr);
  }

  process.exit(result.exitCode);
}
