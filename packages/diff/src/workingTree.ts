import type { ChangedFile } from "@asyncs/core";
import { parseNameStatus, parseNumstat, splitMultiFilePatch, synthesizeUntrackedPatch } from "./parseDiff";
import type { SimpleGitGateway } from "./simpleGitGateway";
import type { LocalDiffResult } from "./types";

const DEFAULT_BASE_REF_CANDIDATES = ["main", "master"];
const NULL_BYTE_SCAN_LENGTH = 1024;

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

  const untracked = await gateway.listUntracked();

  for (const path of untracked) {
    let content: string;
    try {
      content = await gateway.readFile(path);
    } catch (err) {
      if (isEnoent(err)) {
        continue;
      }
      throw err;
    }

    if (isLikelyBinary(content)) {
      skippedBinaries.push(path);
      continue;
    }

    const additions = countAddedLines(content);

    files.push({
      path,
      status: "added",
      additions,
      deletions: 0,
      patch: synthesizeUntrackedPatch(content),
    });
  }

  return { baseRef, headRef: "WORKING_TREE", files, skippedBinaries };
}

function isLikelyBinary(content: string): boolean {
  const sample = content.slice(0, NULL_BYTE_SCAN_LENGTH);
  return sample.includes("\0");
}

function countAddedLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }

  const trimmed = content.endsWith("\n") ? content.slice(0, -1) : content;
  return trimmed.split("\n").length;
}

function isEnoent(value: unknown): boolean {
  return typeof value === "object" && value !== null && "code" in value && value.code === "ENOENT";
}
