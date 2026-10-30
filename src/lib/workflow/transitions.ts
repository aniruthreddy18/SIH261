import type { ApplicationStatus } from "@/lib/domain";

/**
 * Explicit application state machine. Any transition not listed here is rejected by the
 * server (src/server/applications.ts → transitionStatus).
 */
export const TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  DRAFT: ["PROCESSING"],
  PROCESSING: ["AUTO_PASSED", "AUTO_FAILED", "REVIEW_REQUIRED", "PROCESSING_FAILED"],
  AUTO_PASSED: ["PROCESSING", "REVIEW_REQUIRED", "RECTIFICATION_REQUIRED", "IN_STAGE_REVIEW", "READY_FOR_AUTHORIZED_REVIEW"],
  AUTO_FAILED: ["PROCESSING", "REVIEW_REQUIRED", "RECTIFICATION_REQUIRED"],
  REVIEW_REQUIRED: ["PROCESSING", "AUTO_PASSED", "AUTO_FAILED", "RECTIFICATION_REQUIRED", "IN_STAGE_REVIEW", "READY_FOR_AUTHORIZED_REVIEW"],
  PROCESSING_FAILED: ["PROCESSING", "RECTIFICATION_REQUIRED"],
  RECTIFICATION_REQUIRED: ["PROCESSING"],
  // With the EVC or SAC/SHC: moves on to the next committee stage (same status), to the
  // competent authority, back to the institution for deficiencies, or is reverted to scrutiny.
  IN_STAGE_REVIEW: ["READY_FOR_AUTHORIZED_REVIEW", "RECTIFICATION_REQUIRED", "REVIEW_REQUIRED"],
  READY_FOR_AUTHORIZED_REVIEW: ["CLOSED", "RECTIFICATION_REQUIRED", "REVIEW_REQUIRED", "IN_STAGE_REVIEW"],
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
