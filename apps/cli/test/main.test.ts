import { describe, expect, test } from "bun:test";
import { runCli } from "../src/main";

describe("runCli", () => {
  test("prints help when no arguments are provided", () => {
    const result = runCli([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("asyncs");
    expect(result.stdout).toContain("sub-agent driven AI PR review harness");
  });

  test("prints help for --help", () => {
    const result = runCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("asyncs pr review 3213");
  });

  test("prints version for --version", () => {
    const result = runCli(["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("0.1.0");
  });

  test("rejects unknown arguments", () => {
    const result = runCli(["--wat"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown argument: --wat");
    expect(result.stdout).toContain("Usage:");
  });

  test("previews a PR review request with default options", () => {
    const result = runCli(["pr", "review", "3213"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Review request");
    expect(result.stdout).toContain("PR: 3213");
    expect(result.stdout).toContain("Mode: low-noise");
    expect(result.stdout).toContain("Agents: auto");
    expect(result.stdout).toContain("Route source: auto");
    expect(result.stdout).toContain("Resolved agents: backend,security,architecture,testing");
    expect(result.stdout).toContain("Post comments: false");
    expect(result.stdout).toContain("Dry run: false");
  });

  test("previews a PR review request with explicit options", () => {
    const result = runCli([
      "pr",
      "review",
      "3213",
      "--mode",
      "security",
      "--agents",
      "backend,security",
      "--post-comments",
      "--dry-run",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Mode: security");
    expect(result.stdout).toContain("Agents: backend,security");
    expect(result.stdout).toContain("Route source: explicit");
    expect(result.stdout).toContain("Resolved agents: backend,security");
    expect(result.stdout).toContain("Post comments: true");
    expect(result.stdout).toContain("Dry run: true");
  });

  test("rejects invalid PR review options", () => {
    const result = runCli(["pr", "review", "0", "--mode", "noisy"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("PR number must be a positive integer.");
  });
});
