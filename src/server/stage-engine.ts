// Layer 5 — approval workflow engine (PS 26262). Assigns each application a processing
// pathway from its type, opens stage visits with timelines, moves an application to the next
// prescribed stage when the current one is completed by an authorised action, and records
// returns and reverts. Every movement is audited; pure routing rules live in
// src/lib/workflow/stages.ts.
import type { Actor } from "@/lib/auth/permissions";
import { DomainError } from "@/lib/auth/permissions";
import { ACTIVE_FINDING_STATUSES, type ApplicationStatus, type Role } from "@/lib/domain";
import {
  addDays, effectiveStages, nextStage, OFF_STAGE, reentryStage, stageLabel, STAGE_CODES,
  type StageCode, type StageVisit,
} from "@/lib/workflow/stages";
import { prisma, json, type Tx } from "./db";
import { recordAudit } from "./audit";
import { transitionStatus } from "./applications";
import { notifyInstitution, notifyStaff } from "./notifications";
import { getSettings } from "./settings";

export const ENGINE = { label: "system:workflow-engine", role: "SYSTEM" };

type By = { actor: Actor | null; at?: Date };

export async function loadStageConfigs(tx: Tx = prisma) {
  const rows = await tx.stageConfig.findMany();
  return new Map(rows.map((r) => [r.code as StageCode, r]));
}

async function getApp(tx: Tx, applicationId: string) {
  return tx.application.findUniqueOrThrow({ where: { id: applicationId }, include: { institution: { select: { id: true, regionId: true, name: true } } } });
}

/** The full ordered stage list stored on the application when its pathway was assigned. */
export function stagesOf(app: { pathwayStagesJson: string | null }): StageCode[] {
  return effectiveStages(json<string[]>(app.pathwayStagesJson, ["SCRUTINY", "DECISION"]));
}

async function isNewInstitution(tx: Tx, applicationType: string) {
  const route = await tx.applicationTypeRoute.findUnique({ where: { applicationType } });
  return route?.isNewInstitution ?? false;
}

/** Pick the pathway for the application's type and store a snapshot of its stages. */
export async function assignPathway(tx: Tx, applicationId: string, by: By) {
  const app = await getApp(tx, applicationId);
  const route = await tx.applicationTypeRoute.findUnique({ where: { applicationType: app.applicationType } });
  const pathway = route ? await tx.pathwayConfig.findUnique({ where: { code: route.pathwayCode } }) : null;
  const code = pathway?.code ?? "SCRUTINY_ONLY";
  const stages = pathway ? json<string[]>(pathway.stagesJson, ["SCRUTINY", "DECISION"]) : ["SCRUTINY", "DECISION"];
  await tx.application.update({ where: { id: applicationId }, data: { pathwayCode: code, pathwayStagesJson: JSON.stringify(stages) } });
  await recordAudit({ actor: by.actor ?? ENGINE, eventType: "PATHWAY_ASSIGNED", action: `Processing pathway assigned: ${pathway?.name ?? "Only Scrutiny"}`, applicationId, after: { applicationType: app.applicationType, pathway: code, stages: effectiveStages(stages) } }, tx);
  return effectiveStages(stages);
}

/** Status the application takes when it enters a stage (null = leave the scrutiny status alone). */
function statusForStage(stage: StageCode, current: ApplicationStatus): ApplicationStatus | null {
  if (stage === "EVC" || stage === "SAC_SHC") return "IN_STAGE_REVIEW";
  if (stage === "DECISION") return "READY_FOR_AUTHORIZED_REVIEW";
  // Reverted back to scrutiny from a committee stage or the competent authority.
  if (stage === "SCRUTINY" && (current === "IN_STAGE_REVIEW" || current === "READY_FOR_AUTHORIZED_REVIEW")) return "REVIEW_REQUIRED";
  return null;
}

const STAGE_MESSAGES: Partial<Record<StageCode, (ref: string, inst: string, due: string) => { staff: string; institution: string }>> = {
  SCRUTINY: (ref, inst, due) => ({ staff: `${ref} (${inst}) is at scrutiny. Complete scrutiny by ${due}.`, institution: `${ref} is under scrutiny by the Regional office.` }),
  PRELIMINARY: (ref, inst, due) => ({ staff: `${ref} (${inst}) is in preliminary checks; it is routed automatically when the checks are clean. Review by ${due} otherwise.`, institution: `${ref} is in preliminary checks.` }),
  EVC: (ref, inst, due) => ({ staff: `${ref} (${inst}) needs an Expert Visit Committee. Schedule the visit; the EVC stage is due by ${due}.`, institution: `${ref} has moved to the Expert Visit Committee stage. You will be told the visit date in advance.` }),
  SAC_SHC: (ref, inst, due) => ({ staff: `${ref} (${inst}) is listed for SAC/SHC consideration, due by ${due}.`, institution: `${ref} has moved to the SAC/SHC stage.` }),
  DECISION: (ref, inst, due) => ({ staff: `${ref} (${inst}) awaits the recorded outcome of the competent authority, due by ${due}.`, institution: `${ref} has been forwarded to the competent authority.` }),
};

/** Open a stage visit with its timeline and tell the people who must act. */
export async function openStage(tx: Tx, applicationId: string, stage: StageCode, by: By, opts: { note?: string; notify?: boolean } = {}) {
  const app = await getApp(tx, applicationId);
  const configs = await loadStageConfigs(tx);
  const cfg = configs.get(stage);
  if (!cfg) throw new DomainError(`Stage ${stage} is not configured.`);
  const enteredAt = by.at ?? new Date();
  const fresh = await isNewInstitution(tx, app.applicationType);
  const sla = fresh && cfg.newInstitutionSlaDays ? cfg.newInstitutionSlaDays : cfg.slaDays;
  const dueAt = addDays(enteredAt, sla);
  const attempt = (await tx.stageInstance.count({ where: { applicationId, stageCode: stage } })) + 1;
  const instance = await tx.stageInstance.create({ data: { applicationId, stageCode: stage, attempt, enteredAt, dueAt } });
  await tx.application.update({ where: { id: applicationId }, data: { currentStage: stage } });
  const to = statusForStage(stage, app.status as ApplicationStatus);
  if (to && to !== app.status) await transitionStatus(tx, applicationId, to, { actor: by.actor, label: ENGINE.label, reason: `Entered stage: ${stageLabel(stage, attempt)}` });
  if (stage === "EVC") {
    const settings = await getSettings();
    await tx.evcVisit.create({ data: { applicationId, stageInstanceId: instance.id, scheduleBy: addDays(enteredAt, settings.evcScheduleWithinDays), createdAt: enteredAt } });
  }
  const label = stageLabel(stage, attempt);
  await recordAudit({ actor: by.actor ?? ENGINE, eventType: "STAGE_ENTERED", action: `Entered stage: ${label}${opts.note ? ` (${opts.note})` : ""}`, applicationId, after: { stage, attempt, enteredAt, dueAt, slaDays: sla, newInstitution: fresh } }, tx);
  if (opts.notify !== false) {
    const due = dueAt.toISOString().slice(0, 10);
    const msg = STAGE_MESSAGES[stage]?.(app.reference, app.institutionName, due);
    if (msg) {
      const link = `/applications/${applicationId}?tab=workflow`;
      await notifyStaff([cfg.responsibleRole as Role], app.institution.regionId, { type: "STAGE_ENTERED", title: `${label}: ${app.reference}`, body: msg.staff, link, severity: "MEDIUM", dedupeKey: `stage-in:${instance.id}` }, tx);
      await notifyInstitution(app.institutionId, { type: "STAGE_ENTERED", title: `Application moved to ${label}`, body: msg.institution, link, severity: "LOW", dedupeKey: `stage-in:${instance.id}` }, tx);
    }
  }
  return instance;
}

async function activeInstance(tx: Tx, applicationId: string) {
  return tx.stageInstance.findFirst({ where: { applicationId, status: "ACTIVE" }, orderBy: { enteredAt: "desc" } });
}

export interface Completion { outcome: string; remarks: string; reference?: string | null }

/** Close the active stage visit as completed. */
export async function completeStage(tx: Tx, applicationId: string, by: By, c: Completion) {
  const inst = await activeInstance(tx, applicationId);
  if (!inst) throw new DomainError("This application has no active processing stage.");
  const at = by.at ?? new Date();
  await tx.stageInstance.update({ where: { id: inst.id }, data: { status: "COMPLETED", completedAt: at, completedById: by.actor?.userId ?? null, completedByName: by.actor?.name ?? ENGINE.label, outcome: c.outcome, remarks: c.remarks, reference: c.reference ?? null } });
  await recordAudit({ actor: by.actor ?? ENGINE, eventType: "STAGE_COMPLETED", action: `Completed stage: ${stageLabel(inst.stageCode, inst.attempt)} — ${c.outcome.replace(/_/g, " ").toLowerCase()}`, applicationId, reason: c.remarks, after: { stage: inst.stageCode, outcome: c.outcome, reference: c.reference ?? null, daysInStage: Math.round((at.getTime() - inst.enteredAt.getTime()) / 86_400_000), withinTimeline: at <= inst.dueAt } }, tx);
  return inst;
}

/**
 * Complete the current stage and move the application to the next prescribed stage of its
 * pathway (automatic routing). Returns the stage entered, or null when the pathway is finished.
 */
export async function advanceToNextStage(tx: Tx, applicationId: string, by: By, c: Completion): Promise<StageCode | null> {
  const done = await completeStage(tx, applicationId, by, c);
  const app = await getApp(tx, applicationId);
  const stages = stagesOf(app);
  const history = (await tx.stageInstance.findMany({ where: { applicationId }, select: { stageCode: true, status: true } })) as StageVisit[];
  const next = nextStage(stages, done.stageCode as StageCode, history);
  if (!next) {
    await tx.application.update({ where: { id: applicationId }, data: { currentStage: OFF_STAGE.CLOSED } });
    return null;
  }
  await openStage(tx, applicationId, next, { actor: by.actor, at: by.at }, { note: `after ${stageLabel(done.stageCode, done.attempt)}` });
  return next;
}

/** Mark the active stage visit as returned to the institution (the caller records the rectification request). */
export async function markReturned(tx: Tx, applicationId: string, by: By, message: string) {
  const inst = await activeInstance(tx, applicationId);
  if (inst) {
    await tx.stageInstance.update({ where: { id: inst.id }, data: { status: "RETURNED", completedAt: by.at ?? new Date(), completedById: by.actor?.userId ?? null, completedByName: by.actor?.name ?? ENGINE.label, outcome: "RETURNED_FOR_DEFICIENCY", remarks: message } });
    await tx.evcVisit.updateMany({ where: { stageInstanceId: inst.id, status: { in: ["AWAITING_SCHEDULE", "SCHEDULED"] } }, data: { status: "CANCELLED" } });
  }
  await tx.application.update({ where: { id: applicationId }, data: { currentStage: OFF_STAGE.RETURNED } });
  return inst;
}

/** Revert to an earlier stage of the pathway for further verification (authorised officials only). */
export async function revertStage(tx: Tx, applicationId: string, target: StageCode, by: By, reason: string) {
  const inst = await activeInstance(tx, applicationId);
  if (!inst) throw new DomainError("This application has no active processing stage.");
  const at = by.at ?? new Date();
  await tx.stageInstance.update({ where: { id: inst.id }, data: { status: "RETURNED", completedAt: at, completedById: by.actor?.userId ?? null, completedByName: by.actor?.name ?? ENGINE.label, outcome: "REVERTED", remarks: reason } });
  await tx.evcVisit.updateMany({ where: { stageInstanceId: inst.id, status: { in: ["AWAITING_SCHEDULE", "SCHEDULED"] } }, data: { status: "CANCELLED" } });
  await recordAudit({ actor: by.actor ?? ENGINE, eventType: "STAGE_REVERTED", action: `Reverted from ${stageLabel(inst.stageCode, inst.attempt)} to ${stageLabel(target)}`, applicationId, reason, before: { stage: inst.stageCode }, after: { stage: target } }, tx);
  await openStage(tx, applicationId, target, by, { note: "reverted" });
}

/**
 * Called after every completed validation run. Routes a newly submitted application into its
 * pathway, re-opens scrutiny (re-scrutiny) after a submitted rectification, and automatically
 * moves an application out of preliminary checks when they are clean.
 */
export async function afterValidation(applicationId: string, at?: Date) {
  const app = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!app || app.status === "CLOSED" || app.status === "PROCESSING" || app.status === "DRAFT") return;
  if (!app.currentStage) {
    await prisma.$transaction(async (tx) => {
      const stages = await assignPathway(tx, applicationId, { actor: null, at });
      await openStage(tx, applicationId, stages[0], { actor: null, at }, { note: "on submission" });
    });
  } else if (app.currentStage === OFF_STAGE.RETURNED) {
    const open = await prisma.rectificationRequest.count({ where: { applicationId, status: "OPEN" } });
    if (open > 0) return; // still with the institution
    await prisma.$transaction(async (tx) => {
      await openStage(tx, applicationId, reentryStage(stagesOf(app)), { actor: null, at }, { note: "after rectification" });
    });
  }
  await tryAutoRoute(applicationId, at);
}

/** System actor used when the engine runs issuer verification on its own. */
const ENGINE_ACTOR: Actor = { userId: "system:workflow-engine", name: "system:workflow-engine", email: "workflow-engine@system", role: "SCRUTINY_OFFICER", institutionId: null, regionId: null };

/**
 * Automatic routing out of PRELIMINARY: when the automated checks passed with no open findings
 * and every verifiable document is verified (the engine runs the issuer check itself), the
 * application moves to its first committee stage. Anything else waits for an officer.
 */
export async function tryAutoRoute(applicationId: string, at?: Date): Promise<boolean> {
  const app = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!app || app.currentStage !== "PRELIMINARY" || app.status !== "AUTO_PASSED") return false;
  const open = await prisma.finding.count({ where: { applicationId, status: { in: ACTIVE_FINDING_STATUSES } } });
  if (open > 0) return false;
  const { verificationCoverage, runVerification } = await import("./verification");
  let coverage = await verificationCoverage(applicationId);
  if (coverage.some((c) => !c.covered)) {
    await runVerification(ENGINE_ACTOR, applicationId);
    coverage = await verificationCoverage(applicationId);
  }
  if (coverage.some((c) => !c.covered)) return false;
  const after = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
  if (after.status !== "AUTO_PASSED" || after.currentStage !== "PRELIMINARY") return false;
  await prisma.$transaction(async (tx) => {
    await advanceToNextStage(tx, applicationId, { actor: null, at }, { outcome: "AUTO_ROUTED", remarks: "Automated preliminary checks passed with no open findings and issuer verification complete; routed automatically to the next stage of the pathway." });
  });
  return true;
}

export function isStageCode(s: string): s is StageCode {
  return (STAGE_CODES as readonly string[]).includes(s);
}
