import { describe, expect, test } from "bun:test";
import { parseNumstat } from "../src/parseDiff";

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
