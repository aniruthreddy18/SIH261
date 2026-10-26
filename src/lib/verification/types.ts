import type { SourceType, VerificationStatus } from "@/lib/domain";

/** Details submitted for comparison with an issuing-authority source. */
export interface VerificationRequest {
  categoryCode: string;
  referenceNumber: string | null;
  submitted: {
    institutionName: string | null;
    institutionCode: string | null;
    issueDate: string | null;
    expiryDate: string | null;
    programmeName: string | null;
    approvedIntake: string | null;
  };
  /** ISO date the verification is evaluated against (for expiry at source). */
  asOf: string;
}

export interface FieldComparison {
  field: string;
  label: string;
  submitted: string | null;
  returned: string | null;
  match: boolean | null;
  note?: string;
}

export interface VerificationResponse {
  status: VerificationStatus;
  sourceTimestamp: string | null;
  returned: Record<string, string | null> | null;
  comparisons: FieldComparison[];
  limitation?: string;
  error?: string;
  responseRef?: string;
  /** Whether a retry may succeed (e.g. transient unavailability). */
  retryable: boolean;
}

/** Common interface every issuer verification source implements. */
export interface IssuerAdapter {
  readonly id: string;
  readonly name: string;
  readonly sourceType: SourceType;
  readonly description: string;
  supports(categoryCode: string): boolean;
  verify(request: VerificationRequest, signal: AbortSignal): Promise<VerificationResponse>;
}
