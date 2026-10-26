import type { RuleResultStatus } from "@/lib/domain";

export const FINDING_TYPE_LABELS: Record<string, string> = {
  MISSING_DOCUMENT: "Missing mandatory document",
  MISSING_FIELD: "Mandatory field not located",
  EXPIRED_DOCUMENT: "Expired / insufficient validity",
  DATE_UNCERTAIN: "Date could not be reliably read",
  DATE_INCONSISTENCY: "Date inconsistency",
  CROSS_DOCUMENT_MISMATCH: "Cross-document mismatch",
  RECORD_MISMATCH: "Mismatch with institutional records",
  DUPLICATE_EVIDENCE: "Duplicate evidence",
  POLICY_DEVIATION: "Policy condition not met",
  PROCESSING_FAILURE: "Processing failure",
  LOW_CONFIDENCE: "Low-confidence extraction",
  CROSS_APPLICATION_DUPLICATE_FILE: "File reused across applications",
  CROSS_APPLICATION_REPEATED_REFERENCE: "Repeated reference number",
  METADATA_MODIFIED_AFTER_CREATION: "Metadata inconsistency",
  METADATA_CREATED_BEFORE_ISSUE: "Metadata inconsistency",
  METADATA_EDITING_SOFTWARE: "Potential alteration indicator",
  NEAR_DUPLICATE_DIFFERENT_IDENTIFIERS: "Similar documents, different details",
  VERIFICATION_MISMATCH_DETECTED: "Issuer verification mismatch",
  VERIFICATION_EXPIRED: "Expired at issuing source",
  VERIFICATION_VERIFICATION_PENDING: "Issuer verification pending",
  VERIFICATION_SOURCE_UNAVAILABLE: "Issuer source unavailable",
  VERIFICATION_MANUAL_REVIEW_REQUIRED: "Manual verification required",
  VERIFICATION_NOT_SUPPORTED: "Unsupported issuer — manual confirmation",
};

export function findingTypeLabel(t: string) {
  return FINDING_TYPE_LABELS[t] ?? t.replace(/_/g, " ").toLowerCase();
}

export function findingTypeForRule(checkType: string, status: RuleResultStatus): string {
  if (status === "PROCESSING_FAILED") return "PROCESSING_FAILURE";
  switch (checkType) {
    case "REQUIRED_DOCUMENTS": return "MISSING_DOCUMENT";
    case "REQUIRED_FIELDS": return status === "REVIEW_REQUIRED" ? "MISSING_FIELD" : "MISSING_FIELD";
    case "DATE_VALID_ON": return status === "FAIL" ? "EXPIRED_DOCUMENT" : "DATE_UNCERTAIN";
    case "DATE_ORDER":
    case "DATE_NOT_FUTURE": return "DATE_INCONSISTENCY";
    case "CROSS_DOCUMENT_MATCH": return "CROSS_DOCUMENT_MISMATCH";
    case "RECORD_MATCH": return "RECORD_MISMATCH";
    case "DUPLICATE_FILE":
    case "DUPLICATE_REFERENCE": return "DUPLICATE_EVIDENCE";
    case "FIELD_CONDITION": return "POLICY_DEVIATION";
    default: return "POLICY_DEVIATION";
  }
}

export const REVIEW_ACTION_LABELS: Record<string, string> = {
  NOTE: "Internal note",
  REQUEST_INFO: "Requested information",
  ESCALATE: "Escalated",
  RESOLVE: "Resolved",
  DISMISS: "Dismissed",
  MANUAL_VERIFICATION: "Manual verification recorded",
  REQUEST_RECTIFICATION: "Returned for rectification",
  SUBMIT_RECTIFICATION: "Rectification submitted",
  FORWARD: "Forwarded for authorised review",
  DECISION: "Recorded review outcome",
};

export const DECISION_OUTCOMES = {
  SATISFACTORY_FOR_FURTHER_PROCESSING: "Scrutiny satisfactory — forward for further statutory processing",
  DEFICIENCIES_NOTED: "Deficiencies noted — not recommended in current form",
  REFER_FOR_INSPECTION: "Refer for physical inspection / expert committee",
} as const;
export type DecisionOutcome = keyof typeof DECISION_OUTCOMES;
