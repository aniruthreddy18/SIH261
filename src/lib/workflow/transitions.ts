import type { ApplicationStatus } from "@/lib/domain";

/**
 * Explicit application state machine. Any transition not listed here is rejected by the
 * server (src/server/applications.ts → transitionStatus).
 */
export const TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  DRAFT: ["PROCESSING"],
  PROCESSING: ["AUTO_PASSED", "AUTO_FAILED", "REVIEW_REQUIRED", "PROCESSING_FAILED"],
  AUTO_PASSED: ["PROCESSING", "REVIEW_REQUIRED", "RECTIFICATION_REQUIRED", "READY_FOR_AUTHORIZED_REVIEW"],
  AUTO_FAILED: ["PROCESSING", "REVIEW_REQUIRED", "RECTIFICATION_REQUIRED"],
  REVIEW_REQUIRED: ["PROCESSING", "AUTO_PASSED", "AUTO_FAILED", "RECTIFICATION_REQUIRED", "READY_FOR_AUTHORIZED_REVIEW"],
  PROCESSING_FAILED: ["PROCESSING", "RECTIFICATION_REQUIRED"],
  RECTIFICATION_REQUIRED: ["PROCESSING"],
  READY_FOR_AUTHORIZED_REVIEW: ["CLOSED", "RECTIFICATION_REQUIRED", "REVIEW_REQUIRED"],
  CLOSED: [],
};

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Statuses whose value is derived from automated results and may be recomputed. */
export const MACHINE_STATUSES: ApplicationStatus[] = [
  "AUTO_PASSED",
  "AUTO_FAILED",
  "REVIEW_REQUIRED",
  "PROCESSING_FAILED",
];

export function isMachineStatus(s: ApplicationStatus): boolean {
  return MACHINE_STATUSES.includes(s);
}
