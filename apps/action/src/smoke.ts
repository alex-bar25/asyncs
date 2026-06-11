import { DEFAULT_REVIEW_REQUEST_OPTIONS, type ReviewRequest } from "@asyncs/core";
import type { LocalDiffMode } from "@asyncs/diff";
import { resolveAnthropicProvider } from "./provider";
import { reviewDiff } from "./runner";

function parseDiffMode(args: readonly string[]): LocalDiffMode {
  const [from, to] = args;

  if (from !== undefined && to !== undefined) {
    return { kind: "commitRange", from, to };
  }

  return { kind: "workingTree" };
}

export async function runSmoke(args: readonly string[]): Promise<string> {
  const { provider, model } = resolveAnthropicProvider();

  const request: ReviewRequest = {
    mode: DEFAULT_REVIEW_REQUEST_OPTIONS.mode,
    agents: [...DEFAULT_REVIEW_REQUEST_OPTIONS.agents],
  };

  const { result, diff } = await reviewDiff({
    request,
    diff: parseDiffMode(args),
    provider,
    model,
  });

  const header = `${diff.baseRef}..${diff.headRef}, ${diff.skippedBinaries.length} binaries skipped`;

  return `${header}\n\n${result.markdown}`;
}

if (import.meta.main) {
  try {
    const output = await runSmoke(Bun.argv.slice(2));
    process.stdout.write(`${output}\n`);
    process.exit(0);
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
