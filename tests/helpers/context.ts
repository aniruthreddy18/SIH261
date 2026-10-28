import type { ApplicationContext, DocumentContext, FieldValue, RuleSpec } from "@/lib/validation/types";

export function field(key: string, value: string | null, normalized: string | null = value, confidence = 0.95, page = 1): FieldValue {
  return { key, value, normalized, confidence, page, excerpt: value ? `${key}: ${value}` : null, method: "PDF_TEXT_LABEL", corrected: false };
}

let n = 0;
export function doc(categoryCode: string, fields: FieldValue[], over: Partial<DocumentContext> = {}): DocumentContext {
  n++;
  return {
    documentId: `doc-${n}`,
    versionId: `ver-${n}`,
    versionNo: 1,
    categoryCode,
    categoryName: categoryCode,
    fileName: `${categoryCode.toLowerCase()}-${n}.pdf`,
    sha256: `sha-${n}`,
    processingStatus: "PROCESSED",
    fields: Object.fromEntries(fields.map((f) => [f.key, f])),
    ...over,
  };
}

export function context(over: Partial<ApplicationContext> = {}): ApplicationContext {
  return {
    applicationId: "app-1",
    reference: "PRV-2027-000001",
    templateCode: "EOA",
    institutionName: "Sunrise Institute of Technology",
    institutionCode: "PRV-INST-1001",
    academicYear: "2027-28",
    programmes: [{ name: "B.Tech Computer Science and Engineering", level: "UG", intake: 120 }],
    checklist: [
      { categoryCode: "AFFIDAVIT", label: "Affidavit", mandatory: true },
      { categoryCode: "NOC_PERMISSION", label: "NOC", mandatory: true },
      { categoryCode: "ACCREDITATION", label: "Accreditation", mandatory: false },
    ],
    documents: [],
    institutionRecord: {
      code: "PRV-INST-1001",
      name: "Sunrise Institute of Technology",
      programmes: [{ name: "B.Tech Computer Science and Engineering", level: "UG", approvedIntake: 120, lastApprovedYear: "2026-27" }],
    },
    runDate: "2026-10-26",
    settings: { lowConfidenceThreshold: 0.6, academicYearStartMonth: 7, academicYearStartDay: 1 },
    ...over,
  };
}

export function rule(code: string, checkType: string, definition: unknown, over: Partial<RuleSpec> = {}): RuleSpec {
  return {
    ruleVersionId: `rv-${code}`,
    code,
    name: code,
    version: 1,
    category: "COMPLETENESS",
    checkType,
    definition,
    severity: "HIGH",
    remediation: "Fix it.",
    appliesTo: [],
    ...over,
  };
}
