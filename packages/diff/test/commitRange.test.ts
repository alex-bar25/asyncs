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
