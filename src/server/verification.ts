// Layer 3 — issuer verification orchestration. Chooses an adapter per document category,
// executes it with a timeout and bounded retries, persists the normalised response, and routes
// every non-verified outcome to human review. An unsupported category is recorded explicitly as
// NOT_SUPPORTED — it is never treated as verified.
import crypto from "node:crypto";
import { assertInstitutionAccess, assertPermission, DomainError, NotFoundError, type Actor } from "@/lib/auth/permissions";
import { VERIFICATION_STATUS_LABELS, type Severity, type SourceType, type VerificationStatus } from "@/lib/domain";
import { createInstitutionRegistryAdapter, createOfficialProviderAdapter, createSyntheticIssuerAdapter, executeVerification } from "@/lib/verification/adapters";
import type { IssuerAdapter, VerificationRequest } from "@/lib/verification/types";
import type { Evidence } from "@/lib/validation/types";
import { prisma, json, type Tx } from "./db";
import { recordAudit, SYSTEM } from "./audit";
import { getAccessibleApplication, reconcileStatus } from "./applications";
import { upsertFinding } from "./findings";
import { notifyRoles } from "./notifications";
import { getSettings } from "./settings";
import { effectiveFields } from "./validation";

export async function getAdapters(): Promise<IssuerAdapter[]> {
  const [sources, settings] = await Promise.all([prisma.issuerSource.findMany(), getSettings()]);
  const byId = new Map(sources.map((s) => [s.id, s]));
  const adapters: IssuerAdapter[] = [];
  const official = createOfficialProviderAdapter({
    url: process.env.OFFICIAL_ISSUER_API_URL,
    apiKey: process.env.OFFICIAL_ISSUER_API_KEY,
    name: process.env.OFFICIAL_ISSUER_NAME,
    categories: (process.env.OFFICIAL_ISSUER_CATEGORIES ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    sourceType: process.env.OFFICIAL_ISSUER_SOURCE_TYPE === "REAL" ? "REAL" : "SANDBOX",
  });
  if (official.configured && byId.get("official-provider")?.enabled !== false) adapters.push(official);
  const synthetic = byId.get("synthetic-demo-issuer");
  if (synthetic?.enabled) {
    adapters.push(
      createSyntheticIssuerAdapter({
        categories: json<string[]>(synthetic.categoriesJson, []),
        simulateOutage: settings.syntheticIssuerOutage,
        latencyMs: json<{ latencyMs?: number }>(synthetic.configJson, {}).latencyMs ?? 0,
        lookup: async (ref) => {
          const r = await prisma.syntheticIssuerRecord.findUnique({ where: { referenceNumber: ref.trim() } });
          return r ? { ...r, extra: json<Record<string, string>>(r.extraJson, {}) } : null;
        },
      }),
    );
  }
  const registry = byId.get("demo-institution-registry");
  if (registry?.enabled) {
    adapters.push(
      createInstitutionRegistryAdapter({
        categories: json<string[]>(registry.categoriesJson, []),
        lookup: async (code) => {
          const all = await prisma.institution.findMany({ include: { programmes: true } });
          const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
          const inst = all.find((i) => norm(i.code) === norm(code));
          return inst ? { code: inst.code, name: inst.name, programmes: inst.programmes } : null;
        },
      }),
    );
  }
  return adapters;
}

const SEVERITY_FOR: Record<VerificationStatus, Severity> = {
  VERIFIED: "LOW",
  MISMATCH_DETECTED: "HIGH",
  EXPIRED: "HIGH",
  VERIFICATION_PENDING: "MEDIUM",
  SOURCE_UNAVAILABLE: "MEDIUM",
  MANUAL_REVIEW_REQUIRED: "MEDIUM",
  NOT_SUPPORTED: "MEDIUM",
};

const ACTION_FOR: Record<VerificationStatus, string> = {
  VERIFIED: "",
  MISMATCH_DETECTED: "Compare the mismatched fields with the submitted document. Confirm with the issuing authority, then record a manual verification outcome or return for rectification.",
  EXPIRED: "The source reports the record as expired. Request currently valid evidence or confirm the status with the issuer.",
  VERIFICATION_PENDING: "Retry verification later, or confirm manually with the issuer.",
  SOURCE_UNAVAILABLE: "Retry verification once the source is available, or confirm manually with the issuer and record the outcome with a reference.",
  MANUAL_REVIEW_REQUIRED: "Confirm the document directly with the issuing authority and record a manual verification outcome with a reference.",
  NOT_SUPPORTED: "No authorised source is integrated for this document type. Confirm manually with the issuer and record the outcome with a reference.",
};

interface VerifyTarget {
  documentId: string;
  categoryCode: string;
  categoryName: string;
  verificationRequired: boolean;
  version: { id: string; versionNo: number; originalName: string; fields: Parameters<typeof effectiveFields>[0] };
}

async function persistVerification(
  tx: Tx,
  actor: Actor,
  app: { id: string; reference: string; institutionName: string },
  t: VerifyTarget,
  adapter: { id: string; name: string; sourceType: SourceType } | null,
  req: VerificationRequest,
  res: { status: VerificationStatus; sourceTimestamp: string | null; returned: Record<string, string | null> | null; comparisons: unknown[]; limitation?: string; error?: string; responseRef?: string },
  attempts: number,
  correlationId: string,
) {
  const v = await tx.issuerVerification.create({
    data: {
      applicationId: app.id,
      documentId: t.documentId,
      documentVersionId: t.version.id,
      sourceId: adapter?.id ?? "none",
      sourceName: adapter?.name ?? "No integrated source",
      sourceType: adapter?.sourceType ?? "SIMULATED",
      status: res.status,
      referenceNumber: req.referenceNumber,
      respondedAt: res.sourceTimestamp ? new Date(res.sourceTimestamp) : null,
      attempts,
      submittedJson: JSON.stringify({ referenceNumber: req.referenceNumber, ...req.submitted }),
      returnedJson: res.returned ? JSON.stringify(res.returned) : null,
      comparisonJson: JSON.stringify(res.comparisons),
      limitation: res.limitation ?? (adapter ? null : "No issuer adapter supports this document category."),
      errorMessage: res.error ?? null,
      responseRef: res.responseRef ?? null,
      actorId: actor.userId,
      actorLabel: actor.name,
      correlationId,
    },
  });
  await recordAudit({ actor, eventType: "ISSUER_VERIFICATION_ATTEMPTED", action: `Verification of ${t.categoryName} via ${v.sourceName} [${v.sourceType}]: ${res.status}`, applicationId: app.id, documentId: t.documentId, verificationRef: v.id, after: { status: res.status, attempts, sourceType: v.sourceType, responseRef: res.responseRef ?? null }, correlationId }, tx);
  if (res.status === "SOURCE_UNAVAILABLE") {
    await recordAudit({ actor: SYSTEM.verification, eventType: "ISSUER_SOURCE_UNAVAILABLE", action: `${v.sourceName} unavailable after ${attempts} attempt(s)`, applicationId: app.id, documentId: t.documentId, verificationRef: v.id, reason: res.error ?? null, correlationId }, tx);
  }

  const fingerprint = `VERIFY|${t.documentId}`;
  if (res.status === "VERIFIED") {
    await tx.finding.updateMany({ where: { applicationId: app.id, fingerprint, status: { in: ["OPEN", "INFO_REQUESTED", "ESCALATED", "RECTIFICATION_REQUESTED"] } }, data: { status: "AUTO_CLEARED", resolvedAt: new Date(), resolutionNote: `Verified by ${v.sourceName} [${v.sourceType}] on ${new Date().toISOString().slice(0, 10)}.` } });
  } else {
    const mismatched = (res.comparisons as { label: string; submitted: string | null; returned: string | null; match: boolean | null }[]).filter((c) => c.match === false);
    const evidence: Evidence[] = [
      { kind: "DOCUMENT", label: `${t.categoryName} — ${t.version.originalName} (v${t.version.versionNo})`, documentId: t.documentId, versionId: t.version.id, fileName: t.version.originalName },
      { kind: "SOURCE", label: `${v.sourceName} [${v.sourceType}]`, value: `${res.status}${res.responseRef ? ` · ref ${res.responseRef}` : ""}` },
      ...mismatched.map((c) => ({ kind: "SOURCE" as const, label: `Mismatch — ${c.label}`, value: `Submitted "${c.submitted}" vs source "${c.returned}"` })),
    ];
    const desc = mismatched.length
      ? `${VERIFICATION_STATUS_LABELS[res.status]}: ${mismatched.map((c) => `${c.label} (submitted "${c.submitted}", source "${c.returned}")`).join("; ")}.`
      : `${VERIFICATION_STATUS_LABELS[res.status]}. ${res.limitation ?? res.error ?? ""}`.trim();
    await upsertFinding(tx, app.id, {
      source: "VERIFICATION",
      fingerprint,
      type: `VERIFICATION_${res.status}`,
      title: `Issuer verification — ${t.categoryName}: ${VERIFICATION_STATUS_LABELS[res.status]}`,
      description: `${desc}${v.sourceType === "SIMULATED" ? " (Simulated source — not an official response.)" : ""}`,
      severity: SEVERITY_FOR[res.status],
      outcomeClass: "REVIEW_REQUIRED",
      isDeterministic: false,
      method: `${v.sourceName} [${v.sourceType}]`,
      evidence,
      recommendedAction: ACTION_FOR[res.status],
      documentId: t.documentId,
      verificationId: v.id,
      evidenceKey: `${t.version.id}|${res.status}|${JSON.stringify(mismatched)}`,
      assignedRole: "VERIFICATION_OFFICER",
    });
  }
  return v;
}

export async function runVerification(actor: Actor, applicationId: string, documentId?: string) {
  assertPermission(actor, "verification.run");
  const app = await getAccessibleApplication(actor, applicationId);
  if (app.status === "CLOSED" || app.status === "PROCESSING") throw new DomainError(`Verification cannot run while the application is ${app.status.toLowerCase()}.`);
  const [adapters, settings, docs] = await Promise.all([
    getAdapters(),
    getSettings(),
    prisma.document.findMany({ where: { applicationId, state: "ACTIVE", ...(documentId ? { id: documentId } : {}) }, include: { category: true, versions: { where: { isCurrent: true }, include: { fields: true } } } }),
  ]);
  const correlationId = crypto.randomUUID();
  const asOf = new Date().toISOString().slice(0, 10);
  const results: { documentId: string; status: VerificationStatus; sourceType: SourceType | "NONE" }[] = [];
  for (const d of docs) {
    const version = d.versions[0];
    if (!version) continue;
    const adapter = adapters.find((a) => a.supports(d.categoryCode)) ?? null;
    if (!adapter && !d.category.verificationRequired) continue;
    const target: VerifyTarget = { documentId: d.id, categoryCode: d.categoryCode, categoryName: d.category.name, verificationRequired: d.category.verificationRequired, version };
    const f = effectiveFields(version.fields);
    const val = (k: string) => f[k]?.normalized ?? f[k]?.value ?? null;
    const req: VerificationRequest = {
      categoryCode: d.categoryCode,
      referenceNumber: f.referenceNumber?.value ?? null,
      submitted: { institutionName: f.institutionName?.value ?? null, institutionCode: f.institutionCode?.value ?? null, issueDate: val("issueDate"), expiryDate: val("expiryDate"), programmeName: f.programmeName?.value ?? null, approvedIntake: val("approvedIntake") },
      asOf,
    };
    let res;
    let attempts = 1;
    if (version.processingStatus !== "PROCESSED") {
      res = { status: "MANUAL_REVIEW_REQUIRED" as const, sourceTimestamp: null, returned: null, comparisons: [], limitation: "Document has not been processed successfully; no details to verify." };
    } else if (!adapter) {
      res = { status: "NOT_SUPPORTED" as const, sourceTimestamp: null, returned: null, comparisons: [], limitation: `No authorised or demo issuer source is integrated for "${d.category.name}". Manual confirmation is required.` };
    } else {
      const r = await executeVerification(adapter, req, { timeoutMs: settings.issuerTimeoutMs, maxRetries: settings.issuerMaxRetries });
      res = r.response;
      attempts = r.attempts;
    }
    const v = await prisma.$transaction((tx) => persistVerification(tx, actor, app, target, adapter, req, res, attempts, correlationId), { timeout: 30_000 });
    results.push({ documentId: d.id, status: v.status as VerificationStatus, sourceType: adapter?.sourceType ?? "NONE" });
  }
  await prisma.$transaction((tx) => reconcileStatus(tx, applicationId, correlationId));
  const problems = results.filter((r) => r.status !== "VERIFIED");
  if (problems.length) {
    const unavailable = problems.filter((p) => p.status === "SOURCE_UNAVAILABLE").length;
    await notifyRoles(["VERIFICATION_OFFICER"], {
      type: unavailable ? "SOURCE_UNAVAILABLE" : "VERIFICATION_ISSUES",
      title: unavailable ? `Issuer source unavailable for ${app.reference}` : `${problems.length} verification issue(s) on ${app.reference}`,
      body: `${app.institutionName}: ${problems.map((p) => VERIFICATION_STATUS_LABELS[p.status]).join(", ")}`,
      link: `/applications/${applicationId}?tab=verification`,
      severity: problems.some((p) => p.status === "MISMATCH_DETECTED" || p.status === "EXPIRED") ? "HIGH" : "MEDIUM",
    });
  }
  return results;
}

/** Record a human-confirmed verification outcome (e.g. after contacting the issuer). */
export async function recordManualVerification(actor: Actor, documentId: string, outcome: "VERIFIED" | "MISMATCH_DETECTED", reason: string, reference: string) {
  assertPermission(actor, "verification.manual");
  const r = reason.trim();
  const ref = reference.trim();
  if (r.length < 5) throw new DomainError("A reason of at least 5 characters is required.");
  if (ref.length < 3) throw new DomainError("A confirmation reference (e.g. letter number or email reference) is required.");
  const doc = await prisma.document.findUnique({ where: { id: documentId }, include: { application: true, category: true, versions: { where: { isCurrent: true } } } });
  if (!doc) throw new NotFoundError();
  assertInstitutionAccess(actor, doc.application.institutionId);
  if (doc.application.status === "CLOSED") throw new DomainError("The application is closed.");
  const version = doc.versions[0];
  if (!version) throw new DomainError("Document has no current version.");
  const correlationId = crypto.randomUUID();
  await prisma.$transaction(async (tx) => {
    const v = await tx.issuerVerification.create({
      data: { applicationId: doc.applicationId, documentId, documentVersionId: version.id, sourceId: "manual", sourceName: `Manual confirmation by ${actor.name}`, sourceType: "MANUAL", status: outcome, actorId: actor.userId, actorLabel: actor.name, isManual: true, manualReason: r, responseRef: ref, respondedAt: new Date(), correlationId, limitation: "Recorded by an authorised officer; not an automated source response." },
    });
    const fingerprint = `VERIFY|${documentId}`;
    const finding = await tx.finding.findFirst({ where: { applicationId: doc.applicationId, fingerprint, status: { in: ["OPEN", "INFO_REQUESTED", "ESCALATED", "RECTIFICATION_REQUESTED"] } } });
    if (outcome === "VERIFIED") {
      if (finding) await tx.finding.update({ where: { id: finding.id }, data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById: actor.userId, resolutionNote: `Manually verified: ${r} (ref ${ref})`, verificationId: v.id } });
    } else {
      await upsertFinding(tx, doc.applicationId, {
        source: "VERIFICATION",
        fingerprint,
        type: "VERIFICATION_MISMATCH_DETECTED",
        title: `Issuer verification — ${doc.category.name}: mismatch confirmed manually`,
        description: `An authorised officer confirmed a mismatch with the issuer: ${r} (ref ${ref}).`,
        severity: "HIGH",
        outcomeClass: "FAIL",
        isDeterministic: false,
        method: "Manual confirmation",
        evidence: [{ kind: "SOURCE", label: `Manual confirmation by ${actor.name}`, value: `Reference ${ref}` }],
        recommendedAction: "Return the application for rectification with the confirmed discrepancy.",
        documentId,
        verificationId: v.id,
        evidenceKey: `${version.id}|MANUAL_MISMATCH|${ref}`,
        assignedRole: "VERIFICATION_OFFICER",
      });
    }
    await tx.reviewAction.create({ data: { applicationId: doc.applicationId, findingId: finding?.id ?? null, actorId: actor.userId, actorName: actor.name, actorRole: actor.role, action: "MANUAL_VERIFICATION", outcome, reason: r, reference: ref } });
    await recordAudit({ actor, eventType: "MANUAL_VERIFICATION_RECORDED", action: `Manual verification of ${doc.category.name}: ${outcome}`, applicationId: doc.applicationId, documentId, verificationRef: v.id, reason: r, after: { outcome, reference: ref }, correlationId }, tx);
    await reconcileStatus(tx, doc.applicationId, correlationId);
  });
}

/** Documents needing verification whose current version lacks a VERIFIED (automatic or manual) result. */
export async function verificationCoverage(applicationId: string) {
  const docs = await prisma.document.findMany({ where: { applicationId, state: "ACTIVE", category: { verificationRequired: true } }, include: { category: true, versions: { where: { isCurrent: true }, select: { id: true } } } });
  const verifs = await prisma.issuerVerification.findMany({ where: { applicationId }, orderBy: { requestedAt: "desc" } });
  return docs.map((d) => {
    const vid = d.versions[0]?.id;
    const latest = verifs.find((v) => v.documentVersionId === vid) ?? null;
    return { documentId: d.id, categoryName: d.category.name, latestStatus: (latest?.status ?? null) as VerificationStatus | null, latestSourceType: latest?.sourceType ?? null, covered: latest?.status === "VERIFIED" };
  });
}

export async function listVerifications(actor: Actor, filters: { status?: string; sourceType?: string } = {}) {
  assertPermission(actor, "application.viewAll");
  return prisma.issuerVerification.findMany({
    where: { ...(filters.status ? { status: filters.status as VerificationStatus } : {}), ...(filters.sourceType ? { sourceType: filters.sourceType as SourceType } : {}) },
    orderBy: { requestedAt: "desc" },
    take: 200,
    include: { application: { select: { id: true, reference: true, institutionName: true } } },
  });
}
