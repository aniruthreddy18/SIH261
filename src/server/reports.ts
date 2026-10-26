import type { Actor } from "@/lib/auth/permissions";
import { APPLICATION_STATUS_LABELS, DECISION_SUPPORT_DISCLAIMER, type ApplicationStatus } from "@/lib/domain";
import { fieldLabel } from "@/lib/extraction/fields";
import { REVIEW_ACTION_LABELS } from "@/lib/findings";
import type { Evidence } from "@/lib/validation/types";
import { prisma, json } from "./db";
import { recordAudit } from "./audit";
import { getAccessibleApplication } from "./applications";

export interface ReportData {
  generatedAt: string;
  generatedBy: string;
  disclaimer: string;
  app: { reference: string; institutionName: string; institutionCode: string | null; category: string; template: string; academicYear: string; status: string; statusLabel: string; contact: string; submittedAt: string; programmes: { name: string; level: string; intake: number }[] };
  institutionRecord: { code: string; name: string; state: string; city: string };
  checklist: { label: string; mandatory: boolean; documents: string[] }[];
  documents: { category: string; file: string; version: number; sha256: string; method: string | null; pages: number | null; ocrConfidence: number | null; status: string; fields: { label: string; value: string | null; confidence: number; page: number | null; corrected: boolean }[] }[];
  lastRun: { runNumber: number; completedAt: string | null; machineOutcome: string | null; summary: Record<string, number>; ruleVersions: { code: string; version: number }[] } | null;
  results: { ruleCode: string; version: number; status: string; subject: string; explanation: string; expected: string | null; observed: string | null; evidence: string[] }[];
  findings: { title: string; type: string; source: string; severity: string; status: string; outcomeClass: string; deterministic: boolean; recommendedAction: string; resolution: string | null }[];
  verifications: { category: string; source: string; sourceType: string; status: string; at: string; reference: string | null; comparisons: { label: string; submitted: string | null; returned: string | null; match: boolean | null }[]; limitation: string | null }[];
  reviewActions: { at: string; actor: string; role: string; action: string; outcome: string | null; reason: string; reference: string | null }[];
  limitations: string[];
}

function evidenceText(e: Evidence, redactOther: boolean): string {
  if (e.kind === "OTHER_APPLICATION") return redactOther ? `${e.label}: another application (reference withheld)` : `${e.label}: ${e.applicationReference}`;
  const loc = [e.fileName, e.page ? `p.${e.page}` : null, e.confidence !== undefined ? `conf ${Math.round(e.confidence * 100)}%` : null].filter(Boolean).join(", ");
  return `${e.label}${e.value ? `: ${e.value}` : ""}${loc ? ` [${loc}]` : ""}`;
}

export async function buildReportData(actor: Actor, applicationId: string): Promise<ReportData> {
  const app = await getAccessibleApplication(actor, applicationId);
  const applicant = actor.role === "APPLICANT";
  const [checklist, docs, lastRun, findings, verifs, reviews] = await Promise.all([
    prisma.requiredDocument.findMany({ where: { templateId: app.templateId }, orderBy: { sortOrder: "asc" } }),
    prisma.document.findMany({ where: { applicationId, state: "ACTIVE" }, include: { category: true, versions: { where: { isCurrent: true }, include: { fields: true } } } }),
    prisma.validationRun.findFirst({ where: { applicationId, status: "COMPLETED" }, orderBy: { runNumber: "desc" }, include: { results: true } }),
    prisma.finding.findMany({ where: { applicationId }, orderBy: { createdAt: "asc" } }),
    prisma.issuerVerification.findMany({ where: { applicationId }, orderBy: { requestedAt: "desc" } }),
    prisma.reviewAction.findMany({ where: { applicationId, ...(applicant ? { action: { not: "NOTE" } } : {}) }, orderBy: { createdAt: "asc" } }),
  ]);
  const currentVersionIds = new Set(docs.map((d) => d.versions[0]?.id));
  const order: Record<string, number> = { FAIL: 0, PROCESSING_FAILED: 1, REVIEW_REQUIRED: 2, PENDING: 3, PASS: 4, NOT_APPLICABLE: 5 };
  const data: ReportData = {
    generatedAt: new Date().toISOString(),
    generatedBy: `${actor.name} (${actor.role})`,
    disclaimer: DECISION_SUPPORT_DISCLAIMER,
    app: {
      reference: app.reference, institutionName: app.institutionName, institutionCode: app.institutionCode, category: app.institutionCategory, template: app.template.name, academicYear: app.academicYear,
      status: app.status, statusLabel: APPLICATION_STATUS_LABELS[app.status as ApplicationStatus], contact: `${app.contactName} <${app.contactEmail}>`, submittedAt: (app.submittedAt ?? app.createdAt).toISOString(),
      programmes: app.programmes.map((p) => ({ name: p.name, level: p.level, intake: p.intake })),
    },
    institutionRecord: { code: app.institution.code, name: app.institution.name, state: app.institution.state, city: app.institution.city },
    checklist: checklist.map((c) => ({ label: c.label, mandatory: c.mandatory, documents: docs.filter((d) => d.categoryCode === c.categoryCode && d.versions[0]).map((d) => `${d.versions[0].originalName} (v${d.versions[0].versionNo})`) })),
    documents: docs.filter((d) => d.versions[0]).map((d) => {
      const v = d.versions[0];
      return {
        category: d.category.name, file: v.originalName, version: v.versionNo, sha256: v.sha256, method: v.extractionMethod, pages: v.pageCount, ocrConfidence: v.ocrConfidence, status: v.processingStatus,
        fields: v.fields.map((f) => ({ label: fieldLabel(f.key), value: f.correctedValue ?? f.value, confidence: f.correctedValue ? 1 : f.confidence, page: f.page, corrected: f.correctedValue !== null })),
      };
    }),
    lastRun: lastRun ? { runNumber: lastRun.runNumber, completedAt: lastRun.completedAt?.toISOString() ?? null, machineOutcome: lastRun.machineOutcome, summary: json(lastRun.summaryJson, {}), ruleVersions: json<{ code: string; version: number }[]>(lastRun.ruleVersionsJson, []) } : null,
    results: (lastRun?.results ?? [])
      .slice()
      .sort((a, b) => order[a.status] - order[b.status] || a.ruleCode.localeCompare(b.ruleCode))
      .map((r) => ({ ruleCode: r.ruleCode, version: r.ruleVersionNo, status: r.status, subject: r.subjectLabel, explanation: r.explanation, expected: r.expected, observed: r.observed, evidence: json<Evidence[]>(r.evidenceJson, []).map((e) => evidenceText(e, applicant)) })),
    findings: findings.map((f) => ({ title: f.title, type: f.type, source: f.source, severity: f.severity, status: f.status, outcomeClass: f.outcomeClass, deterministic: f.isDeterministic, recommendedAction: f.recommendedAction, resolution: f.resolutionNote })),
    verifications: verifs.filter((v) => currentVersionIds.has(v.documentVersionId)).map((v) => ({
      category: docs.find((d) => d.id === v.documentId)?.category.name ?? "", source: v.sourceName, sourceType: v.sourceType, status: v.status, at: v.requestedAt.toISOString(), reference: v.responseRef,
      comparisons: json(v.comparisonJson, []), limitation: v.limitation ?? v.errorMessage,
    })),
    reviewActions: reviews.map((r) => ({ at: r.createdAt.toISOString(), actor: r.actorName, role: r.actorRole, action: REVIEW_ACTION_LABELS[r.action] ?? r.action, outcome: r.outcome, reason: r.reason, reference: r.reference })),
    limitations: [
      "Issuer verification in this environment uses SIMULATED sources with fictional records unless a source is explicitly labelled REAL or SANDBOX. Simulated results are not responses from AICTE, an issuing authority or a government portal.",
      "Extraction relies on embedded PDF text or OCR; values with low confidence are routed to human review and may be corrected by authorised reviewers (corrections are audited, machine values retained).",
      "Anomaly indicators are investigative heuristics, not findings of fraud.",
      "Rules marked as sample rules are demonstration policies, not verified AICTE regulations.",
      "Documentary evidence cannot establish physical infrastructure compliance; inspection remains necessary where required.",
    ],
  };
  await recordAudit({ actor, eventType: "REPORT_GENERATED", action: `Validation report generated for ${app.reference}`, applicationId });
  return data;
}
