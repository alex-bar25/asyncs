import type { ChangedFileStatus } from "@asyncs/core";

export type NumstatRow = {
  path: string;
  additions: number | "binary";
  deletions: number | "binary";
};

export function parseNumstat(output: string): NumstatRow[] {
  const rows: NumstatRow[] = [];

  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();

    if (line.length === 0) {
      continue;
    }

    const [addedField, deletedField, ...rest] = line.split("\t");
    const path = rest.join("\t");

    if (addedField === undefined || deletedField === undefined || path.length === 0) {
      throw new Error(`parseNumstat: malformed numstat line: ${rawLine}`);
    }

    if (addedField === "-" && deletedField === "-") {
      rows.push({ path, additions: "binary", deletions: "binary" });
      continue;
    }

    const additions = Number.parseInt(addedField, 10);
    const deletions = Number.parseInt(deletedField, 10);

    if (Number.isNaN(additions) || Number.isNaN(deletions)) {
      throw new Error(`parseNumstat: non-numeric counts in line: ${rawLine}`);
    }

    rows.push({ path, additions, deletions });
  }

  return rows;
}

export type NameStatusRow = {
  status: ChangedFileStatus;
  path: string;
  oldPath?: string;
};

const STATUS_FROM_CODE = {
  A: "added",
  M: "modified",
  D: "deleted",
} as const satisfies Record<"A" | "M" | "D", ChangedFileStatus>;

export function parseNameStatus(output: string): NameStatusRow[] {
  const rows: NameStatusRow[] = [];

  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();

    if (line.length === 0) {
      continue;
    }

    const parts = line.split("\t");
    const code = parts[0];

    if (code === undefined) {
      throw new Error(`parseNameStatus: empty status code in line: ${rawLine}`);
    }

    if (code === "A" || code === "M" || code === "D") {
      const path = parts[1];

      if (path === undefined || path.length === 0) {
        throw new Error(`parseNameStatus: missing path in line: ${rawLine}`);
      }

      rows.push({ status: STATUS_FROM_CODE[code], path });
      continue;
    }

    if (code.startsWith("R")) {
      const oldPath = parts[1];
      const newPath = parts[2];

      if (oldPath === undefined || newPath === undefined) {
        throw new Error(`parseNameStatus: missing rename paths in line: ${rawLine}`);
      }

      rows.push({ status: "renamed", path: newPath, oldPath });
      continue;
    }

    throw new Error(`parseNameStatus: unknown status code "${code}" in line: ${rawLine}`);
  }

  return rows;
}

const FILE_HEADER_REGEX = /^diff --git a\/(.+?) b\/(.+)$/;

export function splitMultiFilePatch(output: string): Map<string, string> {
  const files = new Map<string, string>();

  if (output.length === 0) {
    return files;
  }

  const lines = output.split("\n");
  let currentPath: string | undefined = undefined;
  let currentLines: string[] = [];

  for (const line of lines) {
    const header = FILE_HEADER_REGEX.exec(line);

    if (header !== null) {
      if (currentPath !== undefined) {
        files.set(currentPath, currentLines.join("\n"));
      }

      const newPath = header[2];

      if (newPath === undefined) {
        throw new Error(`splitMultiFilePatch: malformed file header: ${line}`);
      }

      currentPath = newPath;
      currentLines = [line];
      continue;
    }

    if (currentPath !== undefined) {
      currentLines.push(line);
    }
  }

  if (currentPath !== undefined) {
    files.set(currentPath, currentLines.join("\n"));
  }

  return files;
}
