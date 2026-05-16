import { describe, expect, test } from "bun:test";
import type { ChangedFile } from "@asyncs/core";
import { FILE_CLASSIFICATION_KINDS, classifyChangedFile, classifyChangedFiles } from "../src/index";

function changedFile(path: string): ChangedFile {
  return {
    path,
    status: "modified",
    additions: 12,
    deletions: 3,
  };
}

describe("changed file classifier", () => {
  test("exports file classification kinds in a stable order", () => {
    expect(FILE_CLASSIFICATION_KINDS).toEqual([
      "backend",
      "frontend",
      "security",
      "database",
      "tests",
      "docs",
      "config",
      "ci",
      "infra",
      "unknown",
    ]);
  });

  test("classifies a single changed file using path rules", () => {
    const classification = classifyChangedFile(changedFile("src/api/payments/retry.ts"));

    expect(classification.file.path).toBe("src/api/payments/retry.ts");
    expect(classification.kinds).toEqual(["backend"]);
  });

  test("allows multiple labels for one file", () => {
    const classification = classifyChangedFile(changedFile("src/auth/session.test.ts"));

    expect(classification.kinds).toEqual(["backend", "security", "tests"]);
  });

  test("classifies common project files", () => {
    expect(classifyChangedFile(changedFile("apps/web/src/App.tsx")).kinds).toContain("frontend");
    expect(classifyChangedFile(changedFile("prisma/schema.prisma")).kinds).toContain("database");
    expect(classifyChangedFile(changedFile(".github/workflows/review.yml")).kinds).toContain("ci");
    expect(classifyChangedFile(changedFile("Dockerfile")).kinds).toContain("infra");
    expect(classifyChangedFile(changedFile("README.md")).kinds).toContain("docs");
    expect(classifyChangedFile(changedFile("package.json")).kinds).toContain("config");
  });

  test("uses unknown when no rule matches", () => {
    expect(classifyChangedFile(changedFile("misc/notes.todo")).kinds).toEqual(["unknown"]);
  });

  test("summarizes classifications across changed files", () => {
    const result = classifyChangedFiles([
      changedFile("src/api/payments/retry.ts"),
      changedFile("src/auth/session.test.ts"),
      changedFile("README.md"),
    ]);

    expect(result.files).toHaveLength(3);
    expect(result.summary).toEqual({
      backend: 2,
      frontend: 0,
      security: 1,
      database: 0,
      tests: 1,
      docs: 1,
      config: 0,
      ci: 0,
      infra: 0,
      unknown: 0,
    });
  });
});
