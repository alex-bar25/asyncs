import type { ChangedFile } from "@asyncs/core";

export type LocalDiffMode =
  | { kind: "workingTree"; baseRef?: string }
  | { kind: "staged" }
  | { kind: "commitRange"; from: string; to: string };

export type LoadLocalDiffOptions = {
  mode: LocalDiffMode;
  cwd?: string;
};

export type LocalDiffResult = {
  baseRef: string;
  headRef: string;
  files: ChangedFile[];
  skippedBinaries: readonly string[];
};
