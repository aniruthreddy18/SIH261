// Shared domain vocabulary. Mirrors the Prisma enums as plain string unions so the values
// can be used in client components without pulling the Prisma runtime into the bundle.

export const ROLES = [
  "APPLICANT",
  "SCRUTINY_OFFICER",
  "BUREAU_OFFICER",
  "COMMITTEE_MEMBER",
  "SENIOR_OFFICIAL",
  "ADMIN",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  APPLICANT: "Institution Applicant",
  SCRUTINY_OFFICER: "Regional Officer (Scrutiny & Verification)",
  BUREAU_OFFICER: "Approval Bureau Officer",
  COMMITTEE_MEMBER: "EVC / Committee Member",
  SENIOR_OFFICIAL: "Competent Authority",
  ADMIN: "System / Rules Administrator",
};

export const APPLICATION_STATUSES = [
  "DRAFT",
  "PROCESSING",
  "AUTO_PASSED",
  "AUTO_FAILED",
  "REVIEW_REQUIRED",
  "PROCESSING_FAILED",
  "RECTIFICATION_REQUIRED",
  "IN_STAGE_REVIEW",
  "READY_FOR_AUTHORIZED_REVIEW",
  "CLOSED",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  DRAFT: "Draft",
  PROCESSING: "Processing",
  AUTO_PASSED: "Automated checks passed",
  AUTO_FAILED: "Automated checks failed",
  REVIEW_REQUIRED: "Review required",
  PROCESSING_FAILED: "Processing failed",
  RECTIFICATION_REQUIRED: "Rectification required",
  IN_STAGE_REVIEW: "Under committee stage",
  READY_FOR_AUTHORIZED_REVIEW: "Ready for authorised review",
  CLOSED: "Closed",
};

export const APPLICATION_STATUS_DESCRIPTIONS: Record<ApplicationStatus, string> = {
  DRAFT: "Application created; automated validation has not been run yet.",
  PROCESSING: "Automated validation is in progress.",
  AUTO_PASSED:
    "All applicable machine-checkable rules passed. This is not an official approval.",
  AUTO_FAILED: "One or more configured machine-checkable requirements failed.",
  REVIEW_REQUIRED:
    "A human must resolve one or more items that automation cannot reliably decide.",
  PROCESSING_FAILED: "A technical failure prevented a reliable automated result.",
  RECTIFICATION_REQUIRED: "The institution has been asked to correct identified deficiencies.",
  IN_STAGE_REVIEW: "Scrutiny is complete; the application is with the Expert Visit Committee or the SAC/SHC as its pathway prescribes.",
  READY_FOR_AUTHORIZED_REVIEW:
    "Automated workflow complete; awaiting review by an authorised official.",
  CLOSED: "A recorded human review outcome has closed this application in Pravah AI.",
};

export const RULE_RESULT_STATUSES = [
  "PASS",
  "FAIL",
  "REVIEW_REQUIRED",
  "NOT_APPLICABLE",
  "PROCESSING_FAILED",
  "PENDING",
] as const;
export type RuleResultStatus = (typeof RULE_RESULT_STATUSES)[number];

export const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_RANK: Record<Severity, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

export const VERIFICATION_STATUSES = [
  "VERIFIED",
  "MISMATCH_DETECTED",
  "EXPIRED",
  "VERIFICATION_PENDING",
  "SOURCE_UNAVAILABLE",
  "MANUAL_REVIEW_REQUIRED",
  "NOT_SUPPORTED",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  VERIFIED: "Verified",
  MISMATCH_DETECTED: "Mismatch detected",
  EXPIRED: "Expired at source",
  VERIFICATION_PENDING: "Verification pending",
  SOURCE_UNAVAILABLE: "Source unavailable",
  MANUAL_REVIEW_REQUIRED: "Manual review required",
  NOT_SUPPORTED: "Not supported",
};

export type SourceType = "REAL" | "SANDBOX" | "SIMULATED" | "MANUAL";
export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  REAL: "Real source",
  SANDBOX: "Sandbox source",
  SIMULATED: "Simulated source",
  MANUAL: "Manual confirmation",
};

export const FINDING_STATUSES = [
  "OPEN",
  "INFO_REQUESTED",
  "ESCALATED",
  "RECTIFICATION_REQUESTED",
  "RESOLVED",
  "DISMISSED",
  "AUTO_CLEARED",
] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];
export const ACTIVE_FINDING_STATUSES: FindingStatus[] = [
  "OPEN",
  "INFO_REQUESTED",
  "ESCALATED",
  "RECTIFICATION_REQUESTED",
];
export const FINDING_STATUS_LABELS: Record<FindingStatus, string> = {
  OPEN: "Open",
  INFO_REQUESTED: "Information requested",
  ESCALATED: "Escalated",
  RECTIFICATION_REQUESTED: "Rectification requested",
  RESOLVED: "Resolved by reviewer",
  DISMISSED: "Dismissed by reviewer",
  AUTO_CLEARED: "Cleared by later run",
};

export type FindingSource = "RULE" | "ANOMALY" | "VERIFICATION";
/** Outcome class of a finding: a deterministic failure, a human-review item, or a technical failure. */
export type OutcomeClass = "FAIL" | "REVIEW_REQUIRED" | "PROCESSING_FAILED";

export type ProcessingStatus = "PENDING" | "PROCESSING" | "PROCESSED" | "FAILED";

export const RULE_CATEGORIES = [
  "COMPLETENESS",
  "DATE_VALIDITY",
  "CONSISTENCY",
  "DUPLICATE",
  "RECORDS",
  "POLICY",
] as const;
export type RuleCategory = (typeof RULE_CATEGORIES)[number];
export const RULE_CATEGORY_LABELS: Record<RuleCategory, string> = {
  COMPLETENESS: "Completeness",
  DATE_VALIDITY: "Date & validity",
  CONSISTENCY: "Cross-document consistency",
  DUPLICATE: "Duplicate detection",
  RECORDS: "Institutional records",
  POLICY: "Configurable policy",
};

/** Mandatory disclaimer shown on every report and decision surface. */
export const DECISION_SUPPORT_DISCLAIMER =
  "Pravah AI is a decision-support prototype. Its outputs are not an official AICTE approval, not a definitive finding of fraud, and not a substitute for inspection or statutory scrutiny. Final regulatory decisions remain with competent authorities.";
