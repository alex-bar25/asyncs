import type { ChangedFile } from "@asyncs/core";
import { parseNameStatus, parseNumstat, splitMultiFilePatch } from "./parseDiff";
import type { SimpleGitGateway } from "./simpleGitGateway";
import type { LocalDiffResult } from "./types";

export async function loadCommitRangeDiff(
  gateway: SimpleGitGateway,
  range: { from: string; to: string },
): Promise<LocalDiffResult> {
  await gateway.resolveBaseRef([range.from]);
  await gateway.resolveBaseRef([range.to]);

  const rangeArg = `${range.from}..${range.to}`;
  const numstatRaw = await gateway.diffNumstat([rangeArg]);
  const nameStatusRaw = await gateway.diffNameStatus([rangeArg, "-M"]);
  const patchRaw = await gateway.diffPatch([rangeArg, "-M"], "");

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

  return { baseRef: range.from, headRef: range.to, files, skippedBinaries };
}
