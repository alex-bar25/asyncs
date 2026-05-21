import { loadCommitRangeDiff } from "./commitRange";
import { createDefaultGateway } from "./simpleGitGateway";
import { loadStagedDiff } from "./staged";
import type { LoadLocalDiffOptions, LocalDiffResult } from "./types";

export async function loadLocalDiff(options: LoadLocalDiffOptions): Promise<LocalDiffResult> {
  const cwd = options.cwd ?? process.cwd();
  const gateway = createDefaultGateway(cwd);

  switch (options.mode.kind) {
    case "staged":
      return loadStagedDiff(gateway);
    case "commitRange":
      return loadCommitRangeDiff(gateway, { from: options.mode.from, to: options.mode.to });
    case "workingTree":
      throw new Error(`loadLocalDiff: mode "${options.mode.kind}" not implemented yet`);
  }
}
