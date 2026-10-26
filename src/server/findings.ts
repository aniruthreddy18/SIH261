import { assertInstitutionAccess, assertPermission, DomainError, NotFoundError, type Actor } from "@/lib/auth/permissions";
import { ACTIVE_FINDING_STATUSES, ROLES, type FindingSource, type OutcomeClass, type Role, type Severity } from "@/lib/domain";
import type { Evidence } from "@/lib/validation/types";
import { prisma, type Tx } from "./db";
import { recordAudit } from "./audit";
import { applicationScope, reconcileStatus } from "./applications";
import { notifyInstitution, notifyRoles } from "./notifications";

export interface FindingDraft {
  source: FindingSource;
  fingerprint: string;
  type: string;
  title: string;
  description: string;
  severity: Severity;
  outcomeClass: OutcomeClass;
  isDeterministic: boolean;
  confidence?: number | null;
  method?: string | null;
  evidence: Evidence[];
  recommendedAction: string;
  documentId?: string | null;
  ruleCode?: string | null;
  ruleVersionNo?: number | null;
  verificationId?: string | null;
  evidenceKey: string;
  assignedRole: Role;
}

export type UpsertOutcome = "CREATED" | "UPDATED" | "ACCEPTED_BY_REVIEWER";

/**
 * Create or update the finding for a fingerprint. Findings that a reviewer resolved or
 * dismissed stay closed while the underlying evidence is unchanged; new evidence that still
 * fails opens a fresh finding (history is preserved).
 */
export async function upsertFinding(tx: Tx, applicationId: string, d: FindingDraft, opts: { runId?: string; reopenRectification?: boolean } = {}): Promise<{ id: string; outcome: UpsertOutcome }> {
  const existing = await tx.finding.findFirst({ where: { applicationId, fingerprint: d.fingerprint }, orderBy: { createdAt: "desc" } });
  const data = {
    source: d.source,
    type: d.type,
    title: d.title.slice(0, 300),
    description: d.description,
    severity: d.severity,
    outcomeClass: d.outcomeClass,
    isDeterministic: d.isDeterministic,
    confidence: d.confidence ?? null,
    method: d.method ?? null,
    evidenceJson: JSON.stringify(d.evidence),
    recommendedAction: d.recommendedAction,
    documentId: d.documentId ?? null,
    ruleCode: d.ruleCode ?? null,
    ruleVersionNo: d.ruleVersionNo ?? null,
    verificationId: d.verificationId ?? null,
    evidenceKey: d.evidenceKey,
  };
  if (existing && (ACTIVE_FINDING_STATUSES as string[]).includes(existing.status)) {
    const reopen = opts.reopenRectification && existing.status === "RECTIFICATION_REQUESTED";
    await tx.finding.update({ where: { id: existing.id }, data: { ...data, lastRunId: opts.runId ?? existing.lastRunId, ...(reopen ? { status: "OPEN" } : {}) } });
    return { id: existing.id, outcome: "UPDATED" };
  }
  if (existing && (existing.status === "RESOLVED" || existing.status === "DISMISSED") && existing.evidenceKey === d.evidenceKey) {
    await tx.finding.update({ where: { id: existing.id }, data: { lastRunId: opts.runId ?? existing.lastRunId } });
    return { id: existing.id, outcome: "ACCEPTED_BY_REVIEWER" };
  }
  const created = await tx.finding.create({ data: { ...data, applicationId, fingerprint: d.fingerprint, status: "OPEN", assignedRole: d.assignedRole, firstRunId: opts.runId ?? null, lastRunId: opts.runId ?? null } });
  return { id: created.id, outcome: "CREATED" };
}

/** Auto-clear active findings of a source whose fingerprints are no longer produced. */
export async function clearStaleFindings(tx: Tx, applicationId: string, source: FindingSource, stillFailing: Set<string>, note: string, runId?: string) {
  const active = await tx.finding.findMany({ where: { applicationId, source, status: { in: ACTIVE_FINDING_STATUSES } }, select: { id: true, fingerprint: true } });
  const toClear = active.filter((f) => !stillFailing.has(f.fingerprint)).map((f) => f.id);
  if (toClear.length) {
    await tx.finding.updateMany({ where: { id: { in: toClear } }, data: { status: "AUTO_CLEARED", resolvedAt: new Date(), resolutionNote: note, lastRunId: runId } });
  }
  return toClear.length;
}

async function loadFindingForReview(actor: Actor, findingId: string) {
  assertPermission(actor, "finding.review");
  const f = await prisma.finding.findUnique({ where: { id: findingId }, include: { application: true } });
  if (!f) throw new NotFoundError();
  assertInstitutionAccess(actor, f.application.institutionId);
  if (f.application.status === "CLOSED") throw new DomainError("The application is closed.");
  return f;
}

function requireReason(reason: string) {
  const r = reason.trim();
  if (r.length < 5) throw new DomainError("A reason of at least 5 characters is required for every review action.");
  if (r.length > 2000) throw new DomainError("Reason is too long (max 2000 characters).");
  return r;
}

export type ReviewActionKind = "NOTE" | "REQUEST_INFO" | "ESCALATE" | "RESOLVE" | "DISMISS";

export async function reviewFinding(actor: Actor, findingId: string, action: ReviewActionKind, reasonInput: string, opts: { escalateTo?: Role; reference?: string } = {}) {
  const f = await loadFindingForReview(actor, findingId);
  const reason = requireReason(reasonInput);
  const active = (ACTIVE_FINDING_STATUSES as string[]).includes(f.status);
  if (action !== "NOTE" && !active) throw new DomainError("This finding is no longer open.");
  if (action === "ESCALATE" && (!opts.escalateTo || !ROLES.includes(opts.escalateTo) || opts.escalateTo === "APPLICANT" || opts.escalateTo === "ADMIN")) {
    throw new DomainError("Choose a reviewer role to escalate to.");
  }
  const statusFor: Record<ReviewActionKind, string | null> = { NOTE: null, REQUEST_INFO: "INFO_REQUESTED", ESCALATE: "ESCALATED", RESOLVE: "RESOLVED", DISMISS: "DISMISSED" };
  const eventFor = { NOTE: "FINDING_NOTE_ADDED", REQUEST_INFO: "FINDING_INFO_REQUESTED", ESCALATE: "FINDING_ESCALATED", RESOLVE: "FINDING_RESOLVED", DISMISS: "FINDING_DISMISSED" } as const;
  const newStatus = statusFor[action];

  await prisma.$transaction(async (tx) => {
    if (newStatus) {
      const closing = newStatus === "RESOLVED" || newStatus === "DISMISSED";
      await tx.finding.update({
        where: { id: f.id },
        data: {
          status: newStatus as "OPEN",
          ...(action === "ESCALATE" ? { assignedRole: opts.escalateTo } : {}),
          ...(closing ? { resolvedAt: new Date(), resolvedById: actor.userId, resolutionNote: reason } : {}),
        },
      });
    }
    await tx.reviewAction.create({ data: { applicationId: f.applicationId, findingId: f.id, actorId: actor.userId, actorName: actor.name, actorRole: actor.role, action, outcome: action === "ESCALATE" ? opts.escalateTo : newStatus, reason, reference: opts.reference?.trim() || null } });
    await recordAudit({ actor, eventType: eventFor[action], action: `${action.replace("_", " ").toLowerCase()} — ${f.title}`, applicationId: f.applicationId, documentId: f.documentId, before: { status: f.status, assignedRole: f.assignedRole }, after: newStatus ? { status: newStatus, assignedRole: action === "ESCALATE" ? opts.escalateTo : f.assignedRole } : undefined, reason }, tx);
    if (action === "REQUEST_INFO") {
      await notifyInstitution(f.application.institutionId, { type: "INFO_REQUESTED", title: "Additional information requested", body: `${f.application.reference}: ${f.title}`, link: `/applications/${f.applicationId}?tab=findings`, severity: f.severity }, tx);
    }
    if (action === "ESCALATE" && opts.escalateTo) {
      await notifyRoles([opts.escalateTo], { type: "ESCALATED", title: "Finding escalated for review", body: `${f.application.reference}: ${f.title}`, link: `/review/${f.id}`, severity: f.severity }, tx);
    }
    if (newStatus === "RESOLVED" || newStatus === "DISMISSED") await reconcileStatus(tx, f.applicationId);
  });
}

export async function listReviewQueue(actor: Actor, filters: { severity?: string; role?: string; type?: string; source?: string } = {}) {
  assertPermission(actor, "finding.review");
  return prisma.finding.findMany({
    where: {
      status: { in: ACTIVE_FINDING_STATUSES },
      application: { ...applicationScope(actor), status: { not: "CLOSED" } },
      ...(filters.severity ? { severity: filters.severity as Severity } : {}),
      ...(filters.role ? { assignedRole: filters.role as Role } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.source ? { source: filters.source as FindingSource } : {}),
    },
    include: { application: { select: { id: true, reference: true, institutionName: true, status: true } } },
    orderBy: [{ createdAt: "asc" }],
    take: 500,
  });
}

export async function getFindingDetail(actor: Actor, findingId: string) {
  const f = await prisma.finding.findUnique({
    where: { id: findingId },
    include: {
      application: { select: { id: true, reference: true, institutionName: true, institutionId: true, status: true } },
      reviewActions: { orderBy: { createdAt: "desc" } },
      document: { include: { category: true, versions: { where: { isCurrent: true }, select: { id: true, versionNo: true, originalName: true } } } },
    },
  });
  if (!f) throw new NotFoundError();
  assertInstitutionAccess(actor, f.application.institutionId);
  const reviewActions = actor.role === "APPLICANT" ? f.reviewActions.filter((r) => r.action !== "NOTE") : f.reviewActions;
  const verification = f.verificationId ? await prisma.issuerVerification.findUnique({ where: { id: f.verificationId } }) : null;
  return { ...f, reviewActions, verification };
}
