import { describe, expect, test } from "bun:test";
import { parseNameStatus, parseNumstat } from "../src/parseDiff";

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
