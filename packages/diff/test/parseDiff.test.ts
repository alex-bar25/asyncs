import { describe, expect, test } from "bun:test";
import { parseNameStatus, parseNumstat, splitMultiFilePatch } from "../src/parseDiff";

describe("parseNumstat", () => {
  test("parses a single row with additions and deletions", () => {
    expect(parseNumstat("12\t3\tsrc/a.ts\n")).toEqual([{ path: "src/a.ts", additions: 12, deletions: 3 }]);
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
    expect(parseNumstat("12\t3\tsrc/a.ts")).toEqual([{ path: "src/a.ts", additions: 12, deletions: 3 }]);
  });

  test("ignores blank lines", () => {
    expect(parseNumstat("\n12\t3\tsrc/a.ts\n\n")).toEqual([{ path: "src/a.ts", additions: 12, deletions: 3 }]);
  });

  test("returns empty array on empty input", () => {
    expect(parseNumstat("")).toEqual([]);
  });
});

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
    expect(parseNameStatus("A\tsrc/new.ts")).toEqual([{ status: "added", path: "src/new.ts" }]);
  });

  test("ignores blank lines", () => {
    expect(parseNameStatus("\nA\tsrc/new.ts\n\n")).toEqual([{ status: "added", path: "src/new.ts" }]);
  });

  test("returns empty array on empty input", () => {
    expect(parseNameStatus("")).toEqual([]);
  });

  test("throws on unknown status code", () => {
    expect(() => parseNameStatus("X\tsrc/weird.ts\n")).toThrow("unknown status");
  });
});

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
