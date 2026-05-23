# Local Diff Source — Design Spec

**Date:** 2026-05-21
**Status:** Drafted, pending Alex review
**Branch:** `feat/local-diff-source`

## Goal

Produce a `ChangedFile[]` (the orchestrator's input shape) from the local git repository so the asyncs review pipeline can review pre-push diffs. Three modes: working-tree-vs-base-branch (the `asyncs review --local` default), staged-vs-HEAD (`--staged`), and an explicit commit range. This is slice 2 of the path to a working end-to-end `asyncs review --local` command; slice 3 composes the pipeline and wires the CLI.

## Non-goals (explicitly out of scope)

- GitHub PR loading (`octokit`). Lives in a future `@asyncs/github` package.
- CLI flag parsing or wiring (`--local`, `--staged`, `--range`). Slice 3.
- `runReviewPipeline` composition. Slice 3.
- Logger injection in `@asyncs/diff`. The package is small enough that a returned `skippedBinaries` array is a sufficient debug breadcrumb. Add a logger if real need surfaces.
- Retry/timeout. Local git operations don't benefit from retries — they either work or they don't.
- Multi-repo / submodule support. Single repo only.
- Working-tree files larger than some size limit. Defer until it becomes a real problem.
- Config-driven base-ref candidates. The default order `["main", "master"]` is hardcoded; caller can override per-call via `baseRef`.

## Architecture

```txt
Caller (CLI / future runReviewPipeline)
        ↓
loadLocalDiff({ mode, cwd? })
        ↓
   ┌────┴────┐
   ↓         ↓         ↓
workingTree staged commitRange  (mode-specific helpers in their own files)
   ↓         ↓         ↓
   └────┬────┘
        ↓
SimpleGitGateway (internal seam wrapping a simple-git instance)
        ↓
git porcelain (rev-parse, diff, status, raw)
        ↓
parseDiff helpers (pure: numstat, name-status, multi-file patch split, untracked synth)
        ↓
LocalDiffResult { baseRef, headRef, files, skippedBinaries }
```

Each mode helper composes the same primitive operations differently. The gateway is the single integration point with `simple-git` so that integration tests can swap it (though for this slice we use real-git tests in tmp dirs).

## Public API

```ts
// packages/diff/src/types.ts
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
```

```ts
// packages/diff/src/loader.ts
export function loadLocalDiff(options: LoadLocalDiffOptions): Promise<LocalDiffResult>;
```

The discriminated `LocalDiffMode` union prevents invalid combinations at the type level (e.g., supplying `baseRef` to a commit-range mode is a compile error).

## `ChangedFile` extension in `@asyncs/core`

```ts
export type ChangedFile = {
  path: string;
  status: ChangedFileStatus;
  additions: number;
  deletions: number;
  patch?: string;
  oldPath?: string; // NEW — only set when status === "renamed"
};
```

Additive optional field. Existing callers and fixtures don't pass `oldPath` and remain compatible. Renames carry the original path so agent prompts can show "renamed from X to Y" instead of two phantom adds/deletes.

`@asyncs/diff` is the only package that ever sets `oldPath` in this slice. Specialist prompt formatters in `@asyncs/agents` may format it differently in a follow-up; current prompts simply show the new path and won't crash on the missing-vs-present field.

## File layout in `packages/diff/`

```txt
packages/diff/
├── package.json
├── src/
│   ├── index.ts           re-exports
│   ├── types.ts           LocalDiffMode, LoadLocalDiffOptions, LocalDiffResult
│   ├── loader.ts          loadLocalDiff (entry point; dispatches to mode helpers)
│   ├── workingTree.ts     working-tree-vs-base helper (incl. untracked scan)
│   ├── staged.ts          staged-vs-HEAD helper
│   ├── commitRange.ts     commit-range helper
│   ├── simpleGitGateway.ts internal test seam wrapping simple-git
│   └── parseDiff.ts       pure parsers + synthesizers
└── test/
    ├── parseDiff.test.ts        pure-helper unit tests (text fixtures)
    └── loader.test.ts           integration tests (real git in tmp dirs)
```

## Components

### `simpleGitGateway.ts`

```ts
export type SimpleGitGateway = {
  resolveBaseRef(candidates: readonly string[]): Promise<string>;
  diffNumstat(args: readonly string[]): Promise<string>;
  diffNameStatus(args: readonly string[]): Promise<string>;
  diffPatch(args: readonly string[], file: string): Promise<string>;
  listUntracked(): Promise<readonly string[]>;
  readFile(path: string): Promise<string>;
};

export function createDefaultGateway(cwd: string): SimpleGitGateway;
```

The default gateway wraps `simpleGit(cwd)`. All git calls go through `git.raw(...)` for predictable porcelain output. The `args` arrays passed to `diffNumstat` / `diffNameStatus` / `diffPatch` are spread INTO each invocation; the gateway prepends the relevant fixed flags. For example, the default gateway implements `diffNumstat(args)` as `git.raw(["diff", "--numstat", ...args])` and `diffNameStatus(args)` as `git.raw(["diff", "--name-status", ...args])`. The caller supplies the ref/range bits (`["--cached", "HEAD"]`, `["main..HEAD"]`, `[baseRef]`); the gateway owns the diff-flavor flag.

`readFile` is on the gateway because untracked-file content goes through it too — keeps the seam holistic.

### `parseDiff.ts`

Four pure functions:

```ts
export type NumstatRow = {
  path: string;
  additions: number | "binary";
  deletions: number | "binary";
};

export function parseNumstat(output: string): NumstatRow[];

export type NameStatusRow = {
  status: ChangedFileStatus;
  path: string;
  oldPath?: string;
};

export function parseNameStatus(output: string): NameStatusRow[];

export function splitMultiFilePatch(output: string): Map<string, string>;

export function synthesizeUntrackedPatch(content: string): string;
```

- `parseNumstat` recognises `-\t-\tpath` as binary (sets both fields to `"binary"`).
- `parseNameStatus` recognises `R<score>\told\tnew` as rename and sets `oldPath`. `A` → "added", `M` → "modified", `D` → "deleted". Anything unrecognised throws.
- `splitMultiFilePatch` splits `git diff` output on `diff --git a/<path> b/<path>` headers and keyed by the new path (right-hand of `b/`).
- `synthesizeUntrackedPatch` produces a `@@ -0,0 +1,N @@` hunk with every content line prefixed by `+`. Trailing newline behavior matches what `git diff` would produce for an added file.

### Mode helpers

Each exports one function returning `Omit<LocalDiffResult, never>`. The loader composes them.

```ts
// workingTree.ts
export async function loadWorkingTreeDiff(
  gateway: SimpleGitGateway,
  options: { baseRef?: string },
): Promise<LocalDiffResult>;
```

Algorithm:
1. Resolve `baseRef`: if `options.baseRef` is set use it; otherwise call `gateway.resolveBaseRef(["main", "master"])`.
2. Get numstat for `<baseRef>` (3-dot `<baseRef>...HEAD` would compare against the common ancestor; we want tree-vs-working, so use 2-dot `<baseRef>` which compares working tree to ref).

Wait — for working-tree mode we want all working-tree changes since the branch split, which is `git diff <baseRef>...HEAD` plus working tree changes. Actually the simplest correct invocation is `git diff <baseRef>` (no `..` or `...`), which compares working tree to baseRef directly. That picks up everything in the working tree (committed-on-branch + uncommitted + staged) relative to the base. This is what users typically want when running "review before pushing".

3. Get name-status (`--name-status -M`) with the same `<baseRef>` arg.
4. Combine numstat + name-status: numstat tells us additions/deletions and binary detection; name-status tells us the status code and oldPath for renames. Match by path (use new-path for renames).
5. For non-binary entries, fetch per-file patch via `gateway.diffPatch([baseRef], file)`.
6. List untracked files via `gateway.listUntracked()`. For each:
   - Read content via `gateway.readFile(path)`.
   - Skip if first 1024 bytes contain a null byte (binary heuristic). Push to `skippedBinaries`.
   - Otherwise synthesize a patch, count lines for `additions`, push to `files` with `status: "added"`.
7. Return `{ baseRef: <resolved>, headRef: "WORKING_TREE", files, skippedBinaries }`.

```ts
// staged.ts
export async function loadStagedDiff(
  gateway: SimpleGitGateway,
): Promise<LocalDiffResult>;
```

Algorithm:
1. numstat with `["--cached", "HEAD"]`.
2. name-status with `["--cached", "-M", "HEAD"]`.
3. Per-file patch with `["--cached", "HEAD"]`.
4. No untracked scan — staged mode only looks at the index.
5. Return `{ baseRef: "HEAD", headRef: "STAGED", files, skippedBinaries }`.

```ts
// commitRange.ts
export async function loadCommitRangeDiff(
  gateway: SimpleGitGateway,
  range: { from: string; to: string },
): Promise<LocalDiffResult>;
```

Algorithm:
1. Verify both `from` and `to` resolve via the gateway (it can use `resolveBaseRef([from])` and `resolveBaseRef([to])`).
2. numstat with `[\`${from}..${to}\`]`.
3. name-status with `[\`${from}..${to}\`, "-M"]`.
4. Per-file patch with `[\`${from}..${to}\`]`.
5. Return `{ baseRef: <resolved from>, headRef: <resolved to>, files, skippedBinaries }`.

### `loader.ts`

```ts
export async function loadLocalDiff(options: LoadLocalDiffOptions): Promise<LocalDiffResult> {
  const cwd = options.cwd ?? process.cwd();
  const gateway = createDefaultGateway(cwd);

  switch (options.mode.kind) {
    case "workingTree":
      return loadWorkingTreeDiff(gateway, { baseRef: options.mode.baseRef });
    case "staged":
      return loadStagedDiff(gateway);
    case "commitRange":
      return loadCommitRangeDiff(gateway, { from: options.mode.from, to: options.mode.to });
  }
}
```

The discriminated union gives us an exhaustive switch with no default case needed (TypeScript's `noImplicitReturns` catches missing cases at compile time).

## Error handling

| Failure | Handling |
|---|---|
| `cwd` is not a git repo | Throw immediately with `cwd` in the message. Gateway construction or first `git.raw` call surfaces this. |
| All base-ref candidates fail to resolve | Throw `Could not resolve base ref. Tried: <candidates>. Pass a baseRef explicitly.` |
| `from` or `to` ref invalid | Throw with the offending ref name. |
| Working tree clean (no changes) | Return `{ files: [], skippedBinaries: [], baseRef, headRef }`. Empty is normal, not error. |
| Untracked file disappears between status and readFile | Skip silently (race condition, no user action needed). |
| Permission error reading untracked file | Throw with the path. Not transient. |
| `simple-git` rejects with unknown error | Rethrow unchanged. |

No retry/timeout logic — `@asyncs/orchestration`'s robustness layer wraps LLM calls, not local I/O.

## Testing strategy

### Pure-helper tests (`parseDiff.test.ts`)

- `parseNumstat`:
  - normal row, multiple rows, trailing newline tolerance
  - binary detected as `-\t-\tpath`
  - paths with spaces (numstat uses tabs, so spaces in paths are fine)
- `parseNameStatus`:
  - `A`/`M`/`D` → "added"/"modified"/"deleted"
  - `R100\told\tnew` → "renamed" with `oldPath: "old"`
  - unknown status throws
- `splitMultiFilePatch`:
  - one file, two files, zero files (empty string returns empty map)
  - patches with embedded `diff --git` text in content (the parser should only split on line-anchored headers)
- `synthesizeUntrackedPatch`:
  - single line, multiple lines, empty content (zero-line file)
  - trailing newline preserved

### Integration tests (`loader.test.ts`)

Helper:

```ts
async function createTestRepo(): Promise<{
  cwd: string;
  git: (args: string[]) => Promise<void>;
  write: (path: string, content: string) => Promise<void>;
  cleanup: () => Promise<void>;
}>;
```

Uses `Bun.spawn(["git", ...args], { cwd })` (or `execa` if installed) and `fs.promises` for writes. Each test creates its own repo in `os.tmpdir() + "/asyncs-test-" + random` and cleans up via the returned `cleanup`.

Tests:

1. **Working-tree mode happy path** — init repo, commit `a.txt`, branch `main`, modify `a.txt` and add untracked `b.txt`, call loader with `mode: { kind: "workingTree" }`, expect 2 files: `{ path: "a.txt", status: "modified", patch: <has @@ markers> }` and `{ path: "b.txt", status: "added", patch: <synthesized>, additions: <line count>, deletions: 0 }`.
2. **Staged mode happy path** — stage one file via `git add`, leave another working-tree-only, call loader with `mode: { kind: "staged" }`, expect only the staged file.
3. **Commit-range mode happy path** — make 2 commits, call loader with the SHAs as `from`/`to`, expect only the second-commit changes.
4. **Rename detection** — `git mv old.txt new.txt`, commit, working-tree diff against the prior commit, expect `{ status: "renamed", path: "new.txt", oldPath: "old.txt" }`.
5. **Binary detection** — write a file with `\0` bytes, commit, expect it in `skippedBinaries` not `files`.
6. **Empty diff** — clean repo with one commit, working-tree mode, expect `files: []` and `skippedBinaries: []` (no throw).
7. **Not a git repo** — point loader at a fresh tmp dir without `git init`, expect throw with `cwd` in message.
8. **Base ref resolution failed** — repo with only commit on a branch named `develop`, call working-tree without `baseRef`, expect throw mentioning `main` and `master`.
9. **Explicit base ref** — same setup but pass `baseRef: "develop"`, expect success.
10. **Binary untracked file** — write an untracked file with `\0` bytes, expect it in `skippedBinaries` not `files`.

All integration tests use real git (`bun:test` is fine for this). Slower per-test (~50ms) but verifies the actual behavior of simple-git + git porcelain on this system.

## Dependencies

- Runtime: `simple-git` → `@asyncs/diff`
- Workspace: `@asyncs/diff` depends on `@asyncs/core` for `ChangedFile`
- Dev (for tests): none new — Bun's built-in `node:os`, `node:fs/promises`, `Bun.spawn` cover the temp-repo helper

## Risks and trade-offs

- **`git diff <baseRef>` vs `git diff <baseRef>...HEAD`.** Chose 2-dot (working-tree-vs-ref) over 3-dot (common-ancestor-vs-HEAD) because users running "review --local" want to see everything they'd be reviewing on a PR, including uncommitted changes. 3-dot would miss working-tree changes.
- **Binary heuristic (null byte in first 1024 bytes).** Standard heuristic, works for ~99% of cases. False positives possible on UTF-16 text files (which contain nulls); false negatives on small binary files. Acceptable for v1.
- **Test infrastructure cost.** Real-git tests in tmp dirs are slow (~50ms each). Suite-wide we'll add ~500ms. Acceptable given the alternative (stubbing every git porcelain interaction) is more code to maintain and less honest.
- **No streaming of large diffs.** A 50MB diff fits in memory. Multi-GB diffs would be a problem. Not worth solving until it bites.

## Acceptance criteria

- `bun run check` green.
- New package `@asyncs/diff` is workspace-resolvable.
- `loadLocalDiff({ mode: { kind: "workingTree" } })` returns a non-empty `ChangedFile[]` on a repo with working-tree changes.
- Renames produce `status: "renamed"` with `oldPath` set.
- Binary files appear in `skippedBinaries`, not in `files`.
- Untracked text files appear as `status: "added"` with synthesized patch.
- All 10 integration tests + parser unit tests pass.
- No new `as` casts.
- `simple-git` is the only new runtime dep (in `@asyncs/diff`'s package.json).
