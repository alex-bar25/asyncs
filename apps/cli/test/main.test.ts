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
});
