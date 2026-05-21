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
