import type { ProcessingStatus, RuleCategory, RuleResultStatus, Severity } from "@/lib/domain";

export interface FieldValue {
  key: string;
  value: string | null;
  normalized: string | null;
  confidence: number;
  page: number | null;
  excerpt: string | null;
  method: string;
  corrected: boolean;
}

export interface DocumentContext {
  documentId: string;
  versionId: string;
  versionNo: number;
  categoryCode: string;
  categoryName: string;
  fileName: string;
  sha256: string;
  processingStatus: ProcessingStatus;
  processingError?: string | null;
  fields: Record<string, FieldValue>;
  textContent?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ChecklistItem {
  categoryCode: string;
  label: string;
  mandatory: boolean;
}

export interface InstitutionRecord {
  code: string;
  name: string;
  programmes: { name: string; level: string; approvedIntake: number; lastApprovedYear: string }[];
}

export interface ApplicationContext {
  applicationId: string;
  reference: string;
  templateCode: string;
  institutionName: string;
  institutionCode: string | null;
  academicYear: string;
  programmes: { name: string; level: string; intake: number }[];
  checklist: ChecklistItem[];
  documents: DocumentContext[];
  institutionRecord: InstitutionRecord | null;
  /** ISO date (yyyy-mm-dd) the run is evaluated against. */
  runDate: string;
  settings: ValidationSettings;
}

export interface ValidationSettings {
  lowConfidenceThreshold: number;
  academicYearStartMonth: number;
  academicYearStartDay: number;
}

export type EvidenceKind = "FIELD" | "DOCUMENT" | "APPLICATION" | "RECORD" | "CHECKLIST" | "OTHER_APPLICATION" | "METADATA" | "SOURCE";

export interface Evidence {
  kind: EvidenceKind;
  label: string;
  value?: string | null;
  documentId?: string;
  versionId?: string;
  categoryCode?: string;
  fileName?: string;
  page?: number | null;
  excerpt?: string | null;
  confidence?: number;
  method?: string;
  applicationId?: string;
  applicationReference?: string;
}

export interface RuleSpec {
  ruleVersionId: string;
  code: string;
  name: string;
  version: number;
  category: RuleCategory;
  checkType: string;
  definition: unknown;
  severity: Severity;
  remediation: string;
  appliesTo: string[];
}

export interface RuleOutcome {
  ruleVersionId: string;
  ruleCode: string;
  ruleVersionNo: number;
  ruleName: string;
  status: RuleResultStatus;
  severity: Severity;
  subjectKey: string;
  subjectLabel: string;
  documentId?: string;
  documentVersionId?: string;
  categoryCode?: string;
  explanation: string;
  expected: string | null;
  observed: string | null;
  evidence: Evidence[];
  nextAction: string | null;
}
