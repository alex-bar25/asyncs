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

      throw new Error(`Could not resolve base ref. Tried: ${candidates.join(", ")}. Pass a baseRef explicitly.`);
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
