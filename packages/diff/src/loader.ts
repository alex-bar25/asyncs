import { loadCommitRangeDiff } from "./commitRange";
import { createDefaultGateway } from "./simpleGitGateway";
import { loadStagedDiff } from "./staged";
import { loadWorkingTreeDiff } from "./workingTree";
import type { LoadLocalDiffOptions, LocalDiffResult } from "./types";

export async function loadLocalDiff(options: LoadLocalDiffOptions): Promise<LocalDiffResult> {
  const cwd = options.cwd ?? process.cwd();
  const gateway = createDefaultGateway(cwd);

  switch (options.mode.kind) {
    case "workingTree": {
      const workingTreeOptions = options.mode.baseRef !== undefined ? { baseRef: options.mode.baseRef } : {};
      return loadWorkingTreeDiff(gateway, workingTreeOptions);
    }
    case "staged":
      return loadStagedDiff(gateway);
    case "commitRange":
      return loadCommitRangeDiff(gateway, { from: options.mode.from, to: options.mode.to });
  }
}
