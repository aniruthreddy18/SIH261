import { APPLICANT_EDITABLE_STATUSES, assertPermission, DomainError, NotFoundError, assertInstitutionAccess, type Actor } from "@/lib/auth/permissions";
import type { ApplicationStatus } from "@/lib/domain";
import { FIELD_BY_KEY, interpretValue } from "@/lib/extraction/fields";
import { runExtractionPipeline } from "@/lib/extraction/pipeline";
import { renderPdfPage } from "@/lib/extraction/pdf";
import { ProcessingError } from "@/lib/extraction/types";
import { checkUpload } from "@/lib/files/validate";
import { prisma, json } from "./db";
import { recordAudit, SYSTEM } from "./audit";
import { getAccessibleApplication } from "./applications";
import { notifyUsers } from "./notifications";
import { getSettings } from "./settings";
import { readCachedPreview, readFile, saveFile, sha256, writeCachedPreview } from "./storage";

const OFFICER_UPLOAD_BLOCKED: ApplicationStatus[] = ["PROCESSING", "READY_FOR_AUTHORIZED_REVIEW", "CLOSED"];

function assertCanChangeEvidence(actor: Actor, status: ApplicationStatus) {
  if (actor.role === "APPLICANT") {
    if (!APPLICANT_EDITABLE_STATUSES.includes(status)) throw new DomainError(`Documents cannot be changed while the application is ${status.replace(/_/g, " ").toLowerCase()}.`);
  } else if (OFFICER_UPLOAD_BLOCKED.includes(status)) {
    throw new DomainError(`Documents cannot be changed while the application is ${status.replace(/_/g, " ").toLowerCase()}.`);
  }
}

export interface UploadInput {
  applicationId: string;
  categoryCode: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  replaceDocumentId?: string | null;
  title?: string | null;
  /** Replacement reason (recorded in the audit trail). */
  reason?: string | null;
}

export async function uploadDocument(actor: Actor, input: UploadInput) {
  assertPermission(actor, "document.upload");
  const app = await getAccessibleApplication(actor, input.applicationId);
  assertCanChangeEvidence(actor, app.status as ApplicationStatus);
  const category = await prisma.documentCategory.findUnique({ where: { code: input.categoryCode } });
  if (!category) throw new DomainError("Unknown document category.");

  const settings = await getSettings();
  const check = checkUpload({ fileName: input.fileName, declaredMime: input.mimeType, buffer: input.buffer, maxBytes: settings.maxUploadMb * 1048576 });
  if (!check.ok) {
    await recordAudit({ actor, eventType: "DOCUMENT_UPLOAD_REJECTED", action: `Upload rejected: ${check.error}`, applicationId: app.id, after: { fileName: input.fileName.slice(0, 120), size: input.buffer.length } });
    throw new DomainError(check.error);
  }
  const hash = sha256(input.buffer);
  const storageKey = await saveFile(input.buffer);

  const version = await prisma.$transaction(async (tx) => {
    let documentId: string;
    let versionNo = 1;
    let previous: { id: string; sha256: string; originalName: string } | null = null;
    if (input.replaceDocumentId) {
      const doc = await tx.document.findFirst({ where: { id: input.replaceDocumentId, applicationId: app.id, state: "ACTIVE" }, include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } } });
      if (!doc) throw new NotFoundError("Document to replace was not found.");
      if (doc.categoryCode !== category.code) throw new DomainError("A replacement must be in the same document category.");
      const prev = doc.versions[0];
      previous = prev ? { id: prev.id, sha256: prev.sha256, originalName: prev.originalName } : null;
      versionNo = (prev?.versionNo ?? 0) + 1;
      await tx.documentVersion.updateMany({ where: { documentId: doc.id, isCurrent: true }, data: { isCurrent: false, supersededAt: new Date() } });
      documentId = doc.id;
      // A verification result belongs to the superseded file; it no longer covers the new version.
      await tx.finding.updateMany({
        where: { applicationId: app.id, documentId: doc.id, source: "VERIFICATION", status: { in: ["OPEN", "INFO_REQUESTED", "ESCALATED", "RECTIFICATION_REQUESTED"] } },
        data: { status: "AUTO_CLEARED", resolvedAt: new Date(), resolutionNote: `Superseded by document version ${versionNo}; issuer verification must be re-run for the new file.` },
      });
    } else {
      const doc = await tx.document.create({ data: { applicationId: app.id, categoryCode: category.code, title: input.title ?? null } });
      documentId = doc.id;
    }
    const v = await tx.documentVersion.create({
      data: { documentId, versionNo, isCurrent: true, storageKey, originalName: check.safeName, mimeType: check.mimeType, sizeBytes: input.buffer.length, sha256: hash, uploadedById: actor.userId },
    });
    await recordAudit(
      {
        actor,
        eventType: previous ? "DOCUMENT_REPLACED" : "DOCUMENT_UPLOADED",
        action: previous ? `Replaced ${category.name} with version ${versionNo} (“${check.safeName}”)` : `Uploaded ${category.name} (“${check.safeName}”)`,
        applicationId: app.id,
        documentId,
        before: previous ? { versionId: previous.id, file: previous.originalName, sha256: previous.sha256 } : undefined,
        after: { versionId: v.id, versionNo, file: check.safeName, sha256: hash, sizeBytes: input.buffer.length, mimeType: check.mimeType },
        reason: input.reason ?? null,
      },
      tx,
    );
    return v;
  });

  return processVersion(actor, version.id);
}

/** Run the extraction pipeline for a stored version and persist the results. */
export async function processVersion(actor: Actor, versionId: string) {
  const version = await prisma.documentVersion.findUniqueOrThrow({ where: { id: versionId }, include: { document: { include: { category: true } }, fields: true } });
  const applicationId = version.document.applicationId;
  await prisma.documentVersion.update({ where: { id: versionId }, data: { processingStatus: "PROCESSING", processingError: null } });
  const expected = json<string[]>(version.document.category.expectedFieldsJson, []);
  try {
    const buffer = await readFile(version.storageKey);
    const out = await runExtractionPipeline({ buffer, mimeType: version.mimeType, expectedFields: expected });
    // Preserve reviewer corrections across reprocessing.
    const corrections = new Map(version.fields.filter((f) => f.correctedValue !== null).map((f) => [f.key, f]));
    await prisma.$transaction(async (tx) => {
      await tx.extractedField.deleteMany({ where: { versionId } });
      for (const f of out.fields) {
        const c = corrections.get(f.key);
        await tx.extractedField.create({
          data: {
            versionId,
            key: f.key,
            label: f.label,
            value: f.value,
            normalizedValue: f.normalizedValue,
            confidence: f.confidence,
            page: f.page,
            excerpt: f.excerpt,
            bboxJson: f.bbox ? JSON.stringify(f.bbox) : null,
            method: f.method,
            correctedValue: c?.correctedValue ?? null,
            correctedById: c?.correctedById ?? null,
            correctedAt: c?.correctedAt ?? null,
            correctionReason: c?.correctionReason ?? null,
          },
        });
      }
      await tx.documentVersion.update({
        where: { id: versionId },
        data: {
          processingStatus: "PROCESSED",
          processedAt: new Date(),
          extractionMethod: out.method,
          pageCount: out.pageCount,
          ocrConfidence: out.ocrConfidence,
          pagesJson: JSON.stringify(out.pages),
          textContent: out.text.slice(0, 200_000),
          metadataJson: JSON.stringify(out.metadata),
          warningsJson: JSON.stringify(out.warnings),
        },
      });
      const found = out.fields.filter((f) => f.value !== null).length;
      await recordAudit(
        { actor: SYSTEM.extraction, eventType: "EXTRACTION_COMPLETED", action: `Extracted ${found} field(s) from ${out.pageCount} page(s) via ${out.method}`, applicationId, documentId: version.documentId, after: { versionId, method: out.method, pages: out.pageCount, fieldsFound: found, ocrConfidence: out.ocrConfidence, warnings: out.warnings.length }, correlationId: versionId },
        tx,
      );
    });
  } catch (err) {
    const message = err instanceof ProcessingError ? err.message : "An unexpected error occurred while processing the document. Retry processing; if it fails again, replace the file.";
    if (!(err instanceof ProcessingError)) console.error("[extraction] unexpected failure", (err as Error)?.message);
    await prisma.documentVersion.update({ where: { id: versionId }, data: { processingStatus: "FAILED", processingError: message, processedAt: new Date() } });
    await recordAudit({ actor: SYSTEM.extraction, eventType: "EXTRACTION_FAILED", action: "Document processing failed", applicationId, documentId: version.documentId, reason: message, after: { versionId }, correlationId: versionId });
    await notifyUsers([version.uploadedById], { type: "PROCESSING_FAILED", title: "Document processing failed", body: `${version.document.category.name}: ${message}`, link: `/documents/${version.documentId}`, severity: "MEDIUM" });
  }
  return prisma.documentVersion.findUniqueOrThrow({ where: { id: versionId }, include: { fields: true } });
}

export async function reprocessDocument(actor: Actor, documentId: string) {
  assertPermission(actor, "document.reprocess");
  const doc = await getAccessibleDocument(actor, documentId);
  const current = doc.versions.find((v) => v.isCurrent);
  if (!current) throw new DomainError("No current version to reprocess.");
  if (current.processingStatus === "PROCESSING") throw new DomainError("This document is already being processed.");
  return processVersion(actor, current.id);
}

export async function withdrawDocument(actor: Actor, documentId: string, reason: string) {
  assertPermission(actor, "document.upload");
  if (reason.trim().length < 5) throw new DomainError("A reason of at least 5 characters is required.");
  const doc = await getAccessibleDocument(actor, documentId);
  const status = doc.application.status as ApplicationStatus;
  if (!["DRAFT", "RECTIFICATION_REQUIRED"].includes(status)) {
    throw new DomainError("Documents can only be withdrawn while the application is a draft or under rectification. Use Replace instead.");
  }
  if (doc.state !== "ACTIVE") throw new DomainError("Document already withdrawn.");
  await prisma.$transaction(async (tx) => {
    await tx.document.update({ where: { id: documentId }, data: { state: "WITHDRAWN", withdrawnAt: new Date(), withdrawnReason: reason.trim() } });
    await recordAudit({ actor, eventType: "DOCUMENT_WITHDRAWN", action: `Withdrew ${doc.category.name}. File retained under the retention policy.`, applicationId: doc.applicationId, documentId, reason: reason.trim() }, tx);
  });
}

export async function correctField(actor: Actor, fieldId: string, value: string, reason: string) {
  assertPermission(actor, "document.correctField");
  const trimmed = value.trim();
  if (reason.trim().length < 5) throw new DomainError("A reason of at least 5 characters is required.");
  if (trimmed.length > 300) throw new DomainError("Value too long.");
  const field = await prisma.extractedField.findUnique({ where: { id: fieldId }, include: { version: { include: { document: { include: { application: true } } } } } });
  if (!field) throw new NotFoundError();
  assertInstitutionAccess(actor, field.version.document.application.institutionId);
  if (!field.version.isCurrent) throw new DomainError("Only fields of the current document version can be corrected.");
  const def = FIELD_BY_KEY.get(field.key);
  if (def && trimmed && ["date", "integer", "academicYear"].includes(def.type)) {
    const parsed = interpretValue(def.type, trimmed);
    if (!parsed?.normalized) throw new DomainError(`"${trimmed}" is not a valid ${def.type === "date" ? "date (use DD/MM/YYYY)" : def.type}.`);
  }
  const before = { machineValue: field.value, previousCorrection: field.correctedValue };
  return prisma.$transaction(async (tx) => {
    await tx.extractedField.update({ where: { id: fieldId }, data: { correctedValue: trimmed || null, correctedById: actor.userId, correctedAt: new Date(), correctionReason: reason.trim() } });
    const confirmsAi = field.method.startsWith("AI_") && trimmed !== "" && trimmed === field.value;
    await recordAudit({ actor, eventType: "FIELD_CORRECTED", action: confirmsAi ? `Confirmed AI suggestion for ${field.label}` : `Corrected ${field.label}`, applicationId: field.version.document.applicationId, documentId: field.version.documentId, before, after: { correctedValue: trimmed || null }, reason: reason.trim() }, tx);
    return { confirmedAi: confirmsAi };
  });
}

export async function getAccessibleDocument(actor: Actor, documentId: string) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { application: { include: { institution: true } }, category: true, versions: { orderBy: { versionNo: "desc" }, include: { fields: { orderBy: { key: "asc" } } } } },
  });
  if (!doc) throw new NotFoundError();
  assertInstitutionAccess(actor, doc.application.institutionId);
  return doc;
}

async function getAccessibleVersion(actor: Actor, versionId: string) {
  const v = await prisma.documentVersion.findUnique({ where: { id: versionId }, include: { document: { include: { application: true } } } });
  if (!v) throw new NotFoundError();
  assertInstitutionAccess(actor, v.document.application.institutionId);
  return v;
}

export async function getVersionFile(actor: Actor, versionId: string) {
  const v = await getAccessibleVersion(actor, versionId);
  return { buffer: await readFile(v.storageKey), mimeType: v.mimeType, fileName: v.originalName };
}

/** PNG preview of a page. PDFs are rasterised server-side so no active PDF content reaches the browser. */
export async function getVersionPreview(actor: Actor, versionId: string, page: number) {
  const v = await getAccessibleVersion(actor, versionId);
  if (v.mimeType !== "application/pdf") return { buffer: await readFile(v.storageKey), mimeType: v.mimeType };
  const pageNo = Math.max(1, Math.min(Math.trunc(page) || 1, v.pageCount ?? 1));
  const cached = await readCachedPreview(v.storageKey, pageNo);
  if (cached) return { buffer: cached, mimeType: "image/png" };
  const png = await renderPdfPage(await readFile(v.storageKey), pageNo, 1.5);
  await writeCachedPreview(v.storageKey, pageNo, png);
  return { buffer: png, mimeType: "image/png" };
}

export async function listDocuments(actor: Actor, filters: { status?: string; category?: string; q?: string } = {}) {
  const scope = actor.role === "APPLICANT" ? { application: { institutionId: actor.institutionId ?? "__none__" } } : {};
  return prisma.documentVersion.findMany({
    where: {
      isCurrent: true,
      document: { ...scope, state: "ACTIVE", ...(filters.category ? { categoryCode: filters.category } : {}) },
      ...(filters.status ? { processingStatus: filters.status as "PROCESSED" } : {}),
      ...(filters.q ? { OR: [{ originalName: { contains: filters.q } }, { document: { application: { reference: { contains: filters.q } } } }, { document: { application: { institutionName: { contains: filters.q } } } }] } : {}),
    },
    orderBy: { uploadedAt: "desc" },
    take: 200,
    include: { document: { include: { category: true, application: { select: { id: true, reference: true, institutionName: true } } } }, fields: { select: { confidence: true, value: true, correctedValue: true } } },
  });
}
