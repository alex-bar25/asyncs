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
      await expect(loadLocalDiff({ mode: { kind: "staged" }, cwd })).rejects.toThrow();
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

      await expect(loadLocalDiff({ mode: { kind: "workingTree" }, cwd: repo.cwd })).rejects.toThrow(
        "Could not resolve base ref",
      );
    });

    test("throws when an explicit baseRef does not resolve", async () => {
      await expect(
        loadLocalDiff({ mode: { kind: "workingTree", baseRef: "no-such-ref" }, cwd: repo.cwd }),
      ).rejects.toThrow("no-such-ref");
    });
  });
});
