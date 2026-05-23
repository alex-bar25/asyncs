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
