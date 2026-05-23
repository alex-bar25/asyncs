import { describe, expect, test } from "bun:test";
import { partitionFiles } from "../src/partition";

describe("partitionFiles", () => {
  test("joins numstat + name-status into a ChangedFile and attaches patches", () => {
    const result = partitionFiles(
      [{ path: "src/a.ts", additions: 3, deletions: 1 }],
      [{ status: "modified", path: "src/a.ts" }],
      new Map([["src/a.ts", "patch text"]]),
    );

    expect(result.files).toEqual([
      {
        path: "src/a.ts",
        status: "modified",
        additions: 3,
        deletions: 1,
        patch: "patch text",
      },
    ]);
    expect(result.skippedBinaries).toEqual([]);
  });

  test("skips binary numstat rows into skippedBinaries", () => {
    const result = partitionFiles(
      [{ path: "logo.png", additions: "binary", deletions: "binary" }],
      [{ status: "added", path: "logo.png" }],
      new Map(),
    );

    expect(result.files).toEqual([]);
    expect(result.skippedBinaries).toEqual(["logo.png"]);
  });

  test("preserves oldPath on renamed entries", () => {
    const result = partitionFiles(
      [{ path: "src/new.ts", additions: 0, deletions: 0 }],
      [{ status: "renamed", path: "src/new.ts", oldPath: "src/old.ts" }],
      new Map(),
    );

    expect(result.files[0]?.oldPath).toBe("src/old.ts");
  });

  test("drops name-status rows that have no matching numstat row", () => {
    const result = partitionFiles([], [{ status: "modified", path: "src/orphan.ts" }], new Map());

    expect(result.files).toEqual([]);
    expect(result.skippedBinaries).toEqual([]);
  });

  test("omits patch when no entry exists in the patches map", () => {
    const result = partitionFiles(
      [{ path: "src/a.ts", additions: 1, deletions: 0 }],
      [{ status: "added", path: "src/a.ts" }],
      new Map(),
    );

    expect(result.files[0]?.patch).toBeUndefined();
  });
});
