import { z } from "zod";
import { assertInstitutionAccess, assertPermission, DomainError, hasPermission, NotFoundError, type Actor } from "@/lib/auth/permissions";
import { ACTIVE_FINDING_STATUSES, type ApplicationStatus } from "@/lib/domain";
import { deriveApplicationStatus } from "@/lib/validation/status";
import { canTransition, isMachineStatus } from "@/lib/workflow/transitions";
import { prisma, type Tx } from "./db";
import { recordAudit } from "./audit";
import { APPLICATION_TYPES } from "@/lib/workflow/stages";

/** Transition an application's status, rejecting anything the state machine does not allow. */
export async function transitionStatus(
  tx: Tx,
  applicationId: string,
  to: ApplicationStatus,
  by: { actor: Actor | null; label?: string; reason?: string; correlationId?: string },
): Promise<void> {
  const app = await tx.application.findUniqueOrThrow({ where: { id: applicationId }, select: { status: true } });
  const from = app.status as ApplicationStatus;
  if (from === to) return;
  if (!canTransition(from, to)) throw new DomainError(`Invalid status transition: ${from} → ${to}.`);
  const updated = await tx.application.updateMany({ where: { id: applicationId, status: from }, data: { status: to } });
  if (updated.count !== 1) throw new DomainError("The application was modified concurrently. Reload and try again.");
  const label = by.actor ? by.actor.name : by.label ?? "system:pravah";
  await tx.statusChange.create({ data: { applicationId, fromStatus: from, toStatus: to, actorId: by.actor?.userId ?? null, actorLabel: label, reason: by.reason ?? null } });
  await recordAudit(
    { actor: by.actor ?? { label: label, role: "SYSTEM" }, eventType: "APPLICATION_STATUS_CHANGED", action: `Status changed ${from} → ${to}`, applicationId, before: { status: from }, after: { status: to }, reason: by.reason, correlationId: by.correlationId },
    tx,
  );
}

/**
 * Recompute a machine-derived status from open findings and the last run's machine outcome.
 * Human workflow states (rectification, ready, closed) are never overridden automatically.
 */
export async function reconcileStatus(tx: Tx, applicationId: string, correlationId?: string): Promise<ApplicationStatus> {
  const app = await tx.application.findUniqueOrThrow({ where: { id: applicationId }, select: { status: true } });
  const current = app.status as ApplicationStatus;
  if (!isMachineStatus(current)) return current;
  const [open, lastRun] = await Promise.all([
    tx.finding.findMany({ where: { applicationId, status: { in: ACTIVE_FINDING_STATUSES } }, select: { outcomeClass: true } }),
    tx.validationRun.findFirst({ where: { applicationId, status: "COMPLETED" }, orderBy: { runNumber: "desc" }, select: { machineOutcome: true } }),
  ]);
  if (!lastRun) return current;
  const next = deriveApplicationStatus(open, (lastRun.machineOutcome as ApplicationStatus) ?? null);
  if (next !== current && canTransition(current, next)) {
    await transitionStatus(tx, applicationId, next, { actor: null, label: "system:status-reconciler", reason: "Status recomputed from open findings", correlationId });
    return next;
  }
  return current;
}

async function nextReference(tx: Tx, academicYear: string): Promise<string> {
  const year = academicYear.slice(0, 4);
  const name = `application:${year}`;
  const c = await tx.counter.upsert({ where: { name }, create: { name, value: 1 }, update: { value: { increment: 1 } } });
  return `PRV-${year}-${String(c.value).padStart(6, "0")}`;
}

export const CreateApplicationSchema = z.object({
  institutionId: z.string().min(1),
  templateCode: z.string().min(1),
  // The approval type decides the processing pathway (stage combination) when it is submitted.
  applicationType: z.enum(APPLICATION_TYPES).default("EXTENSION_OF_APPROVAL"),
  institutionName: z.string().trim().min(3).max(200),
  institutionCode: z.string().trim().max(50).optional().transform((v) => v || null),
  institutionCategory: z.string().trim().min(2).max(100),
  academicYear: z.string().trim().regex(/^\d{4}-\d{2}$/, "Use the format 2027-28"),
  contactName: z.string().trim().min(2).max(120),
  contactEmail: z.string().trim().email().max(200),
  contactPhone: z.string().trim().max(30).optional().transform((v) => v || null),
  programmes: z
    .array(z.object({ name: z.string().trim().min(2).max(200), level: z.string().trim().min(1).max(20), intake: z.coerce.number().int().min(1).max(5000) }))
    .min(1, "Add at least one programme")
    .max(20),
});
export type CreateApplicationInput = z.input<typeof CreateApplicationSchema>;

export async function createApplication(actor: Actor, input: CreateApplicationInput, opts: { createdAt?: Date } = {}) {
  assertPermission(actor, "application.create");
  const data = CreateApplicationSchema.parse(input);
  if (actor.role === "APPLICANT" && actor.institutionId !== data.institutionId) {
    throw new DomainError("Applicants can only create applications for their own institution.");
  }
  const [institution, template] = await Promise.all([
    prisma.institution.findUnique({ where: { id: data.institutionId } }),
    prisma.applicationTemplate.findUnique({ where: { code: data.templateCode } }),
  ]);
  if (!institution) throw new DomainError("Institution not found.");
  if (!template || !template.active) throw new DomainError("Application template not found or inactive.");
  return prisma.$transaction(async (tx) => {
    const reference = await nextReference(tx, data.academicYear);
    const app = await tx.application.create({
      data: {
        reference,
        institutionId: institution.id,
        templateId: template.id,
        applicationType: data.applicationType,
        institutionName: data.institutionName,
        institutionCode: data.institutionCode,
        institutionCategory: data.institutionCategory,
        academicYear: data.academicYear,
        contactName: data.contactName,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        createdById: actor.userId,
        submittedAt: opts.createdAt ?? new Date(),
        createdAt: opts.createdAt,
        programmes: { create: data.programmes },
      },
    });
    await tx.statusChange.create({ data: { applicationId: app.id, toStatus: "DRAFT", actorId: actor.userId, actorLabel: actor.name, reason: "Application created", createdAt: opts.createdAt } });
    await recordAudit({ actor, eventType: "APPLICATION_CREATED", action: `Application ${reference} created (${template.name})`, applicationId: app.id, after: { reference, institution: data.institutionName, template: template.code, applicationType: data.applicationType, academicYear: data.academicYear } }, tx);
    return app;
  });
}

/** Load an application the actor is allowed to see, or throw NotFoundError. */
export async function getAccessibleApplication(actor: Actor, applicationId: string) {
  const app = await prisma.application.findUnique({ where: { id: applicationId }, include: { template: true, institution: { include: { programmes: true } }, programmes: true } });
  if (!app) throw new NotFoundError();
  assertInstitutionAccess(actor, app.institutionId, app.institution.regionId);
  return app;
}

/** Prisma filter for the applications an actor may see (own institution, own Region, or all). */
export function applicationScope(actor: Actor) {
  if (hasPermission(actor.role, "application.viewAll")) {
    if (actor.role === "SCRUTINY_OFFICER" && actor.regionId) return { institution: { regionId: actor.regionId } };
    return {};
  }
  return { institutionId: actor.institutionId ?? "__none__" };
}

export async function listApplications(actor: Actor, filters: { status?: string; q?: string; template?: string } = {}) {
  const where = {
    ...applicationScope(actor),
    ...(filters.status ? { status: filters.status as ApplicationStatus } : {}),
    ...(filters.template ? { template: { code: filters.template } } : {}),
    ...(filters.q
      ? { OR: [{ reference: { contains: filters.q } }, { institutionName: { contains: filters.q } }, { institutionCode: { contains: filters.q } }] }
      : {}),
  };
  const apps = await prisma.application.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      template: { select: { name: true, code: true } },
      _count: { select: { findings: { where: { status: { in: ACTIVE_FINDING_STATUSES } } } } },
      runs: { where: { status: "COMPLETED" }, orderBy: { runNumber: "desc" }, take: 1, select: { summaryJson: true, runNumber: true, completedAt: true } },
    },
  });
  return apps.map((a) => {
    const run = a.runs[0];
    const summary = run ? (JSON.parse(run.summaryJson) as { total: number; pass: number; notApplicable: number }) : null;
    return {
      id: a.id,
      reference: a.reference,
      institutionName: a.institutionName,
      institutionCode: a.institutionCode,
      templateName: a.template.name,
      templateCode: a.template.code,
      academicYear: a.academicYear,
      status: a.status as ApplicationStatus,
      submittedAt: a.submittedAt ?? a.createdAt,
      openFindings: a._count.findings,
      lastRun: run ? { runNumber: run.runNumber, completedAt: run.completedAt, passRatio: summary && summary.total ? (summary.pass + summary.notApplicable) / summary.total : 0, total: summary?.total ?? 0, passed: summary ? summary.pass + summary.notApplicable : 0 } : null,
    };
  });
}

export async function getApplicationDetail(actor: Actor, applicationId: string) {
  const base = await getAccessibleApplication(actor, applicationId);
  const isApplicant = actor.role === "APPLICANT";
  const [checklist, documents, runs, findings, verifications, reviewActions, rectifications, statusChanges] = await Promise.all([
    prisma.requiredDocument.findMany({ where: { templateId: base.templateId }, orderBy: { sortOrder: "asc" }, include: { category: true } }),
    prisma.document.findMany({
      where: { applicationId },
      orderBy: { createdAt: "asc" },
      include: { category: true, versions: { orderBy: { versionNo: "desc" }, select: { id: true, versionNo: true, isCurrent: true, originalName: true, mimeType: true, sizeBytes: true, sha256: true, uploadedAt: true, uploadedById: true, processingStatus: true, processingError: true, extractionMethod: true, pageCount: true, ocrConfidence: true, supersededAt: true, warningsJson: true } } },
    }),
    prisma.validationRun.findMany({ where: { applicationId }, orderBy: { runNumber: "desc" } }),
    prisma.finding.findMany({ where: { applicationId }, orderBy: [{ createdAt: "desc" }], include: { document: { select: { id: true, categoryCode: true } } } }),
    prisma.issuerVerification.findMany({ where: { applicationId }, orderBy: { requestedAt: "desc" } }),
    prisma.reviewAction.findMany({ where: { applicationId, ...(isApplicant ? { action: { not: "NOTE" } } : {}) }, orderBy: { createdAt: "desc" } }),
    prisma.rectificationRequest.findMany({ where: { applicationId }, orderBy: { createdAt: "desc" } }),
    prisma.statusChange.findMany({ where: { applicationId }, orderBy: { createdAt: "asc" } }),
  ]);
  return { app: base, checklist, documents, runs, findings, verifications, reviewActions, rectifications, statusChanges };
}

export async function listFormOptions(actor: Actor) {
  const [institutions, templates] = await Promise.all([
    prisma.institution.findMany({ where: actor.role === "APPLICANT" ? { id: actor.institutionId ?? "__none__" } : {}, orderBy: { name: "asc" }, include: { programmes: true } }),
    prisma.applicationTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  return { institutions, templates };
}
