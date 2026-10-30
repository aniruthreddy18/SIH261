// Institutional compliance monitoring (PS 26262 §D–E): time-bound undertakings attached to
// approvals and the validity of prescribed documents such as lease deeds. Institutions submit
// evidence or renewed documents online; authorised officials verify or return them. Due dates
// drive the reminders and escalations raised by src/server/alerts.ts.
import { z } from "zod";
import { assertPermission, DomainError, hasPermission, NotFoundError, type Actor } from "@/lib/auth/permissions";
import { checkUpload } from "@/lib/files/validate";
import { complianceTypeLabel, DOCUMENT_VALIDITY_TYPES, UNDERTAKING_TYPES } from "@/lib/workflow/stages";
import { prisma, type Tx } from "./db";
import { recordAudit } from "./audit";
import { notifyInstitution, notifyStaff } from "./notifications";
import { getSettings } from "./settings";
import { readFile, saveFile, sha256 } from "./storage";
import { effectiveFields } from "./validation";

/** Which compliance items an actor may see. */
export function complianceScope(actor: Actor) {
  if (actor.role === "APPLICANT") return { institutionId: actor.institutionId ?? "__none__" };
  if (actor.role === "SCRUTINY_OFFICER" && actor.regionId) return { institution: { regionId: actor.regionId } };
  return {};
}

async function getAccessibleItem(actor: Actor, itemId: string) {
  const item = await prisma.complianceItem.findUnique({ where: { id: itemId }, include: { institution: { select: { id: true, name: true, regionId: true } } } });
  if (!item) throw new NotFoundError();
  if (actor.role === "APPLICANT" && item.institutionId !== actor.institutionId) throw new NotFoundError();
  if (actor.role === "SCRUTINY_OFFICER" && actor.regionId && item.institution.regionId !== actor.regionId) throw new NotFoundError();
  return item;
}

function parseDate(s: string, label: string): Date {
  const d = new Date(`${s}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime())) throw new DomainError(`${label} must be a valid date.`);
  return d;
}

const UndertakingSchema = z.object({
  institutionId: z.string().min(1),
  applicationId: z.string().optional().nullable(),
  typeCode: z.string().refine((c) => c in UNDERTAKING_TYPES, "Unknown undertaking type"),
  title: z.string().trim().min(5).max(200),
  description: z.string().trim().min(5).max(2000),
  dueDate: z.string(),
});

export async function createUndertakingTx(tx: Tx, actor: Actor, input: z.input<typeof UndertakingSchema>) {
  const data = UndertakingSchema.parse(input);
  const due = parseDate(data.dueDate, "Due date");
  const item = await tx.complianceItem.create({ data: { institutionId: data.institutionId, applicationId: data.applicationId ?? null, kind: "UNDERTAKING", typeCode: data.typeCode, title: data.title, description: data.description, dueDate: due, createdById: actor.userId, createdByName: actor.name } });
  await recordAudit({ actor, eventType: "COMPLIANCE_ITEM_CREATED", action: `Time-bound undertaking recorded: ${data.title}`, applicationId: data.applicationId ?? null, after: { itemId: item.id, type: data.typeCode, dueDate: data.dueDate } }, tx);
  await notifyInstitution(data.institutionId, { type: "UNDERTAKING_CREATED", title: "New time-bound undertaking", body: `${data.title} — due ${data.dueDate}. Submit the supporting evidence online before the due date.`, link: "/compliance-monitor", severity: "MEDIUM" }, tx);
  return item;
}

export async function createUndertaking(actor: Actor, input: z.input<typeof UndertakingSchema>) {
  assertPermission(actor, "compliance.manage");
  return prisma.$transaction((tx) => createUndertakingTx(tx, actor, input));
}

const DocumentSchema = z.object({
  institutionId: z.string().min(1),
  typeCode: z.string().refine((c) => c in DOCUMENT_VALIDITY_TYPES, "Unknown document type"),
  reference: z.string().trim().min(2).max(120),
  validUntil: z.string(),
  description: z.string().trim().max(2000).optional(),
});

/** Add a prescribed document (e.g. a lease deed) to an institution's validity register. */
export async function registerDocument(actor: Actor, input: z.input<typeof DocumentSchema>) {
  assertPermission(actor, "compliance.manage");
  const data = DocumentSchema.parse(input);
  const until = parseDate(data.validUntil, "Valid until");
  return prisma.$transaction(async (tx) => {
    const item = await tx.complianceItem.create({ data: { institutionId: data.institutionId, kind: "DOCUMENT_VALIDITY", typeCode: data.typeCode, title: complianceTypeLabel(data.typeCode), description: data.description || "Prescribed document whose validity must be maintained.", reference: data.reference, dueDate: until, createdById: actor.userId, createdByName: actor.name } });
    await recordAudit({ actor, eventType: "COMPLIANCE_ITEM_CREATED", action: `Document validity tracked: ${complianceTypeLabel(data.typeCode)} ${data.reference}`, after: { itemId: item.id, validUntil: data.validUntil } }, tx);
    return item;
  });
}

/** Document categories whose expiry date is tracked once an application is decided. */
const TRACKED_CATEGORIES: Record<string, string> = { NOC_PERMISSION: "FIRE_NOC", ACCREDITATION: "ACCREDITATION" };

/**
 * When an application is decided, track the validity of its prescribed documents from the
 * expiry dates already extracted (and, where corrected, confirmed by a reviewer).
 */
export async function registerDocumentsFromApplication(tx: Tx, applicationId: string, actor: Actor | null) {
  const app = await tx.application.findUniqueOrThrow({ where: { id: applicationId }, select: { institutionId: true, reference: true } });
  const docs = await tx.document.findMany({
    where: { applicationId, state: "ACTIVE", categoryCode: { in: Object.keys(TRACKED_CATEGORIES) } },
    include: { versions: { where: { isCurrent: true }, include: { fields: true } } },
  });
  let created = 0;
  for (const d of docs) {
    const v = d.versions[0];
    if (!v) continue;
    const f = effectiveFields(v.fields);
    const expiry = f.expiryDate?.normalized;
    if (!expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) continue;
    const typeCode = TRACKED_CATEGORIES[d.categoryCode];
    const reference = f.referenceNumber?.normalized ?? f.referenceNumber?.value ?? null;
    const exists = await tx.complianceItem.findFirst({ where: { institutionId: app.institutionId, kind: "DOCUMENT_VALIDITY", typeCode, reference: reference ?? undefined, status: { in: ["OPEN", "SUBMITTED"] } } });
    if (exists) continue;
    await tx.complianceItem.create({ data: { institutionId: app.institutionId, applicationId, kind: "DOCUMENT_VALIDITY", typeCode, title: complianceTypeLabel(typeCode), description: `Tracked from ${v.originalName} submitted with ${app.reference}.`, reference, dueDate: new Date(`${expiry}T00:00:00Z`), createdById: actor?.userId ?? null, createdByName: actor?.name ?? "system:workflow-engine" } });
    created++;
  }
  if (created) await recordAudit({ actor: actor ?? { label: "system:workflow-engine", role: "SYSTEM" }, eventType: "COMPLIANCE_ITEM_CREATED", action: `${created} document validity record(s) now tracked from the application's evidence`, applicationId }, tx);
  return created;
}

export async function listComplianceItems(actor: Actor, filters: { kind?: string; state?: string; institutionId?: string } = {}) {
  const now = new Date();
  const items = await prisma.complianceItem.findMany({
    where: {
      ...complianceScope(actor),
      ...(filters.kind ? { kind: filters.kind as "UNDERTAKING" | "DOCUMENT_VALIDITY" } : {}),
      ...(filters.institutionId ? { institutionId: filters.institutionId } : {}),
    },
    orderBy: { dueDate: "asc" },
    include: {
      institution: { select: { id: true, name: true, code: true, region: { select: { name: true, code: true } } } },
      application: { select: { id: true, reference: true } },
      submissions: { orderBy: { submittedAt: "desc" } },
    },
  });
  return items.filter((i) => {
    if (!filters.state) return true;
    const overdue = i.status === "OPEN" && i.dueDate < now;
    if (filters.state === "overdue") return overdue;
    if (filters.state === "awaiting") return i.status === "SUBMITTED";
    if (filters.state === "open") return i.status === "OPEN";
    if (filters.state === "closed") return i.status === "FULFILLED" || i.status === "WAIVED";
    return true;
  });
}

export async function getComplianceItem(actor: Actor, itemId: string) {
  await getAccessibleItem(actor, itemId);
  return prisma.complianceItem.findUniqueOrThrow({
    where: { id: itemId },
    include: { institution: { include: { region: true } }, application: { select: { id: true, reference: true } }, submissions: { orderBy: { submittedAt: "desc" } } },
  });
}

export interface EvidenceInput { fileName: string; mimeType: string; buffer: Buffer; note: string; newValidUntil?: string; newReference?: string }

/** Institution uploads evidence for an undertaking, or a renewed document. */
export async function submitEvidence(actor: Actor, itemId: string, input: EvidenceInput) {
  assertPermission(actor, "compliance.submit");
  const item = await getAccessibleItem(actor, itemId);
  if (item.status !== "OPEN") throw new DomainError(item.status === "SUBMITTED" ? "Evidence is already awaiting verification." : "This item is closed.");
  const note = input.note.trim();
  if (note.length < 5) throw new DomainError("Add a short note (at least 5 characters) describing the evidence.");
  let newValidUntil: Date | null = null;
  if (item.kind === "DOCUMENT_VALIDITY") {
    if (!input.newValidUntil) throw new DomainError("Enter the validity date of the renewed document.");
    newValidUntil = parseDate(input.newValidUntil, "New validity date");
    if (newValidUntil <= item.dueDate) throw new DomainError("The renewed document must be valid beyond the current expiry date.");
  }
  const settings = await getSettings();
  const check = checkUpload({ fileName: input.fileName, declaredMime: input.mimeType, buffer: input.buffer, maxBytes: settings.maxUploadMb * 1048576 });
  if (!check.ok) throw new DomainError(check.error);
  const key = await saveFile(input.buffer);
  return prisma.$transaction(async (tx) => {
    const sub = await tx.complianceSubmission.create({ data: { itemId, fileName: check.safeName, mimeType: check.mimeType, sizeBytes: input.buffer.length, sha256: sha256(input.buffer), storageKey: key, note, newValidUntil, newReference: input.newReference?.trim() || null, submittedById: actor.userId, submittedByName: actor.name } });
    await tx.complianceItem.update({ where: { id: itemId }, data: { status: "SUBMITTED" } });
    await recordAudit({ actor, eventType: "COMPLIANCE_EVIDENCE_SUBMITTED", action: `${item.kind === "UNDERTAKING" ? "Undertaking evidence" : "Renewed document"} submitted: ${item.title}`, applicationId: item.applicationId, after: { itemId, submissionId: sub.id, file: check.safeName, sha256: sub.sha256, newValidUntil: input.newValidUntil ?? null } }, tx);
    await notifyStaff(["SCRUTINY_OFFICER", "BUREAU_OFFICER"], item.institution.regionId, { type: "COMPLIANCE_SUBMITTED", title: `Compliance evidence to verify: ${item.institution.name}`, body: `${item.title}${item.reference ? ` (${item.reference})` : ""}: ${note}`, link: `/compliance-monitor/${itemId}`, severity: "MEDIUM" }, tx);
    return sub;
  });
}

/** An authorised official accepts or returns submitted evidence, with remarks. */
export async function reviewSubmission(actor: Actor, submissionId: string, accept: boolean, remarks: string) {
  assertPermission(actor, "compliance.verify");
  const sub = await prisma.complianceSubmission.findUnique({ where: { id: submissionId } });
  if (!sub) throw new NotFoundError();
  const item = await getAccessibleItem(actor, sub.itemId);
  if (sub.review !== "PENDING") throw new DomainError("This submission has already been reviewed.");
  const r = remarks.trim();
  if (r.length < 5) throw new DomainError("Remarks of at least 5 characters are required.");
  await prisma.$transaction(async (tx) => {
    await tx.complianceSubmission.update({ where: { id: submissionId }, data: { review: accept ? "ACCEPTED" : "RETURNED", reviewerId: actor.userId, reviewerName: actor.name, reviewRemarks: r, reviewedAt: new Date() } });
    if (!accept) {
      await tx.complianceItem.update({ where: { id: item.id }, data: { status: "OPEN" } });
    } else if (item.kind === "UNDERTAKING") {
      await tx.complianceItem.update({ where: { id: item.id }, data: { status: "FULFILLED", closedAt: new Date(), closedNote: r } });
    } else {
      // A verified renewal starts a new validity period; reminders restart from the new date.
      await tx.complianceItem.update({ where: { id: item.id }, data: { status: "OPEN", dueDate: sub.newValidUntil ?? item.dueDate, reference: sub.newReference ?? item.reference, escalationLevel: 0 } });
    }
    await recordAudit({ actor, eventType: accept ? "COMPLIANCE_EVIDENCE_VERIFIED" : "COMPLIANCE_EVIDENCE_RETURNED", action: `${accept ? "Verified" : "Returned"} evidence for ${item.title} (${item.institution.name})`, applicationId: item.applicationId, reason: r, after: { itemId: item.id, submissionId, newValidUntil: accept ? sub.newValidUntil : null } }, tx);
    await notifyInstitution(item.institutionId, {
      type: accept ? "COMPLIANCE_VERIFIED" : "COMPLIANCE_RETURNED",
      title: accept ? `Verified: ${item.title}` : `Evidence returned: ${item.title}`,
      body: accept ? (item.kind === "UNDERTAKING" ? `The undertaking is recorded as fulfilled. ${r}` : `Renewed document accepted; now valid until ${sub.newValidUntil?.toISOString().slice(0, 10)}.`) : `Please resubmit. Reason: ${r}`,
      link: `/compliance-monitor/${item.id}`,
      severity: accept ? "LOW" : "HIGH",
    }, tx);
  });
}

export async function waiveItem(actor: Actor, itemId: string, reason: string) {
  assertPermission(actor, "compliance.manage");
  const item = await getAccessibleItem(actor, itemId);
  const r = reason.trim();
  if (r.length < 10) throw new DomainError("A reason of at least 10 characters is required to waive an item.");
  if (item.status === "FULFILLED" || item.status === "WAIVED") throw new DomainError("This item is already closed.");
  await prisma.$transaction(async (tx) => {
    await tx.complianceItem.update({ where: { id: itemId }, data: { status: "WAIVED", closedAt: new Date(), closedNote: r } });
    await recordAudit({ actor, eventType: "COMPLIANCE_ITEM_WAIVED", action: `Waived: ${item.title} (${item.institution.name})`, applicationId: item.applicationId, reason: r, after: { itemId } }, tx);
  });
}

export async function readSubmissionFile(actor: Actor, submissionId: string) {
  const sub = await prisma.complianceSubmission.findUnique({ where: { id: submissionId } });
  if (!sub) throw new NotFoundError();
  await getAccessibleItem(actor, sub.itemId);
  if (!(actor.role === "APPLICANT" || hasPermission(actor.role, "compliance.verify") || hasPermission(actor.role, "compliance.manage") || hasPermission(actor.role, "workflow.monitor"))) throw new NotFoundError();
  return { sub, buffer: await readFile(sub.storageKey) };
}
