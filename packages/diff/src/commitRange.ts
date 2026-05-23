import { parseNameStatus, parseNumstat, splitMultiFilePatch } from "./parseDiff";
import { partitionFiles } from "./partition";
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

  const { files, skippedBinaries } = partitionFiles(
    parseNumstat(numstatRaw),
    parseNameStatus(nameStatusRaw),
    splitMultiFilePatch(patchRaw),
  );

  return { baseRef: range.from, headRef: range.to, files, skippedBinaries };
}
