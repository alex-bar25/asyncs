import type { ChangedFile } from "@asyncs/core";
import type { NameStatusRow, NumstatRow } from "./parseDiff";

export type PartitionedFiles = {
  files: ChangedFile[];
  skippedBinaries: string[];
};

export function partitionFiles(
  numstat: readonly NumstatRow[],
  nameStatus: readonly NameStatusRow[],
  patches: ReadonlyMap<string, string>,
): PartitionedFiles {
  const files: ChangedFile[] = [];
  const skippedBinaries: string[] = [];

  for (const row of nameStatus) {
    const stats = numstat.find((n) => n.path === row.path);

    if (stats === undefined) {
      continue;
    }

    if (stats.additions === "binary" || stats.deletions === "binary") {
      skippedBinaries.push(row.path);
      continue;
    }

    const file: ChangedFile = {
      path: row.path,
      status: row.status,
      additions: stats.additions,
      deletions: stats.deletions,
    };

    const patch = patches.get(row.path);
    if (patch !== undefined) {
      file.patch = patch;
    }

    if (row.oldPath !== undefined) {
      file.oldPath = row.oldPath;
    }

    files.push(file);
  }

  return { files, skippedBinaries };
}
