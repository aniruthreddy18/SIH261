"use server";
// Server actions are thin: authenticate, delegate to a service (which enforces permissions and
// business rules), revalidate, and return a safe result. Actions used by <ActionDialog> take a
// `values` object as their last argument; leading arguments are bound on the server.
import { runAction } from "@/server/actions-util";
import { createApplication, type CreateApplicationInput } from "@/server/applications";
import { correctField, reprocessDocument, withdrawDocument } from "@/server/documents";
import { reviewFinding, type ReviewActionKind } from "@/server/findings";
import { runValidation } from "@/server/validation";
import { recordManualVerification, runVerification } from "@/server/verification";
import { forwardForAuthorizedReview, recordDecision, requestRectification, submitRectification } from "@/server/workflow";
import { addComplianceNote } from "@/server/compliance";
import type { DecisionOutcome } from "@/lib/findings";
import { VERIFICATION_STATUS_LABELS, type Role } from "@/lib/domain";

type Values = Record<string, string>;

export async function createApplicationAction(input: CreateApplicationInput) {
  return runAction((a) => createApplication(a, input).then((app) => ({ id: app.id, reference: app.reference })), { success: (r) => `Application ${r.reference} created` });
}

export async function runValidationAction(applicationId: string) {
  return runAction((a) => runValidation(a, applicationId, "MANUAL"), {
    success: (r) => `Validation run #${r.runNumber} completed: ${r.summary.pass} passed, ${r.summary.fail} failed, ${r.summary.review} need review. Status: ${r.status.replace(/_/g, " ").toLowerCase()}.`,
  });
}

export async function runVerificationAction(applicationId: string, documentId?: string) {
  return runAction((a) => runVerification(a, applicationId, documentId), {
    success: (r) => (r.length ? `Verification attempted for ${r.length} document(s): ${r.map((x) => VERIFICATION_STATUS_LABELS[x.status]).join(", ")}` : "No documents require issuer verification."),
  });
}

export async function manualVerificationAction(documentId: string, v: Values) {
  return runAction((a) => recordManualVerification(a, documentId, v.outcome === "MISMATCH_DETECTED" ? "MISMATCH_DETECTED" : "VERIFIED", v.reason ?? "", v.reference ?? ""), { success: "Manual verification recorded" });
}

export async function reviewFindingAction(findingId: string, kind: ReviewActionKind, v: Values) {
  return runAction((a) => reviewFinding(a, findingId, kind, v.reason ?? "", { escalateTo: v.escalateTo as Role | undefined }), { success: "Review action recorded", revalidate: ["/", "/applications", "/review"] });
}

export async function requestRectificationAction(applicationId: string, findingIds: string[], message: string) {
  return runAction((a) => requestRectification(a, applicationId, findingIds, message), { success: "Application returned for rectification" });
}

export async function submitRectificationAction(applicationId: string, v: Values) {
  return runAction((a) => submitRectification(a, applicationId, v.note ?? ""), { success: (r) => `Corrections submitted. Revalidation run #${r.runNumber}: ${r.clearedFindings} finding(s) cleared, ${r.newFindings} new. Status: ${r.status.replace(/_/g, " ").toLowerCase()}.` });
}

export async function forwardAction(applicationId: string, v: Values) {
  return runAction((a) => forwardForAuthorizedReview(a, applicationId, v.reason ?? ""), { success: "Forwarded for authorised review" });
}

export async function decisionAction(applicationId: string, v: Values) {
  return runAction((a) => recordDecision(a, applicationId, v.outcome as DecisionOutcome, v.reason ?? "", v.reference ?? ""), { success: "Human review outcome recorded" });
}

export async function correctFieldAction(fieldId: string, v: Values) {
  return runAction((a) => correctField(a, fieldId, v.value ?? "", v.reason ?? ""), { success: "Correction recorded (machine value retained). Rerun validation to apply it.", revalidate: ["/documents", "/applications"] });
}

export async function reprocessAction(documentId: string) {
  return runAction((a) => reprocessDocument(a, documentId).then((x) => x.processingStatus), { success: (s) => (s === "PROCESSED" ? "Document reprocessed" : "Reprocessing finished with errors — see the document for details"), revalidate: ["/documents", "/applications"] });
}

export async function withdrawDocumentAction(documentId: string, v: Values) {
  return runAction((a) => withdrawDocument(a, documentId, v.reason ?? ""), { success: "Document withdrawn (file retained for audit)" });
}

export async function complianceNoteAction(applicationId: string, requirementCode: string, v: Values) {
  return runAction((a) => addComplianceNote(a, applicationId, requirementCode, v.note ?? ""), { success: "Compliance note added", revalidate: ["/compliance", "/applications"] });
}
