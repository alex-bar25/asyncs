import type { ChangedFile } from "@asyncs/core";
import {
  BACKEND_PATH_PATTERN,
  CI_FILE_NAMES,
  CI_PATH_PREFIXES,
  CONFIG_FILE_NAMES,
  DATABASE_FILE_SUFFIXES,
  DATABASE_PATH_PREFIXES,
  DATABASE_PATH_SEGMENTS,
  DOCS_FILE_SUFFIXES,
  DOCS_PATH_PREFIXES,
  FILE_CLASSIFICATION_KINDS,
  FRONTEND_FILE_SUFFIXES,
  FRONTEND_PATH_PATTERN,
  INFRA_FILE_NAMES,
  INFRA_FILE_SUFFIXES,
  INFRA_PATH_PREFIXES,
  SECURITY_PATH_PATTERN,
  TEST_FILE_SUFFIXES,
  TEST_PATH_SEGMENTS,
} from "./constants";
import type { ClassificationResult, ClassificationSummary, FileClassification, FileClassificationKind } from "./types";

export function classifyChangedFile(file: ChangedFile): FileClassification {
  const normalizedPath = file.path.toLowerCase();
  const kinds: FileClassificationKind[] = [];

  addIfMatch(kinds, "backend", isBackendPath(normalizedPath));
  addIfMatch(kinds, "frontend", isFrontendPath(normalizedPath));
  addIfMatch(kinds, "security", isSecurityPath(normalizedPath));
  addIfMatch(kinds, "database", isDatabasePath(normalizedPath));
  addIfMatch(kinds, "tests", isTestPath(normalizedPath));
  addIfMatch(kinds, "docs", isDocsPath(normalizedPath));
  addIfMatch(kinds, "config", isConfigPath(normalizedPath));
  addIfMatch(kinds, "ci", isCiPath(normalizedPath));
  addIfMatch(kinds, "infra", isInfraPath(normalizedPath));

  return {
    file,
    kinds: kinds.length > 0 ? kinds : ["unknown"],
  };
}

export function classifyChangedFiles(files: readonly ChangedFile[]): ClassificationResult {
  const classifications = files.map(classifyChangedFile);
  const summary = createEmptySummary();

  for (const classification of classifications) {
    for (const kind of classification.kinds) {
      summary[kind] += 1;
    }
  }

  return {
    files: classifications,
    summary,
  };
}

function createEmptySummary(): ClassificationSummary {
  return Object.fromEntries(FILE_CLASSIFICATION_KINDS.map((kind) => [kind, 0])) as ClassificationSummary;
}

function addIfMatch(kinds: FileClassificationKind[], kind: FileClassificationKind, matches: boolean): void {
  if (matches) {
    kinds.push(kind);
  }
}

function isBackendPath(path: string): boolean {
  return BACKEND_PATH_PATTERN.test(path);
}

function isFrontendPath(path: string): boolean {
  return endsWithAny(path, FRONTEND_FILE_SUFFIXES) || FRONTEND_PATH_PATTERN.test(path);
}

function isSecurityPath(path: string): boolean {
  return SECURITY_PATH_PATTERN.test(path);
}

function isDatabasePath(path: string): boolean {
  return (
    startsWithAny(path, DATABASE_PATH_PREFIXES) ||
    includesAny(path, DATABASE_PATH_SEGMENTS) ||
    endsWithAny(path, DATABASE_FILE_SUFFIXES)
  );
}

function isTestPath(path: string): boolean {
  return includesAny(path, TEST_PATH_SEGMENTS) || endsWithAny(path, TEST_FILE_SUFFIXES);
}

function isDocsPath(path: string): boolean {
  return startsWithAny(path, DOCS_PATH_PREFIXES) || endsWithAny(path, DOCS_FILE_SUFFIXES);
}

function isConfigPath(path: string): boolean {
  const fileName = path.split("/").at(-1) ?? path;

  return CONFIG_FILE_NAMES.includes(fileName as (typeof CONFIG_FILE_NAMES)[number]);
}

function isCiPath(path: string): boolean {
  return startsWithAny(path, CI_PATH_PREFIXES) || includesExact(CI_FILE_NAMES, path);
}

function isInfraPath(path: string): boolean {
  return (
    includesExact(INFRA_FILE_NAMES, path) ||
    INFRA_FILE_NAMES.some((fileName) => path.endsWith(`/${fileName}`)) ||
    endsWithAny(path, INFRA_FILE_SUFFIXES) ||
    startsWithAny(path, INFRA_PATH_PREFIXES)
  );
}

function startsWithAny(value: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

function endsWithAny(value: string, suffixes: readonly string[]): boolean {
  return suffixes.some((suffix) => value.endsWith(suffix));
}

function includesAny(value: string, segments: readonly string[]): boolean {
  return segments.some((segment) => value.includes(segment));
}

function includesExact(values: readonly string[], value: string): boolean {
  return values.includes(value);
}
