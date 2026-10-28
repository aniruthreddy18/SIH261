// Layer 4 — human review workflow: rectification requests and submissions, forwarding for
// authorised review, and recorded human review outcomes. Every action requires a reason and
// produces a ReviewAction and an audit event.
import { assertPermission, DomainError, type Actor } from "@/lib/auth/permissions";
import { ACTIVE_FINDING_STATUSES, type ApplicationStatus, VERIFICATION_STATUS_LABELS } from "@/lib/domain";
import { DECISION_OUTCOMES, type DecisionOutcome } from "@/lib/findings";
import { prisma } from "./db";
import { recordAudit } from "./audit";
import { getAccessibleApplication, transitionStatus } from "./applications";
import { notifyInstitution, notifyRoles } from "./notifications";
import { getSettings } from "./settings";
import { runValidation, type RunResult } from "./validation";
import { verificationCoverage } from "./verification";

function requireReason(reason: string, min = 5) {
  const r = reason.trim();
  if (r.length < min) throw new DomainError(`A reason of at least ${min} characters is required.`);
  if (r.length > 4000) throw new DomainError("Text is too long.");
  return r;
}

export async function requestRectification(actor: Actor, applicationId: string, findingIds: string[], message: string) {
  assertPermission(actor, "application.requestRectification");
  const msg = requireReason(message, 10);
  const app = await getAccessibleApplication(actor, applicationId);
  const allowed: ApplicationStatus[] = ["AUTO_FAILED", "REVIEW_REQUIRED", "AUTO_PASSED", "PROCESSING_FAILED", "READY_FOR_AUTHORIZED_REVIEW"];
  if (!allowed.includes(app.status as ApplicationStatus)) throw new DomainError(`Rectification cannot be requested while the application is ${app.status.replace(/_/g, " ").toLowerCase()}.`);
  const findings = await prisma.finding.findMany({ where: { id: { in: findingIds }, applicationId, status: { in: ACTIVE_FINDING_STATUSES } } });
  if (findings.length === 0) throw new DomainError("Select at least one open finding for the institution to rectify.");
  const settings = await getSettings();
  const dueDate = new Date(Date.now() + settings.rectificationDueDays * 86_400_000);
  await prisma.$transaction(async (tx) => {
    const req = await tx.rectificationRequest.create({ data: { applicationId, requestedById: actor.userId, requestedBy: actor.name, message: msg, findingIdsJson: JSON.stringify(findings.map((f) => f.id)), dueDate } });
    await tx.finding.updateMany({ where: { id: { in: findings.map((f) => f.id) } }, data: { status: "RECTIFICATION_REQUESTED" } });
    await tx.reviewAction.create({ data: { applicationId, actorId: actor.userId, actorName: actor.name, actorRole: actor.role, action: "REQUEST_RECTIFICATION", outcome: `${findings.length} finding(s)`, reason: msg, reference: req.id } });
    await transitionStatus(tx, applicationId, "RECTIFICATION_REQUIRED", { actor, reason: msg });
    await recordAudit({ actor, eventType: "RECTIFICATION_REQUESTED", action: `Rectification requested for ${findings.length} finding(s)`, applicationId, reason: msg, after: { findings: findings.map((f) => f.title), dueDate } }, tx);
    await notifyInstitution(app.institutionId, { type: "RECTIFICATION_REQUESTED", title: "Rectification requested", body: `${app.reference}: ${findings.length} deficiency(ies) to correct by ${dueDate.toISOString().slice(0, 10)}.`, link: `/applications/${applicationId}?tab=rectification`, severity: "HIGH" }, tx);
  });
}

/**
 * Institution submits its corrections. Changed documents were already reprocessed on upload;
 * submission re-runs validation and returns the comparison with the previous run.
 */
export async function submitRectification(actor: Actor, applicationId: string, responseNote: string): Promise<RunResult> {
  assertPermission(actor, "application.submitRectification");
  const note = requireReason(responseNote, 5);
  const app = await getAccessibleApplication(actor, applicationId);
  if (app.status !== "RECTIFICATION_REQUIRED") throw new DomainError("There is no open rectification request for this application.");
  const req = await prisma.rectificationRequest.findFirst({ where: { applicationId, status: "OPEN" }, orderBy: { createdAt: "desc" } });
  if (!req) throw new DomainError("There is no open rectification request for this application.");
  const changed = await prisma.documentVersion.count({ where: { document: { applicationId }, uploadedAt: { gt: req.createdAt } } });
  await prisma.$transaction(async (tx) => {
    await tx.rectificationRequest.update({ where: { id: req.id }, data: { status: "SUBMITTED", submittedAt: new Date(), submittedById: actor.userId, responseNote: note } });
    await tx.reviewAction.create({ data: { applicationId, actorId: actor.userId, actorName: actor.name, actorRole: actor.role, action: "SUBMIT_RECTIFICATION", outcome: `${changed} document version(s) changed`, reason: note, reference: req.id } });
    await recordAudit({ actor, eventType: "RECTIFICATION_SUBMITTED", action: `Rectification submitted (${changed} new document version(s))`, applicationId, reason: note }, tx);
  });
  const result = await runValidation(actor, applicationId, "RECTIFICATION");
  await notifyRoles(["SCRUTINY_OFFICER"], { type: "RECTIFICATION_SUBMITTED", title: `Corrections submitted and revalidated: ${app.reference}`, body: `${app.institutionName} — run #${result.runNumber}: ${result.clearedFindings} finding(s) cleared, status ${result.status.replace(/_/g, " ").toLowerCase()}.`, link: `/applications/${applicationId}?tab=validation`, severity: "MEDIUM" });
  return result;
}

export async function forwardForAuthorizedReview(actor: Actor, applicationId: string, reason: string) {
  assertPermission(actor, "application.forward");
  const r = requireReason(reason, 10);
  const app = await getAccessibleApplication(actor, applicationId);
  if (!["AUTO_PASSED", "REVIEW_REQUIRED"].includes(app.status)) throw new DomainError("Only applications whose automated checks passed or whose exceptions have been reviewed can be forwarded.");
  const open = await prisma.finding.count({ where: { applicationId, status: { in: ACTIVE_FINDING_STATUSES } } });
  if (open > 0) throw new DomainError(`${open} finding(s) are still open. Resolve, dismiss or return them for rectification first.`);
  const coverage = await verificationCoverage(applicationId);
  const missing = coverage.filter((c) => !c.covered);
  if (missing.length) {
    const detail = missing.map((m) => `${m.categoryName} (${m.latestStatus ? VERIFICATION_STATUS_LABELS[m.latestStatus].toLowerCase() : "not run yet"})`).join(", ");
    throw new DomainError(`Issuer verification is incomplete for: ${detail}. Resolving a finding does not verify a document: on the Issuer verification tab, run verification again or record a manual confirmation with a reference — or return the application for rectification.`);
  }
  const lastRun = await prisma.validationRun.findFirst({ where: { applicationId, status: "COMPLETED" }, orderBy: { runNumber: "desc" } });
  const changedSince = lastRun ? await prisma.documentVersion.count({ where: { document: { applicationId, state: "ACTIVE" }, isCurrent: true, uploadedAt: { gt: lastRun.startedAt } } }) : 1;
  if (changedSince > 0) throw new DomainError("Evidence has changed since the last validation run. Rerun validation before forwarding.");
  await prisma.$transaction(async (tx) => {
    await tx.reviewAction.create({ data: { applicationId, actorId: actor.userId, actorName: actor.name, actorRole: actor.role, action: "FORWARD", outcome: "READY_FOR_AUTHORIZED_REVIEW", reason: r } });
    await transitionStatus(tx, applicationId, "READY_FOR_AUTHORIZED_REVIEW", { actor, reason: r });
    await recordAudit({ actor, eventType: "FORWARDED_FOR_AUTHORIZED_REVIEW", action: "Forwarded for authorised review", applicationId, reason: r }, tx);
    await notifyRoles(["SENIOR_OFFICIAL"], { type: "READY_FOR_REVIEW", title: `Ready for authorised review: ${app.reference}`, body: app.institutionName, link: `/applications/${applicationId}?tab=review`, severity: "MEDIUM" }, tx);
  });
}

export async function recordDecision(actor: Actor, applicationId: string, outcome: DecisionOutcome, reason: string, reference: string) {
  assertPermission(actor, "application.decide");
  if (!(outcome in DECISION_OUTCOMES)) throw new DomainError("Unknown outcome.");
  const r = requireReason(reason, 10);
  const ref = reference.trim();
  if (ref.length < 3) throw new DomainError("A decision reference (e.g. file or minute number) is required.");
  const app = await getAccessibleApplication(actor, applicationId);
  if (app.status !== "READY_FOR_AUTHORIZED_REVIEW") throw new DomainError("A review outcome can only be recorded for applications ready for authorised review.");
  await prisma.$transaction(async (tx) => {
    await tx.reviewAction.create({ data: { applicationId, actorId: actor.userId, actorName: actor.name, actorRole: actor.role, action: "DECISION", outcome, reason: r, reference: ref } });
    await transitionStatus(tx, applicationId, "CLOSED", { actor, reason: `Recorded human review outcome: ${DECISION_OUTCOMES[outcome]}` });
    await recordAudit({ actor, eventType: "HUMAN_DECISION_RECORDED", action: `Recorded human review outcome: ${DECISION_OUTCOMES[outcome]}`, applicationId, reason: r, after: { outcome, reference: ref, note: "Recorded human review action — not an automatically generated regulatory approval." } }, tx);
    await notifyInstitution(app.institutionId, { type: "DECISION_RECORDED", title: `Review outcome recorded: ${app.reference}`, body: DECISION_OUTCOMES[outcome], link: `/applications/${applicationId}?tab=review`, severity: "MEDIUM" }, tx);
  });
}
