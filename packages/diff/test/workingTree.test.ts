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
      // main may not exist as a real ref if no commit was made on it
      try {
        await masterRepo.git.deleteLocalBranch("main", true);
      } catch {
        // branch did not exist — that is the desired state
      }

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
