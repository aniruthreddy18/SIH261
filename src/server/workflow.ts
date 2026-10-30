// Layer 4 — human review workflow: rectification requests and submissions, forwarding for
// authorised review, and recorded human review outcomes. Every action requires a reason and
// produces a ReviewAction and an audit event.
import { assertPermission, DomainError, type Actor } from "@/lib/auth/permissions";
import { ACTIVE_FINDING_STATUSES, type ApplicationStatus, VERIFICATION_STATUS_LABELS } from "@/lib/domain";
import { DECISION_OUTCOMES, type DecisionOutcome } from "@/lib/findings";
import { prisma } from "./db";
import { recordAudit } from "./audit";
import { getAccessibleApplication, transitionStatus } from "./applications";
import { notifyInstitution, notifyStaff } from "./notifications";
import { advanceToNextStage, afterValidation, completeStage, markReturned, revertStage, stagesOf } from "./stage-engine";
import { createUndertakingTx, registerDocumentsFromApplication } from "./compliance-monitor";
import { OFF_STAGE, revertTargets, stageLabel, STAGE_LABELS, type StageCode } from "@/lib/workflow/stages";
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
  const allowed: ApplicationStatus[] = ["AUTO_FAILED", "REVIEW_REQUIRED", "AUTO_PASSED", "PROCESSING_FAILED", "IN_STAGE_REVIEW", "READY_FOR_AUTHORIZED_REVIEW"];
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
    await markReturned(tx, applicationId, { actor }, msg);
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
  await notifyStaff(["SCRUTINY_OFFICER"], app.institution.regionId, { type: "RECTIFICATION_SUBMITTED", title: `Corrections submitted and revalidated: ${app.reference}`, body: `${app.institutionName} — run #${result.runNumber}: ${result.clearedFindings} finding(s) cleared, status ${result.status.replace(/_/g, " ").toLowerCase()}.`, link: `/applications/${applicationId}?tab=validation`, severity: "MEDIUM" });
  return result;
}

/**
 * Complete scrutiny (or preliminary checks) and route the application to the next stage of its
 * pathway: the Expert Visit Committee, the SAC/SHC or the competent authority.
 */
export async function forwardForAuthorizedReview(actor: Actor, applicationId: string, reason: string) {
  assertPermission(actor, "application.forward");
  const r = requireReason(reason, 10);
  const app = await getAccessibleApplication(actor, applicationId);
  if (!["AUTO_PASSED", "REVIEW_REQUIRED"].includes(app.status)) throw new DomainError("Only applications whose automated checks passed or whose exceptions have been reviewed can be forwarded.");
  if (app.currentStage && !["SCRUTINY", "PRELIMINARY"].includes(app.currentStage)) throw new DomainError(`The application is at the ${stageLabel(app.currentStage)} stage, not at scrutiny.`);
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
  if (!app.currentStage) await afterValidation(applicationId); // legacy record: assign its pathway first
  await prisma.$transaction(async (tx) => {
    const next = await advanceToNextStage(tx, applicationId, { actor }, { outcome: "FORWARDED", remarks: r });
    const to = next ? STAGE_LABELS[next] : "closure";
    await tx.reviewAction.create({ data: { applicationId, actorId: actor.userId, actorName: actor.name, actorRole: actor.role, action: "FORWARD", outcome: next === "DECISION" ? "READY_FOR_AUTHORIZED_REVIEW" : `FORWARDED_TO_${next}`, reason: r } });
    await recordAudit({ actor, eventType: "FORWARDED_FOR_AUTHORIZED_REVIEW", action: next === "DECISION" ? "Forwarded for authorised review" : `Scrutiny completed — forwarded to ${to}`, applicationId, reason: r, after: { nextStage: next } }, tx);
  });
}

/** The stage a forward from scrutiny leads to, for the button label. */
export function forwardTarget(app: { pathwayStagesJson: string | null; currentStage: string | null }): StageCode | null {
  const stages = stagesOf(app);
  const from = (app.currentStage as StageCode) ?? stages[0];
  const i = stages.indexOf(from);
  return i >= 0 && i + 1 < stages.length ? stages[i + 1] : null;
}

/**
 * Return the application to the institution for deficiencies observed outside the automated
 * findings (e.g. by the Expert Visit Committee or the competent authority). Reasons are recorded.
 */
export async function returnForDeficiencies(actor: Actor, applicationId: string, message: string, opts: { viaCommittee?: boolean } = {}) {
  if (!opts.viaCommittee) assertPermission(actor, "application.requestRectification");
  const msg = requireReason(message, 10);
  const app = await getAccessibleApplication(actor, applicationId);
  const allowed: ApplicationStatus[] = ["AUTO_FAILED", "REVIEW_REQUIRED", "AUTO_PASSED", "PROCESSING_FAILED", "IN_STAGE_REVIEW", "READY_FOR_AUTHORIZED_REVIEW"];
  if (!allowed.includes(app.status as ApplicationStatus)) throw new DomainError(`The application cannot be returned while it is ${app.status.replace(/_/g, " ").toLowerCase()}.`);
  const settings = await getSettings();
  const dueDate = new Date(Date.now() + settings.rectificationDueDays * 86_400_000);
  const stage = stageLabel(app.currentStage);
  await prisma.$transaction(async (tx) => {
    const req = await tx.rectificationRequest.create({ data: { applicationId, requestedById: actor.userId, requestedBy: actor.name, message: msg, findingIdsJson: "[]", dueDate } });
    await tx.reviewAction.create({ data: { applicationId, actorId: actor.userId, actorName: actor.name, actorRole: actor.role, action: "REQUEST_RECTIFICATION", outcome: `Returned from ${stage}`, reason: msg, reference: req.id } });
    await transitionStatus(tx, applicationId, "RECTIFICATION_REQUIRED", { actor, reason: msg });
    await markReturned(tx, applicationId, { actor }, msg);
    await recordAudit({ actor, eventType: "APPLICATION_RETURNED", action: `Returned to the institution from ${stage} for deficiencies`, applicationId, reason: msg, after: { dueDate } }, tx);
    await notifyInstitution(app.institutionId, { type: "RECTIFICATION_REQUESTED", title: "Deficiencies to correct", body: `${app.reference}: returned from the ${stage} stage. Correct the deficiencies by ${dueDate.toISOString().slice(0, 10)}.`, link: `/applications/${applicationId}?tab=rectification`, severity: "HIGH" }, tx);
  });
}

/** Revert an application to an earlier stage of its pathway for further verification. */
export async function revertToStage(actor: Actor, applicationId: string, target: string, reason: string) {
  assertPermission(actor, "workflow.revert");
  const r = requireReason(reason, 10);
  const app = await getAccessibleApplication(actor, applicationId);
  const targets = revertTargets(stagesOf(app), app.currentStage);
  if (!targets.includes(target as StageCode)) throw new DomainError(`The application cannot be reverted to ${stageLabel(target)} from ${stageLabel(app.currentStage)}.`);
  await prisma.$transaction(async (tx) => {
    await revertStage(tx, applicationId, target as StageCode, { actor }, r);
    await tx.reviewAction.create({ data: { applicationId, actorId: actor.userId, actorName: actor.name, actorRole: actor.role, action: "REVERT", outcome: `Reverted to ${stageLabel(target)}`, reason: r } });
  });
}

export interface DecisionUndertaking { typeCode: string; title: string; dueDate: string }

export async function recordDecision(actor: Actor, applicationId: string, outcome: DecisionOutcome, reason: string, reference: string, undertaking?: DecisionUndertaking | null) {
  assertPermission(actor, "application.decide");
  if (!(outcome in DECISION_OUTCOMES)) throw new DomainError("Unknown outcome.");
  const r = requireReason(reason, 10);
  const ref = reference.trim();
  if (ref.length < 3) throw new DomainError("A decision reference (e.g. file or minute number) is required.");
  const app = await getAccessibleApplication(actor, applicationId);
  if (app.status !== "READY_FOR_AUTHORIZED_REVIEW") throw new DomainError("A review outcome can only be recorded for applications ready for authorised review.");
  await prisma.$transaction(async (tx) => {
    await tx.reviewAction.create({ data: { applicationId, actorId: actor.userId, actorName: actor.name, actorRole: actor.role, action: "DECISION", outcome, reason: r, reference: ref } });
    if (app.currentStage === "DECISION") await completeStage(tx, applicationId, { actor }, { outcome, remarks: r, reference: ref });
    await tx.application.update({ where: { id: applicationId }, data: { currentStage: OFF_STAGE.CLOSED } });
    await transitionStatus(tx, applicationId, "CLOSED", { actor, reason: `Recorded human review outcome: ${DECISION_OUTCOMES[outcome]}` });
    // Approval-related monitoring: a time-bound condition becomes a tracked undertaking, and the
    // validity of prescribed documents (e.g. fire NOC, lease deed) is tracked from now on.
    if (undertaking) await createUndertakingTx(tx, actor, { institutionId: app.institutionId, applicationId, typeCode: undertaking.typeCode, title: undertaking.title, description: `Condition recorded with the review outcome (${ref}).`, dueDate: undertaking.dueDate });
    await registerDocumentsFromApplication(tx, applicationId, actor);
    await recordAudit({ actor, eventType: "HUMAN_DECISION_RECORDED", action: `Recorded human review outcome: ${DECISION_OUTCOMES[outcome]}`, applicationId, reason: r, after: { outcome, reference: ref, note: "Recorded human review action — not an automatically generated regulatory approval." } }, tx);
    await notifyInstitution(app.institutionId, { type: "DECISION_RECORDED", title: `Review outcome recorded: ${app.reference}`, body: DECISION_OUTCOMES[outcome], link: `/applications/${applicationId}?tab=review`, severity: "MEDIUM" }, tx);
  });
}
