import type { ChangedFile } from "@asyncs/core";
import { parseNameStatus, parseNumstat, splitMultiFilePatch } from "./parseDiff";
import type { SimpleGitGateway } from "./simpleGitGateway";
import type { LocalDiffResult } from "./types";

export async function loadStagedDiff(gateway: SimpleGitGateway): Promise<LocalDiffResult> {
  const numstatRaw = await gateway.diffNumstat(["--cached", "HEAD"]);
  const nameStatusRaw = await gateway.diffNameStatus(["--cached", "-M", "HEAD"]);
  const patchRaw = await gateway.diffPatch(["--cached", "-M", "HEAD"], "");

  const numstat = parseNumstat(numstatRaw);
  const nameStatus = parseNameStatus(nameStatusRaw);
  const patches = splitMultiFilePatch(patchRaw);

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

  return { baseRef: "HEAD", headRef: "STAGED", files, skippedBinaries };
}
