// Orchestrates a validation run: builds the application context, executes the deterministic
// rules engine and anomaly heuristics, persists results and findings, and reconciles status.
import crypto from "node:crypto";
import { APPLICANT_EDITABLE_STATUSES, assertPermission, DomainError, type Actor } from "@/lib/auth/permissions";
import { ACTIVE_FINDING_STATUSES, type ApplicationStatus, type ProcessingStatus, type Role } from "@/lib/domain";
import { detectAnomalies, type CrossApplicationDocument } from "@/lib/anomaly/detect";
import { FIELD_BY_KEY, interpretValue } from "@/lib/extraction/fields";
import { normalizeIdentifier } from "@/lib/extraction/normalize";
import { findingTypeForRule } from "@/lib/findings";
import { evaluateRules } from "@/lib/validation/engine";
import { deriveApplicationStatus, machineOutcome, outcomeClassFor, summarize } from "@/lib/validation/status";
import type { ApplicationContext, DocumentContext, FieldValue, RuleOutcome } from "@/lib/validation/types";
import { diffRuns } from "@/lib/validation/diff";
import { prisma, json } from "./db";
import { recordAudit, SYSTEM } from "./audit";
import { getAccessibleApplication, transitionStatus } from "./applications";
import { clearStaleFindings, upsertFinding } from "./findings";
import { notifyInstitution, notifyRoles } from "./notifications";
import { getActiveRuleSpecs } from "./rules";
import { getSettings } from "./settings";

type VersionWithFields = {
  id: string;
  versionNo: number;
  originalName: string;
  sha256: string;
  processingStatus: string;
  processingError: string | null;
  textContent: string | null;
  metadataJson: string | null;
  fields: { key: string; value: string | null; normalizedValue: string | null; confidence: number; page: number | null; excerpt: string | null; method: string; correctedValue: string | null }[];
};

/** Effective field values: a reviewer correction supersedes the machine value (which is retained). */
export function effectiveFields(fields: VersionWithFields["fields"]): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const f of fields) {
    if (f.correctedValue !== null) {
      const def = FIELD_BY_KEY.get(f.key);
      const interpreted = def ? interpretValue(def.type, f.correctedValue) : null;
      out[f.key] = { key: f.key, value: f.correctedValue, normalized: interpreted?.normalized ?? f.correctedValue, confidence: 1, page: f.page, excerpt: f.excerpt, method: "REVIEWER_CORRECTION", corrected: true };
    } else {
      out[f.key] = { key: f.key, value: f.value, normalized: f.normalizedValue, confidence: f.confidence, page: f.page, excerpt: f.excerpt, method: f.method, corrected: false };
    }
  }
  return out;
}

export async function buildContext(applicationId: string, runDate: string): Promise<ApplicationContext> {
  const app = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: {
      template: { include: { requiredDocuments: { orderBy: { sortOrder: "asc" } } } },
      programmes: true,
      institution: { include: { programmes: true } },
      documents: { where: { state: "ACTIVE" }, include: { category: true, versions: { where: { isCurrent: true }, include: { fields: true } } } },
    },
  });
  const settings = await getSettings();
  const documents: DocumentContext[] = app.documents
    .filter((d) => d.versions.length > 0)
    .map((d) => {
      const v = d.versions[0] as unknown as VersionWithFields;
      return {
        documentId: d.id,
        versionId: v.id,
        versionNo: v.versionNo,
        categoryCode: d.categoryCode,
        categoryName: d.category.name,
        fileName: v.originalName,
        sha256: v.sha256,
        processingStatus: v.processingStatus as ProcessingStatus,
        processingError: v.processingError,
        fields: effectiveFields(v.fields),
        textContent: v.textContent,
        metadata: json<Record<string, unknown>>(v.metadataJson, {}),
      };
    });
  return {
    applicationId: app.id,
    reference: app.reference,
    templateCode: app.template.code,
    institutionName: app.institutionName,
    institutionCode: app.institutionCode,
    academicYear: app.academicYear,
    programmes: app.programmes.map((p) => ({ name: p.name, level: p.level, intake: p.intake })),
    checklist: app.template.requiredDocuments.map((r) => ({ categoryCode: r.categoryCode, label: r.label, mandatory: r.mandatory })),
    documents,
    institutionRecord: { code: app.institution.code, name: app.institution.name, programmes: app.institution.programmes.map((p) => ({ name: p.name, level: p.level, approvedIntake: p.approvedIntake, lastApprovedYear: p.lastApprovedYear })) },
    runDate,
    settings: { lowConfidenceThreshold: settings.lowConfidenceThreshold, academicYearStartMonth: settings.academicYearStartMonth, academicYearStartDay: settings.academicYearStartDay },
  };
}

async function crossApplicationIndex(applicationId: string): Promise<CrossApplicationDocument[]> {
  const versions = await prisma.documentVersion.findMany({
    where: { isCurrent: true, document: { state: "ACTIVE", applicationId: { not: applicationId } } },
    select: { sha256: true, documentId: true, document: { select: { categoryCode: true, applicationId: true, application: { select: { reference: true } } } }, fields: { where: { key: "referenceNumber" }, select: { value: true, correctedValue: true } } },
  });
  return versions.map((v) => {
    const ref = v.fields[0]?.correctedValue ?? v.fields[0]?.value ?? null;
    return { applicationId: v.document.applicationId, applicationReference: v.document.application.reference, documentId: v.documentId, categoryCode: v.document.categoryCode, sha256: v.sha256, referenceNormalized: ref ? normalizeIdentifier(ref) : null };
  });
}

const ROLE_FOR_RULE: Role = "SCRUTINY_OFFICER";

export interface RunResult {
  runId: string;
  runNumber: number;
  machineOutcome: ApplicationStatus;
  status: ApplicationStatus;
  summary: ReturnType<typeof summarize>;
  newFindings: number;
  clearedFindings: number;
}

export async function runValidation(actor: Actor, applicationId: string, trigger: "MANUAL" | "RECTIFICATION" | "SEED" = "MANUAL"): Promise<RunResult> {
  assertPermission(actor, "validation.run");
  const app = await getAccessibleApplication(actor, applicationId);
  const status = app.status as ApplicationStatus;
  if (status === "PROCESSING") throw new DomainError("A validation run is already in progress for this application.");
  if (status === "CLOSED" || status === "READY_FOR_AUTHORIZED_REVIEW") throw new DomainError("Validation cannot be rerun once the application is with the authorised reviewer or closed.");
  if (actor.role === "APPLICANT") {
    if (!APPLICANT_EDITABLE_STATUSES.includes(status)) throw new DomainError("You cannot run validation in the current status.");
    if (status === "RECTIFICATION_REQUIRED" && trigger !== "RECTIFICATION") throw new DomainError("Submit your rectification to trigger revalidation.");
  }
  const pending = await prisma.documentVersion.count({ where: { isCurrent: true, document: { applicationId, state: "ACTIVE" }, processingStatus: { in: ["PENDING", "PROCESSING"] } } });
  if (pending > 0) throw new DomainError(`${pending} document(s) are still being processed. Wait for processing to finish, then run validation.`);

  const correlationId = crypto.randomUUID();
  const startedAt = new Date();
  // Claim the run: move to PROCESSING atomically (rejects concurrent runs).
  const run = await prisma.$transaction(async (tx) => {
    await transitionStatus(tx, applicationId, "PROCESSING", { actor, reason: `Validation run started (${trigger.toLowerCase()})`, correlationId });
    const last = await tx.validationRun.findFirst({ where: { applicationId }, orderBy: { runNumber: "desc" }, select: { runNumber: true } });
    const r = await tx.validationRun.create({ data: { applicationId, runNumber: (last?.runNumber ?? 0) + 1, trigger, startedById: actor.userId, startedByLabel: actor.name, startedAt, correlationId } });
    await recordAudit({ actor, eventType: "VALIDATION_RUN_STARTED", action: `Validation run #${r.runNumber} started`, applicationId, validationRunId: r.id, correlationId }, tx);
    return r;
  });

  try {
    const runDate = startedAt.toISOString().slice(0, 10);
    const [ctx, rules] = await Promise.all([buildContext(applicationId, runDate), getActiveRuleSpecs(startedAt)]);
    const outcomes = evaluateRules(ctx, rules);
    const anomalies = detectAnomalies(ctx, await crossApplicationIndex(applicationId));
    const statuses = outcomes.map((o) => o.status);
    const summary = summarize(statuses);
    const outcome = machineOutcome(statuses, anomalies.length);
    const checkTypeByCode = new Map(rules.map((r) => [r.code, r.checkType]));
    const previousRun = await prisma.validationRun.findFirst({ where: { applicationId, status: "COMPLETED", runNumber: { lt: run.runNumber } }, orderBy: { runNumber: "desc" }, include: { results: true } });

    const result = await prisma.$transaction(async (tx) => {
      await tx.ruleResult.createMany({
        data: outcomes.map((o: RuleOutcome) => ({
          runId: run.id,
          ruleVersionId: o.ruleVersionId,
          ruleCode: o.ruleCode,
          ruleVersionNo: o.ruleVersionNo,
          ruleName: o.ruleName,
          status: o.status,
          severity: o.severity,
          subjectKey: o.subjectKey,
          subjectLabel: o.subjectLabel,
          documentId: o.documentId ?? null,
          documentVersionId: o.documentVersionId ?? null,
          categoryCode: o.categoryCode ?? null,
          explanation: o.explanation,
          expected: o.expected,
          observed: o.observed,
          evidenceJson: JSON.stringify(o.evidence),
          nextAction: o.nextAction,
        })),
      });

      let newFindings = 0;
      const failing = new Set<string>();
      for (const o of outcomes) {
        const oc = outcomeClassFor(o.status);
        if (!oc) continue;
        const fingerprint = `RULE|${o.subjectKey}`;
        failing.add(fingerprint);
        const r = await upsertFinding(tx, applicationId, {
          source: "RULE",
          fingerprint,
          type: findingTypeForRule(checkTypeByCode.get(o.ruleCode) ?? "", o.status),
          title: `${o.ruleName}: ${o.subjectLabel}`,
          description: o.explanation,
          severity: o.severity,
          outcomeClass: oc,
          isDeterministic: o.status === "FAIL",
          method: `Rule ${o.ruleCode} v${o.ruleVersionNo}`,
          evidence: o.evidence,
          recommendedAction: o.nextAction ?? "Review the evidence.",
          documentId: o.documentId,
          ruleCode: o.ruleCode,
          ruleVersionNo: o.ruleVersionNo,
          evidenceKey: `${o.documentVersionId ?? ""}|${o.observed ?? ""}|${o.status}`,
          assignedRole: ROLE_FOR_RULE,
        }, { runId: run.id, reopenRectification: trigger === "RECTIFICATION" });
        if (r.outcome === "CREATED") newFindings++;
        if (o.status === "FAIL") {
          await recordAudit({ actor: SYSTEM.validation, eventType: "RULE_FAILED", action: `${o.ruleCode} failed: ${o.subjectLabel}`, applicationId, documentId: o.documentId ?? null, validationRunId: run.id, ruleVersion: `${o.ruleCode}@v${o.ruleVersionNo}`, after: { expected: o.expected, observed: o.observed }, correlationId }, tx);
        }
      }
      const cleared = await clearStaleFindings(tx, applicationId, "RULE", failing, `Check passed (or no longer applies) in validation run #${run.runNumber}.`, run.id);

      const anomalyKeys = new Set<string>();
      for (const a of anomalies) {
        anomalyKeys.add(a.fingerprint);
        const r = await upsertFinding(tx, applicationId, {
          source: "ANOMALY",
          fingerprint: a.fingerprint,
          type: a.type,
          title: a.title,
          description: `${a.description} ${a.reason}`,
          severity: a.severity,
          outcomeClass: "REVIEW_REQUIRED",
          isDeterministic: false,
          confidence: a.confidence,
          method: a.method,
          evidence: a.evidence,
          recommendedAction: a.recommendedAction,
          documentId: a.documentId,
          evidenceKey: JSON.stringify(a.evidence.map((e) => [e.versionId, e.value])),
          assignedRole: "SCRUTINY_OFFICER",
        }, { runId: run.id, reopenRectification: trigger === "RECTIFICATION" });
        if (r.outcome === "CREATED") {
          newFindings++;
          await recordAudit({ actor: SYSTEM.anomaly, eventType: "ANOMALY_FLAGGED", action: `${a.title} (${a.type})`, applicationId, documentId: a.documentId, validationRunId: run.id, after: { method: a.method, confidence: a.confidence }, correlationId }, tx);
        }
      }
      const clearedAnomalies = await clearStaleFindings(tx, applicationId, "ANOMALY", anomalyKeys, `Indicator no longer detected in validation run #${run.runNumber}.`, run.id);

      const open = await tx.finding.findMany({ where: { applicationId, status: { in: ACTIVE_FINDING_STATUSES } }, select: { outcomeClass: true, severity: true } });
      const next = deriveApplicationStatus(open, outcome);
      const diff = previousRun ? diffRuns(previousRun.results, outcomes.map((o) => ({ ...o, observed: o.observed }))) : [];
      await tx.validationRun.update({
        where: { id: run.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          machineOutcome: outcome,
          summaryJson: JSON.stringify({ ...summary, anomalies: anomalies.length, newFindings, cleared: cleared + clearedAnomalies, openFindings: open.length, changes: diff.length }),
          ruleVersionsJson: JSON.stringify(rules.map((r) => ({ code: r.code, version: r.version, id: r.ruleVersionId }))),
        },
      });
      await transitionStatus(tx, applicationId, next, { actor: null, label: SYSTEM.validation.label, reason: `Validation run #${run.runNumber}: ${summary.pass} passed, ${summary.fail} failed, ${summary.review} need review, ${summary.processingFailed} processing failures`, correlationId });
      await recordAudit({ actor: SYSTEM.validation, eventType: "VALIDATION_RUN_COMPLETED", action: `Validation run #${run.runNumber} completed — machine outcome ${outcome}`, applicationId, validationRunId: run.id, after: { summary, anomalies: anomalies.length, newFindings, cleared: cleared + clearedAnomalies, rules: rules.map((r) => `${r.code}@v${r.version}`) }, correlationId }, tx);

      if (newFindings > 0) {
        const high = open.filter((f) => f.severity === "HIGH" || f.severity === "CRITICAL").length;
        await notifyInstitution(app.institutionId, { type: "NEW_FINDINGS", title: `Validation found ${newFindings} new issue(s)`, body: `${app.reference}: status is now ${next.replace(/_/g, " ").toLowerCase()}.`, link: `/applications/${applicationId}?tab=findings`, severity: high ? "HIGH" : "MEDIUM" }, tx);
        if (trigger !== "SEED") {
          await notifyRoles(["SCRUTINY_OFFICER"], { type: "NEW_FINDINGS", title: `${newFindings} new finding(s) on ${app.reference}`, body: `${app.institutionName} — ${next.replace(/_/g, " ").toLowerCase()}`, link: `/applications/${applicationId}?tab=findings`, severity: high ? "HIGH" : "MEDIUM" }, tx);
        }
      }
      const expired = outcomes.filter((o) => o.status === "FAIL" && checkTypeByCode.get(o.ruleCode) === "DATE_VALID_ON");
      for (const e of expired) {
        await notifyInstitution(app.institutionId, { type: "EXPIRED_DOCUMENT", title: "Required document validity insufficient", body: `${app.reference}: ${e.explanation}`, link: `/applications/${applicationId}?tab=findings`, severity: "HIGH", dedupeKey: `expired:${run.id}:${e.subjectKey}` }, tx);
      }
      return { newFindings, cleared: cleared + clearedAnomalies, next };
    }, { timeout: 60_000 });

    return { runId: run.id, runNumber: run.runNumber, machineOutcome: outcome, status: result.next, summary, newFindings: result.newFindings, clearedFindings: result.cleared };
  } catch (err) {
    const message = err instanceof DomainError ? err.message : "The validation run failed due to a technical error.";
    console.error("[validation] run failed", (err as Error)?.message);
    await prisma.$transaction(async (tx) => {
      await tx.validationRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), errorMessage: message, machineOutcome: "PROCESSING_FAILED" } });
      await transitionStatus(tx, applicationId, "PROCESSING_FAILED", { actor: null, label: SYSTEM.validation.label, reason: message, correlationId });
      await recordAudit({ actor: SYSTEM.validation, eventType: "VALIDATION_RUN_FAILED", action: `Validation run #${run.runNumber} failed`, applicationId, validationRunId: run.id, reason: message, correlationId }, tx);
    });
    throw new DomainError(message);
  }
}

/** Result-level comparison of a run with the run before it. */
export async function getRunComparison(applicationId: string, runId: string) {
  const run = await prisma.validationRun.findUnique({ where: { id: runId }, include: { results: true } });
  if (!run || run.applicationId !== applicationId) return null;
  const prev = await prisma.validationRun.findFirst({ where: { applicationId, status: "COMPLETED", runNumber: { lt: run.runNumber } }, orderBy: { runNumber: "desc" }, include: { results: true } });
  if (!prev) return { run, previous: null, changes: [] };
  return { run, previous: prev, changes: diffRuns(prev.results, run.results) };
}
