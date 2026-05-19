import type { ReviewFinding } from "@asyncs/core";
import { CONFIDENCE_RANKS, SEVERITY_RANKS } from "./constants";
import type { ConsensusInput, ConsensusReport } from "./types";

export function createConsensusReport(input: ConsensusInput): ConsensusReport {
  const dedupedFindings = dedupeFindings(input.findings);
  const filteredFindings = filterNoisyFindings(dedupedFindings);

  return {
    findings: sortFindingsByRisk(filteredFindings),
    duplicateCount: input.findings.length - dedupedFindings.length,
    suppressedCount: dedupedFindings.length - filteredFindings.length,
  };
}

export function dedupeFindings(findings: readonly ReviewFinding[]): ReviewFinding[] {
  const findingsByKey = new Map<string, ReviewFinding>();

  for (const finding of findings) {
    const key = createFindingKey(finding);
    const existingFinding = findingsByKey.get(key);

    if (existingFinding === undefined || compareFindingsByRisk(finding, existingFinding) < 0) {
      findingsByKey.set(key, finding);
    }
  }

  return [...findingsByKey.values()];
}

export function filterNoisyFindings(findings: readonly ReviewFinding[]): ReviewFinding[] {
  return findings.filter((finding) => !(finding.severity === "low" && finding.confidence === "low"));
}

export function sortFindingsByRisk(findings: readonly ReviewFinding[]): ReviewFinding[] {
  return [...findings].sort(compareFindingsByRisk);
}

function compareFindingsByRisk(left: ReviewFinding, right: ReviewFinding): number {
  const severityDifference = SEVERITY_RANKS[right.severity] - SEVERITY_RANKS[left.severity];

  if (severityDifference !== 0) {
    return severityDifference;
  }

  return CONFIDENCE_RANKS[right.confidence] - CONFIDENCE_RANKS[left.confidence];
}

function createFindingKey(finding: ReviewFinding): string {
  return [finding.file ?? "", finding.line ?? "", normalize(finding.title)].join(":");
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
