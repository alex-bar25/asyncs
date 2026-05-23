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
