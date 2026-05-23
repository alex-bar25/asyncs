# Local Diff Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `@asyncs/diff` package so the asyncs review pipeline can read changed files from a local git repository in three modes — working tree vs base branch, staged vs HEAD, and explicit commit range — returning the orchestrator's existing `ChangedFile[]` shape plus a list of skipped binaries.

**Architecture:** New package `@asyncs/diff` exposes one entry point `loadLocalDiff({ mode, cwd? })`. A discriminated `LocalDiffMode` union dispatches to mode-specific helpers (`workingTree`, `staged`, `commitRange`). All git work goes through a single `SimpleGitGateway` seam that wraps `simple-git`. Pure parsers in `parseDiff.ts` handle numstat, name-status, multi-file patches, and untracked-file patch synthesis. Tests use real `simple-git` against tmp directories.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`), Bun + `bun:test`, `simple-git` (new dep in `@asyncs/diff`), `fs.promises` + `simple-git` for test scaffolding.

**Spec:** `docs/superpowers/specs/2026-05-21-local-diff-source-design.md`

---

## File Structure

**Create:**
- `packages/diff/package.json`
- `packages/diff/src/index.ts` — re-exports
- `packages/diff/src/types.ts` — `LocalDiffMode`, `LoadLocalDiffOptions`, `LocalDiffResult`
- `packages/diff/src/loader.ts` — `loadLocalDiff` (entry point that switches on `mode.kind`)
- `packages/diff/src/workingTree.ts` — `loadWorkingTreeDiff`
- `packages/diff/src/staged.ts` — `loadStagedDiff`
- `packages/diff/src/commitRange.ts` — `loadCommitRangeDiff`
- `packages/diff/src/simpleGitGateway.ts` — `SimpleGitGateway` type + `createDefaultGateway`
- `packages/diff/src/parseDiff.ts` — `parseNumstat`, `parseNameStatus`, `splitMultiFilePatch`, `synthesizeUntrackedPatch`
- `packages/diff/test/parseDiff.test.ts` — pure-helper unit tests
- `packages/diff/test/helpers/createTestRepo.ts` — shared tmp-repo helper (uses simple-git directly)
- `packages/diff/test/staged.test.ts` — staged-mode integration
- `packages/diff/test/commitRange.test.ts` — commit-range integration
- `packages/diff/test/workingTree.test.ts` — working-tree integration (incl. untracked + rename + binary)
- `packages/diff/test/loader.test.ts` — entry-point dispatch + error paths

**Modify:**
- `packages/core/src/types.ts` — add `oldPath?: string` to `ChangedFile`

---

## Task 1: Extend `ChangedFile` with `oldPath`

**Files:**
- Modify: `packages/core/src/types.ts`

### Steps

- [ ] **Step 1: Add `oldPath` to `ChangedFile`**

In `packages/core/src/types.ts`, update the `ChangedFile` declaration so it reads:

```ts
export type ChangedFile = {
  path: string;
  status: ChangedFileStatus;
  additions: number;
  deletions: number;
  patch?: string;
  oldPath?: string;
};
```

The new field is additive and optional — no existing test or fixture needs to change.

- [ ] **Step 2: Run check**

Run: `bun run check`

Expected: 91 pass, 0 fail. Typecheck, lint, format clean.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/types.ts
git commit -m "feat(core): add optional oldPath to ChangedFile for renames"
```

---

## Task 2: Scaffold `@asyncs/diff` package

**Files:**
- Create: `packages/diff/package.json`
- Create: `packages/diff/src/index.ts`
- Create: `packages/diff/src/types.ts`
- Create: `packages/diff/src/loader.ts`

### Steps

- [ ] **Step 1: Create `packages/diff/package.json`**

```json
{
  "name": "@asyncs/diff",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@asyncs/core": "workspace:*"
  }
}
```

- [ ] **Step 2: Install `simple-git` into `@asyncs/diff`**

Run:

```bash
cd packages/diff && bun add simple-git
cd ../..
```

This populates the `dependencies` block in `package.json` and updates `bun.lock`.

- [ ] **Step 3: Create `packages/diff/src/types.ts`**

```ts
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

- [ ] **Step 4: Create `packages/diff/src/loader.ts` (stub)**

```ts
import type { LoadLocalDiffOptions, LocalDiffResult } from "./types";

export async function loadLocalDiff(options: LoadLocalDiffOptions): Promise<LocalDiffResult> {
  switch (options.mode.kind) {
    case "workingTree":
    case "staged":
    case "commitRange":
      throw new Error(`loadLocalDiff: mode "${options.mode.kind}" not implemented yet`);
  }
}
```

This stub exists so the package builds while subsequent tasks fill in real logic. Each mode helper lands in its own task and the switch is replaced incrementally.

- [ ] **Step 5: Create `packages/diff/src/index.ts`**

```ts
export * from "./loader";
export type * from "./types";
```

- [ ] **Step 6: Run check**

Run: `bun run check`

Expected: green. The new package compiles, lints, formats. Tests still 91.

- [ ] **Step 7: Commit**

```bash
git add packages/diff/package.json bun.lock packages/diff/src/index.ts packages/diff/src/types.ts packages/diff/src/loader.ts
git commit -m "$(cat <<'EOF'
feat(diff): scaffold @asyncs/diff package

Adds the package skeleton with simple-git as runtime dep, the public
LocalDiffMode discriminated union and LocalDiffResult shape, and a
loader stub that throws until mode helpers land in subsequent tasks.
EOF
)"
```

---

## Task 3: TDD `parseNumstat`

**Files:**
- Create: `packages/diff/src/parseDiff.ts`
- Create: `packages/diff/test/parseDiff.test.ts`

### Steps

- [ ] **Step 1: Write the failing test**

Create `packages/diff/test/parseDiff.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { parseNumstat } from "../src/parseDiff";

describe("parseNumstat", () => {
  test("parses a single row with additions and deletions", () => {
    expect(parseNumstat("12\t3\tsrc/a.ts\n")).toEqual([
      { path: "src/a.ts", additions: 12, deletions: 3 },
    ]);
  });

  test("parses multiple rows", () => {
    const output = "12\t3\tsrc/a.ts\n0\t5\tsrc/b.ts\n";

    expect(parseNumstat(output)).toEqual([
      { path: "src/a.ts", additions: 12, deletions: 3 },
      { path: "src/b.ts", additions: 0, deletions: 5 },
    ]);
  });

  test("marks binary rows with literal 'binary' for both counts", () => {
    expect(parseNumstat("-\t-\tassets/icon.png\n")).toEqual([
      { path: "assets/icon.png", additions: "binary", deletions: "binary" },
    ]);
  });

  test("tolerates trailing newline absence", () => {
    expect(parseNumstat("12\t3\tsrc/a.ts")).toEqual([
      { path: "src/a.ts", additions: 12, deletions: 3 },
    ]);
  });

  test("ignores blank lines", () => {
    expect(parseNumstat("\n12\t3\tsrc/a.ts\n\n")).toEqual([
      { path: "src/a.ts", additions: 12, deletions: 3 },
    ]);
  });

  test("returns empty array on empty input", () => {
    expect(parseNumstat("")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/diff/test/parseDiff.test.ts`

Expected: FAIL — `Cannot find module "../src/parseDiff"`.

- [ ] **Step 3: Implement `parseNumstat`**

Create `packages/diff/src/parseDiff.ts` with:

```ts
export type NumstatRow = {
  path: string;
  additions: number | "binary";
  deletions: number | "binary";
};

export function parseNumstat(output: string): NumstatRow[] {
  const rows: NumstatRow[] = [];

  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();

    if (line.length === 0) {
      continue;
    }

    const [addedField, deletedField, ...rest] = line.split("\t");
    const path = rest.join("\t");

    if (addedField === undefined || deletedField === undefined || path.length === 0) {
      throw new Error(`parseNumstat: malformed numstat line: ${rawLine}`);
    }

    if (addedField === "-" && deletedField === "-") {
      rows.push({ path, additions: "binary", deletions: "binary" });
      continue;
    }

    const additions = Number.parseInt(addedField, 10);
    const deletions = Number.parseInt(deletedField, 10);

    if (Number.isNaN(additions) || Number.isNaN(deletions)) {
      throw new Error(`parseNumstat: non-numeric counts in line: ${rawLine}`);
    }

    rows.push({ path, additions, deletions });
  }

  return rows;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/diff/test/parseDiff.test.ts`

Expected: 6 pass.

- [ ] **Step 5: Full check**

Run: `bun run check`

Expected: green, 97 tests total (91 + 6 new).

- [ ] **Step 6: Commit**

```bash
git add packages/diff/src/parseDiff.ts packages/diff/test/parseDiff.test.ts
git commit -m "feat(diff): add parseNumstat helper for git diff --numstat output"
```

---

## Task 4: TDD `parseNameStatus`

**Files:**
- Modify: `packages/diff/src/parseDiff.ts`
- Modify: `packages/diff/test/parseDiff.test.ts`

### Steps

- [ ] **Step 1: Write the failing tests**

At the top of `packages/diff/test/parseDiff.test.ts`, update the import:

```ts
import { parseNameStatus, parseNumstat } from "../src/parseDiff";
```

Append at the bottom of the file:

```ts
describe("parseNameStatus", () => {
  test("parses A/M/D status codes", () => {
    const output = "A\tsrc/new.ts\nM\tsrc/changed.ts\nD\tsrc/gone.ts\n";

    expect(parseNameStatus(output)).toEqual([
      { status: "added", path: "src/new.ts" },
      { status: "modified", path: "src/changed.ts" },
      { status: "deleted", path: "src/gone.ts" },
    ]);
  });

  test("parses R<score> as renamed with oldPath", () => {
    expect(parseNameStatus("R100\tsrc/old.ts\tsrc/new.ts\n")).toEqual([
      { status: "renamed", path: "src/new.ts", oldPath: "src/old.ts" },
    ]);
  });

  test("tolerates trailing newline absence", () => {
    expect(parseNameStatus("A\tsrc/new.ts")).toEqual([
      { status: "added", path: "src/new.ts" },
    ]);
  });

  test("ignores blank lines", () => {
    expect(parseNameStatus("\nA\tsrc/new.ts\n\n")).toEqual([
      { status: "added", path: "src/new.ts" },
    ]);
  });

  test("returns empty array on empty input", () => {
    expect(parseNameStatus("")).toEqual([]);
  });

  test("throws on unknown status code", () => {
    expect(() => parseNameStatus("X\tsrc/weird.ts\n")).toThrow("unknown status");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/diff/test/parseDiff.test.ts -t "parseNameStatus"`

Expected: FAIL — `parseNameStatus` not exported.

- [ ] **Step 3: Add `parseNameStatus` to `packages/diff/src/parseDiff.ts`**

Add this import at the top of the file:

```ts
import type { ChangedFileStatus } from "@asyncs/core";
```

Append:

```ts
export type NameStatusRow = {
  status: ChangedFileStatus;
  path: string;
  oldPath?: string;
};

const STATUS_FROM_CODE = {
  A: "added",
  M: "modified",
  D: "deleted",
} as const satisfies Record<"A" | "M" | "D", ChangedFileStatus>;

export function parseNameStatus(output: string): NameStatusRow[] {
  const rows: NameStatusRow[] = [];

  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();

    if (line.length === 0) {
      continue;
    }

    const parts = line.split("\t");
    const code = parts[0];

    if (code === undefined) {
      throw new Error(`parseNameStatus: empty status code in line: ${rawLine}`);
    }

    if (code === "A" || code === "M" || code === "D") {
      const path = parts[1];

      if (path === undefined || path.length === 0) {
        throw new Error(`parseNameStatus: missing path in line: ${rawLine}`);
      }

      rows.push({ status: STATUS_FROM_CODE[code], path });
      continue;
    }

    if (code.startsWith("R")) {
      const oldPath = parts[1];
      const newPath = parts[2];

      if (oldPath === undefined || newPath === undefined) {
        throw new Error(`parseNameStatus: missing rename paths in line: ${rawLine}`);
      }

      rows.push({ status: "renamed", path: newPath, oldPath });
      continue;
    }

    throw new Error(`parseNameStatus: unknown status code "${code}" in line: ${rawLine}`);
  }

  return rows;
}
```

> The `as const satisfies Record<...>` form is the project-blessed pattern for literal narrowing on a constant. It is NOT a free-standing `as` cast on a value — it is a type-system-only check that the literal object matches the constraint.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/diff/test/parseDiff.test.ts -t "parseNameStatus"`

Expected: 6 pass.

- [ ] **Step 5: Full check**

Run: `bun run check`

Expected: green, 103 tests total.

- [ ] **Step 6: Commit**

```bash
git add packages/diff/src/parseDiff.ts packages/diff/test/parseDiff.test.ts
git commit -m "feat(diff): add parseNameStatus helper with rename detection"
```

---

## Task 5: TDD `splitMultiFilePatch`

**Files:**
- Modify: `packages/diff/src/parseDiff.ts`
- Modify: `packages/diff/test/parseDiff.test.ts`

### Steps

- [ ] **Step 1: Write the failing tests**

Update the import at the top of `packages/diff/test/parseDiff.test.ts`:

```ts
import { parseNameStatus, parseNumstat, splitMultiFilePatch } from "../src/parseDiff";
```

Append:

```ts
describe("splitMultiFilePatch", () => {
  test("splits a two-file diff keyed by the new path", () => {
    const output = [
      "diff --git a/src/a.ts b/src/a.ts",
      "index 1234..5678 100644",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "diff --git a/src/b.ts b/src/b.ts",
      "new file mode 100644",
      "index 0000..abcd",
      "--- /dev/null",
      "+++ b/src/b.ts",
      "@@ -0,0 +1 @@",
      "+hello",
    ].join("\n");

    const result = splitMultiFilePatch(output);

    expect(result.size).toBe(2);
    expect(result.get("src/a.ts")).toContain("@@ -1 +1 @@");
    expect(result.get("src/a.ts")).toContain("+new");
    expect(result.get("src/b.ts")).toContain("@@ -0,0 +1 @@");
    expect(result.get("src/b.ts")).toContain("+hello");
  });

  test("returns empty map on empty input", () => {
    expect(splitMultiFilePatch("").size).toBe(0);
  });

  test("does not split on patch-header text inside a hunk body", () => {
    const output = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1 +1 @@",
      "-old",
      '+console.log("diff --git a/foo b/bar")',
    ].join("\n");

    const result = splitMultiFilePatch(output);

    expect(result.size).toBe(1);
    expect(result.get("src/a.ts")).toContain('+console.log("diff --git a/foo b/bar")');
  });

  test("uses the new path (right of b/) as the key for renames", () => {
    const output = [
      "diff --git a/src/old.ts b/src/new.ts",
      "similarity index 100%",
      "rename from src/old.ts",
      "rename to src/new.ts",
    ].join("\n");

    const result = splitMultiFilePatch(output);

    expect(result.has("src/new.ts")).toBe(true);
    expect(result.has("src/old.ts")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/diff/test/parseDiff.test.ts -t "splitMultiFilePatch"`

Expected: FAIL — `splitMultiFilePatch` not exported.

- [ ] **Step 3: Add `splitMultiFilePatch` to `packages/diff/src/parseDiff.ts`**

Append:

```ts
const FILE_HEADER_REGEX = /^diff --git a\/(.+?) b\/(.+)$/;

export function splitMultiFilePatch(output: string): Map<string, string> {
  const files = new Map<string, string>();

  if (output.length === 0) {
    return files;
  }

  const lines = output.split("\n");
  let currentPath: string | undefined = undefined;
  let currentLines: string[] = [];

  for (const line of lines) {
    const header = FILE_HEADER_REGEX.exec(line);

    if (header !== null) {
      if (currentPath !== undefined) {
        files.set(currentPath, currentLines.join("\n"));
      }

      const newPath = header[2];

      if (newPath === undefined) {
        throw new Error(`splitMultiFilePatch: malformed file header: ${line}`);
      }

      currentPath = newPath;
      currentLines = [line];
      continue;
    }

    if (currentPath !== undefined) {
      currentLines.push(line);
    }
  }

  if (currentPath !== undefined) {
    files.set(currentPath, currentLines.join("\n"));
  }

  return files;
}
```

The regex uses `^` (line-anchored) which only matches when applied to a single line — so patch-header text embedded inside a hunk body never triggers a split.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/diff/test/parseDiff.test.ts -t "splitMultiFilePatch"`

Expected: 4 pass.

- [ ] **Step 5: Full check**

Run: `bun run check`

Expected: green, 107 tests total.

- [ ] **Step 6: Commit**

```bash
git add packages/diff/src/parseDiff.ts packages/diff/test/parseDiff.test.ts
git commit -m "feat(diff): add splitMultiFilePatch helper keyed by new path"
```

---

## Task 6: TDD `synthesizeUntrackedPatch`

**Files:**
- Modify: `packages/diff/src/parseDiff.ts`
- Modify: `packages/diff/test/parseDiff.test.ts`

### Steps

- [ ] **Step 1: Write the failing tests**

Update the import at the top of `packages/diff/test/parseDiff.test.ts`:

```ts
import {
  parseNameStatus,
  parseNumstat,
  splitMultiFilePatch,
  synthesizeUntrackedPatch,
} from "../src/parseDiff";
```

Append:

```ts
describe("synthesizeUntrackedPatch", () => {
  test("renders a single-line file as a +1 hunk", () => {
    const patch = synthesizeUntrackedPatch("hello\n");

    expect(patch).toContain("@@ -0,0 +1,1 @@");
    expect(patch).toContain("+hello");
  });

  test("renders a multi-line file with one + line per content line", () => {
    const patch = synthesizeUntrackedPatch("a\nb\nc\n");

    expect(patch).toContain("@@ -0,0 +1,3 @@");
    expect(patch).toContain("+a");
    expect(patch).toContain("+b");
    expect(patch).toContain("+c");
  });

  test("returns a zero-line header on empty content", () => {
    const patch = synthesizeUntrackedPatch("");

    expect(patch).toContain("@@ -0,0 +0,0 @@");
  });

  test("preserves a trailing line without a final newline", () => {
    const patch = synthesizeUntrackedPatch("a\nb");

    expect(patch).toContain("@@ -0,0 +1,2 @@");
    expect(patch).toContain("+a");
    expect(patch).toContain("+b");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/diff/test/parseDiff.test.ts -t "synthesizeUntrackedPatch"`

Expected: FAIL — `synthesizeUntrackedPatch` not exported.

- [ ] **Step 3: Add `synthesizeUntrackedPatch` to `packages/diff/src/parseDiff.ts`**

Append:

```ts
export function synthesizeUntrackedPatch(content: string): string {
  if (content.length === 0) {
    return "@@ -0,0 +0,0 @@";
  }

  const trimmed = content.endsWith("\n") ? content.slice(0, -1) : content;
  const lines = trimmed.split("\n");
  const prefixed = lines.map((line) => `+${line}`);

  return [`@@ -0,0 +1,${lines.length} @@`, ...prefixed].join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/diff/test/parseDiff.test.ts -t "synthesizeUntrackedPatch"`

Expected: 4 pass.

- [ ] **Step 5: Full check**

Run: `bun run check`

Expected: green, 111 tests total.

- [ ] **Step 6: Commit**

```bash
git add packages/diff/src/parseDiff.ts packages/diff/test/parseDiff.test.ts
git commit -m "feat(diff): add synthesizeUntrackedPatch for added-file diff shape"
```

---

## Task 7: `SimpleGitGateway` + `createTestRepo` helper

**Files:**
- Create: `packages/diff/src/simpleGitGateway.ts`
- Create: `packages/diff/test/helpers/createTestRepo.ts`

### Steps

- [ ] **Step 1: Create `packages/diff/src/simpleGitGateway.ts`**

```ts
import { promises as fs } from "node:fs";
import path from "node:path";
import { simpleGit } from "simple-git";

export type SimpleGitGateway = {
  resolveBaseRef(candidates: readonly string[]): Promise<string>;
  diffNumstat(args: readonly string[]): Promise<string>;
  diffNameStatus(args: readonly string[]): Promise<string>;
  diffPatch(args: readonly string[], file: string): Promise<string>;
  listUntracked(): Promise<readonly string[]>;
  readFile(filePath: string): Promise<string>;
};

export function createDefaultGateway(cwd: string): SimpleGitGateway {
  const git = simpleGit(cwd);

  return {
    async resolveBaseRef(candidates) {
      for (const candidate of candidates) {
        try {
          await git.raw(["rev-parse", "--verify", candidate]);
          return candidate;
        } catch {
          continue;
        }
      }

      throw new Error(
        `Could not resolve base ref. Tried: ${candidates.join(", ")}. Pass a baseRef explicitly.`,
      );
    },
    async diffNumstat(args) {
      return git.raw(["diff", "--numstat", ...args]);
    },
    async diffNameStatus(args) {
      return git.raw(["diff", "--name-status", ...args]);
    },
    async diffPatch(args, file) {
      const params = ["diff", ...args];

      if (file.length > 0) {
        params.push("--", file);
      }

      return git.raw(params);
    },
    async listUntracked() {
      const output = await git.raw(["status", "--porcelain"]);
      const untracked: string[] = [];

      for (const line of output.split("\n")) {
        if (line.startsWith("?? ")) {
          untracked.push(line.slice(3).trim());
        }
      }

      return untracked;
    },
    async readFile(filePath) {
      const absolute = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
      return fs.readFile(absolute, "utf8");
    },
  };
}
```

> The `file` parameter on `diffPatch` is optional-via-empty-string: when callers pass `""` they get a multi-file diff over the whole ref range; when they pass a specific path the diff is scoped to that file. This keeps the gateway shape simple.

- [ ] **Step 2: Create `packages/diff/test/helpers/createTestRepo.ts`**

The helper uses `simple-git` directly — same library the gateway uses, no separate process-spawning layer. Each test gets a fresh tmp dir.

```ts
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";

export type TestRepo = {
  cwd: string;
  git: SimpleGit;
  write: (filePath: string, content: string) => Promise<void>;
  remove: (filePath: string) => Promise<void>;
  cleanup: () => Promise<void>;
};

export async function createTestRepo(): Promise<TestRepo> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "asyncs-diff-"));
  const git = simpleGit(cwd);

  await git.init(["--initial-branch=main"]);
  await git.addConfig("user.email", "test@asyncs.local");
  await git.addConfig("user.name", "asyncs-test");
  await git.addConfig("commit.gpgSign", "false");

  return {
    cwd,
    git,
    async write(filePath, content) {
      const absolute = path.join(cwd, filePath);
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      await fs.writeFile(absolute, content);
    },
    async remove(filePath) {
      await fs.rm(path.join(cwd, filePath), { force: true });
    },
    async cleanup() {
      await fs.rm(cwd, { recursive: true, force: true });
    },
  };
}
```

- [ ] **Step 3: Run check**

Run: `bun run check`

Expected: green, 111 tests (no new tests yet; gateway and helper are exercised by subsequent tasks).

- [ ] **Step 4: Commit**

```bash
git add packages/diff/src/simpleGitGateway.ts packages/diff/test/helpers/createTestRepo.ts
git commit -m "$(cat <<'EOF'
feat(diff): add SimpleGitGateway and createTestRepo helper

Gateway centralizes every porcelain call via simple-git so mode helpers
and tests compose against one seam. createTestRepo uses simple-git
directly to init a tmp-dir repo for integration tests, with helpers for
write/remove/cleanup.
EOF
)"
```

---

## Task 8: TDD `loadStagedDiff`

**Files:**
- Create: `packages/diff/src/staged.ts`
- Create: `packages/diff/test/staged.test.ts`
- Modify: `packages/diff/src/loader.ts`

### Steps

- [ ] **Step 1: Write the failing test**

Create `packages/diff/test/staged.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { loadLocalDiff } from "../src/loader";
import { createTestRepo, type TestRepo } from "./helpers/createTestRepo";

describe("loadLocalDiff staged mode", () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepo();
    await repo.write("a.txt", "first\n");
    await repo.git.add(["."]);
    await repo.git.commit("initial");
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  test("returns only staged changes, not working-tree-only changes", async () => {
    await repo.write("a.txt", "first\nsecond\n");
    await repo.git.add(["a.txt"]);
    await repo.write("b.txt", "working-tree-only\n");

    const result = await loadLocalDiff({ mode: { kind: "staged" }, cwd: repo.cwd });

    expect(result.baseRef).toBe("HEAD");
    expect(result.headRef).toBe("STAGED");
    expect(result.files.map((file) => file.path)).toEqual(["a.txt"]);
    expect(result.files[0]?.status).toBe("modified");
    expect(result.files[0]?.additions).toBe(1);
    expect(result.files[0]?.deletions).toBe(0);
    expect(result.files[0]?.patch).toContain("+second");
    expect(result.skippedBinaries).toEqual([]);
  });

  test("returns empty files when nothing is staged", async () => {
    const result = await loadLocalDiff({ mode: { kind: "staged" }, cwd: repo.cwd });

    expect(result.files).toEqual([]);
    expect(result.skippedBinaries).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/diff/test/staged.test.ts`

Expected: FAIL — the loader still throws "not implemented yet" for staged mode.

- [ ] **Step 3: Implement `packages/diff/src/staged.ts`**

```ts
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
```

- [ ] **Step 4: Wire the staged branch in `packages/diff/src/loader.ts`**

Replace the file contents with:

```ts
import { createDefaultGateway } from "./simpleGitGateway";
import { loadStagedDiff } from "./staged";
import type { LoadLocalDiffOptions, LocalDiffResult } from "./types";

export async function loadLocalDiff(options: LoadLocalDiffOptions): Promise<LocalDiffResult> {
  const cwd = options.cwd ?? process.cwd();
  const gateway = createDefaultGateway(cwd);

  switch (options.mode.kind) {
    case "staged":
      return loadStagedDiff(gateway);
    case "workingTree":
    case "commitRange":
      throw new Error(`loadLocalDiff: mode "${options.mode.kind}" not implemented yet`);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test packages/diff/test/staged.test.ts`

Expected: 2 pass.

- [ ] **Step 6: Full check**

Run: `bun run check`

Expected: green, 113 tests total.

- [ ] **Step 7: Commit**

```bash
git add packages/diff/src/staged.ts packages/diff/src/loader.ts packages/diff/test/staged.test.ts
git commit -m "$(cat <<'EOF'
feat(diff): implement staged-vs-HEAD diff mode

loadLocalDiff({ mode: { kind: "staged" } }) reads the index against
HEAD via simple-git, parses numstat + name-status + patch text, and
returns ChangedFile[] (skipping binaries). Working-tree-only changes
are not surfaced in this mode.
EOF
)"
```

---

## Task 9: TDD `loadCommitRangeDiff`

**Files:**
- Create: `packages/diff/src/commitRange.ts`
- Create: `packages/diff/test/commitRange.test.ts`
- Modify: `packages/diff/src/loader.ts`

### Steps

- [ ] **Step 1: Write the failing test**

Create `packages/diff/test/commitRange.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { loadLocalDiff } from "../src/loader";
import { createTestRepo, type TestRepo } from "./helpers/createTestRepo";

describe("loadLocalDiff commit-range mode", () => {
  let repo: TestRepo;
  let firstSha = "";
  let secondSha = "";

  beforeEach(async () => {
    repo = await createTestRepo();

    await repo.write("a.txt", "v1\n");
    await repo.git.add(["."]);
    await repo.git.commit("first");
    firstSha = (await repo.git.revparse(["HEAD"])).trim();

    await repo.write("a.txt", "v1\nv2\n");
    await repo.write("b.txt", "new\n");
    await repo.git.add(["."]);
    await repo.git.commit("second");
    secondSha = (await repo.git.revparse(["HEAD"])).trim();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  test("returns only files changed in the given range", async () => {
    const result = await loadLocalDiff({
      mode: { kind: "commitRange", from: firstSha, to: secondSha },
      cwd: repo.cwd,
    });

    expect(result.baseRef).toBe(firstSha);
    expect(result.headRef).toBe(secondSha);

    const paths = result.files.map((file) => file.path).sort();
    expect(paths).toEqual(["a.txt", "b.txt"]);

    const modified = result.files.find((file) => file.path === "a.txt");
    expect(modified?.status).toBe("modified");
    expect(modified?.patch).toContain("+v2");

    const added = result.files.find((file) => file.path === "b.txt");
    expect(added?.status).toBe("added");
    expect(added?.patch).toContain("+new");
  });

  test("throws when `from` ref does not resolve", async () => {
    await expect(
      loadLocalDiff({
        mode: { kind: "commitRange", from: "doesnotexist", to: secondSha },
        cwd: repo.cwd,
      }),
    ).rejects.toThrow("doesnotexist");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/diff/test/commitRange.test.ts`

Expected: FAIL — loader still throws for commit-range mode.

- [ ] **Step 3: Implement `packages/diff/src/commitRange.ts`**

```ts
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
```

- [ ] **Step 4: Wire the commit-range branch in `packages/diff/src/loader.ts`**

Replace the file contents with:

```ts
import { loadCommitRangeDiff } from "./commitRange";
import { createDefaultGateway } from "./simpleGitGateway";
import { loadStagedDiff } from "./staged";
import type { LoadLocalDiffOptions, LocalDiffResult } from "./types";

export async function loadLocalDiff(options: LoadLocalDiffOptions): Promise<LocalDiffResult> {
  const cwd = options.cwd ?? process.cwd();
  const gateway = createDefaultGateway(cwd);

  switch (options.mode.kind) {
    case "staged":
      return loadStagedDiff(gateway);
    case "commitRange":
      return loadCommitRangeDiff(gateway, { from: options.mode.from, to: options.mode.to });
    case "workingTree":
      throw new Error(`loadLocalDiff: mode "${options.mode.kind}" not implemented yet`);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test packages/diff/test/commitRange.test.ts`

Expected: 2 pass.

- [ ] **Step 6: Full check**

Run: `bun run check`

Expected: green, 115 tests total.

- [ ] **Step 7: Commit**

```bash
git add packages/diff/src/commitRange.ts packages/diff/src/loader.ts packages/diff/test/commitRange.test.ts
git commit -m "$(cat <<'EOF'
feat(diff): implement commit-range diff mode

loadLocalDiff({ mode: { kind: "commitRange", from, to } }) resolves
both refs and runs `git diff <from>..<to>` with rename detection.
Throws when either ref fails to resolve.
EOF
)"
```

---

## Task 10: TDD `loadWorkingTreeDiff` — tracked-file changes

This task ships the working-tree mode for tracked-file changes only. Untracked files and binary detection ship in Task 11.

**Files:**
- Create: `packages/diff/src/workingTree.ts`
- Create: `packages/diff/test/workingTree.test.ts`
- Modify: `packages/diff/src/loader.ts`

### Steps

- [ ] **Step 1: Write the failing test**

Create `packages/diff/test/workingTree.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { loadLocalDiff } from "../src/loader";
import { createTestRepo, type TestRepo } from "./helpers/createTestRepo";

describe("loadLocalDiff workingTree mode (tracked changes)", () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepo();
    await repo.write("a.txt", "first\n");
    await repo.git.add(["."]);
    await repo.git.commit("initial");
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  test("returns tracked working-tree changes against main", async () => {
    await repo.git.checkoutLocalBranch("feature");
    await repo.write("a.txt", "first\nsecond\n");

    const result = await loadLocalDiff({
      mode: { kind: "workingTree" },
      cwd: repo.cwd,
    });

    expect(result.baseRef).toBe("main");
    expect(result.headRef).toBe("WORKING_TREE");
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe("a.txt");
    expect(result.files[0]?.status).toBe("modified");
    expect(result.files[0]?.additions).toBe(1);
    expect(result.files[0]?.patch).toContain("+second");
  });

  test("detects a rename via git mv against the base", async () => {
    await repo.git.checkoutLocalBranch("feature");
    await repo.git.raw(["mv", "a.txt", "renamed.txt"]);
    await repo.git.commit("rename");

    const result = await loadLocalDiff({
      mode: { kind: "workingTree" },
      cwd: repo.cwd,
    });

    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.status).toBe("renamed");
    expect(result.files[0]?.path).toBe("renamed.txt");
    expect(result.files[0]?.oldPath).toBe("a.txt");
  });

  test("falls back to master when main does not exist", async () => {
    const masterRepo = await createTestRepo();

    try {
      await masterRepo.git.checkoutLocalBranch("master");
      await masterRepo.write("a.txt", "first\n");
      await masterRepo.git.add(["."]);
      await masterRepo.git.commit("initial");
      await masterRepo.git.deleteLocalBranch("main", true);

      await masterRepo.git.checkoutLocalBranch("feature");
      await masterRepo.write("a.txt", "first\nchanged\n");

      const result = await loadLocalDiff({
        mode: { kind: "workingTree" },
        cwd: masterRepo.cwd,
      });

      expect(result.baseRef).toBe("master");
      expect(result.files).toHaveLength(1);
    } finally {
      await masterRepo.cleanup();
    }
  });

  test("honors an explicit baseRef", async () => {
    await repo.git.checkoutLocalBranch("develop");
    await repo.write("a.txt", "first\nchanged\n");

    const result = await loadLocalDiff({
      mode: { kind: "workingTree", baseRef: "main" },
      cwd: repo.cwd,
    });

    expect(result.baseRef).toBe("main");
    expect(result.files).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/diff/test/workingTree.test.ts`

Expected: FAIL — loader still throws for working-tree mode.

- [ ] **Step 3: Implement `packages/diff/src/workingTree.ts`**

```ts
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
```

- [ ] **Step 4: Wire the working-tree branch in `packages/diff/src/loader.ts`**

Replace the file contents with:

```ts
import { loadCommitRangeDiff } from "./commitRange";
import { createDefaultGateway } from "./simpleGitGateway";
import { loadStagedDiff } from "./staged";
import { loadWorkingTreeDiff } from "./workingTree";
import type { LoadLocalDiffOptions, LocalDiffResult } from "./types";

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

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test packages/diff/test/workingTree.test.ts`

Expected: 4 pass.

- [ ] **Step 6: Full check**

Run: `bun run check`

Expected: green, 119 tests total.

- [ ] **Step 7: Commit**

```bash
git add packages/diff/src/workingTree.ts packages/diff/src/loader.ts packages/diff/test/workingTree.test.ts
git commit -m "$(cat <<'EOF'
feat(diff): implement working-tree mode for tracked-file changes

loadLocalDiff({ mode: { kind: "workingTree", baseRef? } }) resolves
the base ref (default order: main, then master) and diffs the working
tree against it with rename detection. Untracked files and binary
handling land in the next task.
EOF
)"
```

---

## Task 11: TDD working-tree untracked files + binary detection

**Files:**
- Modify: `packages/diff/src/workingTree.ts`
- Modify: `packages/diff/test/workingTree.test.ts`

### Steps

- [ ] **Step 1: Write the failing tests**

Append to `packages/diff/test/workingTree.test.ts`:

```ts
describe("loadLocalDiff workingTree mode (untracked + binary)", () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepo();
    await repo.write("a.txt", "first\n");
    await repo.git.add(["."]);
    await repo.git.commit("initial");
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  test("includes untracked text files as added with synthesized patch", async () => {
    await repo.git.checkoutLocalBranch("feature");
    await repo.write("untracked.txt", "hello\nworld\n");

    const result = await loadLocalDiff({
      mode: { kind: "workingTree" },
      cwd: repo.cwd,
    });

    const untracked = result.files.find((file) => file.path === "untracked.txt");
    expect(untracked?.status).toBe("added");
    expect(untracked?.additions).toBe(2);
    expect(untracked?.deletions).toBe(0);
    expect(untracked?.patch).toContain("@@ -0,0 +1,2 @@");
    expect(untracked?.patch).toContain("+hello");
    expect(untracked?.patch).toContain("+world");
  });

  test("skips untracked binary files via null-byte heuristic", async () => {
    await repo.git.checkoutLocalBranch("feature");
    await repo.write("logo.bin", "abc\x00\x00binary-content\n");

    const result = await loadLocalDiff({
      mode: { kind: "workingTree" },
      cwd: repo.cwd,
    });

    expect(result.files.find((file) => file.path === "logo.bin")).toBeUndefined();
    expect(result.skippedBinaries).toContain("logo.bin");
  });

  test("skips tracked binary files surfaced by git numstat", async () => {
    await repo.git.checkoutLocalBranch("feature");
    await repo.write("blob.bin", "\x00binary-content\n");
    await repo.git.add(["blob.bin"]);
    await repo.git.commit("add binary");

    const result = await loadLocalDiff({
      mode: { kind: "workingTree" },
      cwd: repo.cwd,
    });

    expect(result.files.find((file) => file.path === "blob.bin")).toBeUndefined();
    expect(result.skippedBinaries).toContain("blob.bin");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/diff/test/workingTree.test.ts -t "untracked"`

Expected: FAIL — `loadWorkingTreeDiff` doesn't scan untracked files yet, so the added text file is missing and the untracked binary isn't classified.

- [ ] **Step 3: Add untracked + binary handling to `packages/diff/src/workingTree.ts`**

Replace the file contents with:

```ts
import type { ChangedFile } from "@asyncs/core";
import {
  parseNameStatus,
  parseNumstat,
  splitMultiFilePatch,
  synthesizeUntrackedPatch,
} from "./parseDiff";
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
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    value.code === "ENOENT"
  );
}
```

> `isEnoent` uses the `in` operator to narrow `value`, so `value.code` is accessible without a cast.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/diff/test/workingTree.test.ts`

Expected: 7 pass (4 from Task 10 + 3 new).

- [ ] **Step 5: Full check**

Run: `bun run check`

Expected: green, 122 tests total.

- [ ] **Step 6: Commit**

```bash
git add packages/diff/src/workingTree.ts packages/diff/test/workingTree.test.ts
git commit -m "$(cat <<'EOF'
feat(diff): handle untracked files and binaries in working-tree mode

Adds an untracked-file scan via the gateway's listUntracked + readFile.
Text files become ChangedFile entries with synthesized + patches; files
with a null byte in the first 1024 bytes go to skippedBinaries instead.
Tracked binaries already detected via numstat's "-/-" markers are
also surfaced as skipped, not crashed on.
EOF
)"
```

---

## Task 12: Loader error paths + index re-export

**Files:**
- Create: `packages/diff/test/loader.test.ts`
- Verify: `packages/diff/src/index.ts` (already re-exports loader + types from Task 2)

### Steps

- [ ] **Step 1: Write the failing tests**

Create `packages/diff/test/loader.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadLocalDiff } from "../src/loader";
import { createTestRepo, type TestRepo } from "./helpers/createTestRepo";

describe("loadLocalDiff error paths", () => {
  test("throws when cwd is not a git repository", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "asyncs-non-git-"));

    try {
      await expect(
        loadLocalDiff({ mode: { kind: "staged" }, cwd }),
      ).rejects.toThrow();
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  describe("base ref resolution", () => {
    let repo: TestRepo;

    beforeEach(async () => {
      repo = await createTestRepo();
      await repo.write("a.txt", "first\n");
      await repo.git.add(["."]);
      await repo.git.commit("initial");
    });

    afterEach(async () => {
      await repo.cleanup();
    });

    test("throws when no candidate ref resolves", async () => {
      await repo.git.raw(["branch", "-m", "main", "develop"]);

      await expect(
        loadLocalDiff({ mode: { kind: "workingTree" }, cwd: repo.cwd }),
      ).rejects.toThrow("Could not resolve base ref");
    });

    test("throws when an explicit baseRef does not resolve", async () => {
      await expect(
        loadLocalDiff(
          { mode: { kind: "workingTree", baseRef: "no-such-ref" }, cwd: repo.cwd },
        ),
      ).rejects.toThrow("no-such-ref");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun test packages/diff/test/loader.test.ts`

Expected: 3 pass. The behavior is already implemented (Tasks 8 + 10 + the gateway); this test locks the contract.

If a test fails, double-check the gateway's `resolveBaseRef` error message contains the substring "Could not resolve base ref" and includes the candidate list. The Task 7 gateway implementation already does this.

- [ ] **Step 3: Verify the public surface**

Run:

```bash
bun -e 'import("./packages/diff/src/index.ts").then((m) => console.log(Object.keys(m).sort()))'
```

Expected output includes:

```
[ "loadLocalDiff" ]
```

`LocalDiffMode`, `LoadLocalDiffOptions`, and `LocalDiffResult` are type-only exports and won't appear at runtime — that's expected.

- [ ] **Step 4: Full check**

Run: `bun run check`

Expected: green, 125 tests total (122 + 3 new error tests).

- [ ] **Step 5: Commit**

```bash
git add packages/diff/test/loader.test.ts
git commit -m "$(cat <<'EOF'
test(diff): lock loader error contracts

Three tests pin: (1) non-git cwd throws, (2) default base-ref
resolution fails with the canonical error message, (3) explicit
unresolvable baseRef surfaces the bad ref name in the error.
EOF
)"
```

---

## Done — what's left after this slice

After this plan completes, `@asyncs/diff` is a usable library, fully tested with simple-git against tmp dirs. Nothing in the running asyncs system calls it yet — that's slice 3.

The remaining slice to close the local-review loop end-to-end:

- **Slice next:** `runReviewPipeline` composition in `@asyncs/orchestration` (or a new entry point) + CLI `review --local` path that reads `ANTHROPIC_API_KEY` from env, constructs the Anthropic provider, calls `loadLocalDiff`, runs the pipeline, prints the markdown.

After that, `asyncs review --local` produces a real review against the working tree.

---

## Self-Review Notes

(Inline check after writing.)

**1. Spec coverage:**
- New `@asyncs/diff` package → Task 2 ✓
- `ChangedFile.oldPath` → Task 1 ✓
- `LocalDiffMode` / `LocalDiffResult` types → Task 2 ✓
- `loadLocalDiff` entry point → Task 2 (stub) + Tasks 8/9/10 (wired per mode) ✓
- `SimpleGitGateway` test seam → Task 7 ✓
- `parseNumstat` → Task 3 ✓
- `parseNameStatus` → Task 4 ✓
- `splitMultiFilePatch` → Task 5 ✓
- `synthesizeUntrackedPatch` → Task 6 ✓
- `loadStagedDiff` → Task 8 ✓
- `loadCommitRangeDiff` → Task 9 ✓
- `loadWorkingTreeDiff` (tracked) → Task 10 ✓
- Untracked files + binary detection in working tree → Task 11 ✓
- Rename detection → Task 10 (test) + Tasks 4, 8, 9, 10 (impl wires `oldPath`) ✓
- Error: not a git repo → Task 12 ✓
- Error: base ref resolution failure → Task 12 ✓
- `simple-git` runtime dep → Task 2 ✓
- `createTestRepo` helper (simple-git-based) → Task 7 ✓
- All test scenarios from the spec → Tasks 3-12 ✓

**2. Placeholder scan:** No `TBD`, `TODO`, "implement later", or "appropriate error handling". Every step contains the actual code or command.

**3. Type consistency:**
- `LocalDiffMode` defined in Task 2, used unchanged in Tasks 8/9/10.
- `LocalDiffResult` defined in Task 2, returned by every mode helper.
- `SimpleGitGateway` defined in Task 7, used in Tasks 8/9/10/11.
- `ChangedFile.oldPath` defined in Task 1, populated in Tasks 8/9/10.
- `NumstatRow`, `NameStatusRow` defined in Tasks 3/4, used in Tasks 8/9/10/11.
- `synthesizeUntrackedPatch` defined in Task 6, used in Task 11.
- Method names (`resolveBaseRef`, `diffNumstat`, `diffNameStatus`, `diffPatch`, `listUntracked`, `readFile`) consistent across all tasks.

**4. No new `as` casts:** Task 11's helper `isEnoent` uses the `in`-operator type guard to access `value.code` without a cast. The only `as` reference in the plan is `as const satisfies Record<...>` in Task 4, which is the project-blessed pattern for literal narrowing on a constant, not a cast on a value.
