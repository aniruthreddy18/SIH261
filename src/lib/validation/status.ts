import type { ApplicationStatus, OutcomeClass, RuleResultStatus } from "@/lib/domain";

export interface RunSummary {
  total: number;
  pass: number;
  fail: number;
  review: number;
  notApplicable: number;
  processingFailed: number;
  pending: number;
}

export function summarize(statuses: RuleResultStatus[]): RunSummary {
  const s: RunSummary = { total: statuses.length, pass: 0, fail: 0, review: 0, notApplicable: 0, processingFailed: 0, pending: 0 };
  for (const st of statuses) {
    if (st === "PASS") s.pass++;
    else if (st === "FAIL") s.fail++;
    else if (st === "REVIEW_REQUIRED") s.review++;
    else if (st === "NOT_APPLICABLE") s.notApplicable++;
    else if (st === "PROCESSING_FAILED") s.processingFailed++;
    else s.pending++;
  }
  return s;
}

/**
 * Outcome of a validation run from the machine's perspective only. A technical failure takes
 * precedence because it means the remaining results are not reliable.
 */
export function machineOutcome(statuses: RuleResultStatus[], anomalyCount = 0): ApplicationStatus {
  if (statuses.some((s) => s === "PROCESSING_FAILED")) return "PROCESSING_FAILED";
  if (statuses.some((s) => s === "FAIL")) return "AUTO_FAILED";
  if (statuses.some((s) => s === "REVIEW_REQUIRED" || s === "PENDING") || anomalyCount > 0) return "REVIEW_REQUIRED";
  return "AUTO_PASSED";
}

/**
 * Application status after automated results are reconciled with human review.
 * Open findings drive the status; exceptions already resolved by a reviewer no longer block,
 * but an application whose machine outcome was not a clean pass is never reported as AUTO_PASSED.
 */
export function deriveApplicationStatus(openFindings: { outcomeClass: OutcomeClass | string }[], lastMachineOutcome: ApplicationStatus | null): ApplicationStatus {
  if (openFindings.some((f) => f.outcomeClass === "PROCESSING_FAILED")) return "PROCESSING_FAILED";
  if (openFindings.some((f) => f.outcomeClass === "FAIL")) return "AUTO_FAILED";
  if (openFindings.length > 0) return "REVIEW_REQUIRED";
  return lastMachineOutcome === "AUTO_PASSED" ? "AUTO_PASSED" : "REVIEW_REQUIRED";
}

export function outcomeClassFor(status: RuleResultStatus): OutcomeClass | null {
  if (status === "FAIL") return "FAIL";
  if (status === "REVIEW_REQUIRED" || status === "PENDING") return "REVIEW_REQUIRED";
  if (status === "PROCESSING_FAILED") return "PROCESSING_FAILED";
  return null;
}
