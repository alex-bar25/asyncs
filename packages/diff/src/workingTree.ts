import type { ChangedFile } from "@asyncs/core";
import { parseNameStatus, parseNumstat, splitMultiFilePatch } from "./parseDiff";
import type { SimpleGitGateway } from "./simpleGitGateway";
import type { LocalDiffResult } from "./types";

const DEFAULT_BASE_REF_CANDIDATES = ["main", "master"];

export async function loadWorkingTreeDiff(
  gateway: SimpleGitGateway,
  options: { baseRef?: string },
): Promise<LocalDiffResult> {
  const baseRef =
    options.baseRef !== undefined
      ? await gateway.resolveBaseRef([options.baseRef])
      : await gateway.resolveBaseRef(DEFAULT_BASE_REF_CANDIDATES);

  const numstatRaw = await gateway.diffNumstat([baseRef]);
  const nameStatusRaw = await gateway.diffNameStatus([baseRef, "-M"]);
  const patchRaw = await gateway.diffPatch([baseRef, "-M"], "");

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

  return { baseRef, headRef: "WORKING_TREE", files, skippedBinaries };
}
