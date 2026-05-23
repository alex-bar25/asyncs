import { parseNameStatus, parseNumstat, splitMultiFilePatch } from "./parseDiff";
import { partitionFiles } from "./partition";
import type { SimpleGitGateway } from "./simpleGitGateway";
import type { LocalDiffResult } from "./types";

export async function loadStagedDiff(gateway: SimpleGitGateway): Promise<LocalDiffResult> {
  const numstatRaw = await gateway.diffNumstat(["--cached", "HEAD"]);
  const nameStatusRaw = await gateway.diffNameStatus(["--cached", "-M", "HEAD"]);
  const patchRaw = await gateway.diffPatch(["--cached", "-M", "HEAD"], "");

  const { files, skippedBinaries } = partitionFiles(
    parseNumstat(numstatRaw),
    parseNameStatus(nameStatusRaw),
    splitMultiFilePatch(patchRaw),
  );

  return { baseRef: "HEAD", headRef: "STAGED", files, skippedBinaries };
}
