import type { LoadLocalDiffOptions, LocalDiffResult } from "./types";

export async function loadLocalDiff(options: LoadLocalDiffOptions): Promise<LocalDiffResult> {
  switch (options.mode.kind) {
    case "workingTree":
    case "staged":
    case "commitRange":
      throw new Error(`loadLocalDiff: mode "${options.mode.kind}" not implemented yet`);
  }
}
