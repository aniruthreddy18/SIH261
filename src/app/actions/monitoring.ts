"use server";
// Server actions for the approval workflow, EVC, compliance monitoring, alerts and workflow
// configuration (PS 26262). Same conventions as ./workflow.ts: thin wrappers around services.
import { runAction } from "@/server/actions-util";
import { acknowledgeAlert, runAlertSweep } from "@/server/alerts";
import { createUndertaking, registerDocument, reviewSubmission, waiveItem } from "@/server/compliance-monitor";
import { recordCommitteeOutcome, scheduleEvc, submitEvcReport } from "@/server/evc";
import { returnForDeficiencies, revertToStage } from "@/server/workflow";
import { updateStageConfig, updateTypeRoute } from "@/server/workflow-config";
import { EVC_RECOMMENDATIONS, COMMITTEE_OUTCOMES, stageLabel, type CommitteeOutcome, type EvcRecommendation } from "@/lib/workflow/stages";

type Values = Record<string, string>;
const MONITORING = ["/", "/applications", "/pendency", "/evc", "/compliance-monitor", "/alerts", "/reports", "/portal"];

export async function scheduleEvcAction(visitId: string, v: Values) {
  return runAction((a) => scheduleEvc(a, visitId, { visitDate: v.visitDate ?? "", convenorId: v.convenorId ?? "", members: v.members, reason: v.reason }), { success: `Expert visit scheduled for ${v.visitDate}. The convenor and the institution have been notified.`, revalidate: MONITORING });
}

export async function submitEvcReportAction(visitId: string, v: Values) {
  return runAction((a) => submitEvcReport(a, visitId, { recommendation: v.recommendation as EvcRecommendation, summary: v.summary ?? "", reference: v.reference ?? "" }), { success: `EVC report submitted — ${EVC_RECOMMENDATIONS[v.recommendation as EvcRecommendation] ?? ""}`, revalidate: MONITORING });
}

export async function committeeOutcomeAction(applicationId: string, v: Values) {
  return runAction((a) => recordCommitteeOutcome(a, applicationId, { outcome: v.outcome as CommitteeOutcome, meetingDate: v.meetingDate ?? "", remarks: v.remarks ?? "", reference: v.reference ?? "" }), { success: `SAC/SHC outcome recorded — ${COMMITTEE_OUTCOMES[v.outcome as CommitteeOutcome] ?? ""}`, revalidate: MONITORING });
}

export async function returnForDeficienciesAction(applicationId: string, v: Values) {
  return runAction((a) => returnForDeficiencies(a, applicationId, v.message ?? ""), { success: "Returned to the institution with the deficiencies recorded", revalidate: MONITORING });
}

export async function revertToStageAction(applicationId: string, v: Values) {
  return runAction((a) => revertToStage(a, applicationId, v.target ?? "", v.reason ?? ""), { success: `Reverted to ${stageLabel(v.target)}`, revalidate: MONITORING });
}

export async function createUndertakingAction(institutionId: string, applicationId: string | null, v: Values) {
  return runAction((a) => createUndertaking(a, { institutionId, applicationId, typeCode: v.typeCode ?? "", title: v.title ?? "", description: v.description ?? "", dueDate: v.dueDate ?? "" }), { success: "Time-bound undertaking recorded; the institution has been notified", revalidate: MONITORING });
}

export async function registerDocumentAction(v: Values) {
  return runAction((a) => registerDocument(a, { institutionId: v.institutionId ?? "", typeCode: v.typeCode ?? "", reference: v.reference ?? "", validUntil: v.validUntil ?? "", description: v.description }), { success: "Document added to the validity register", revalidate: MONITORING });
}

export async function reviewSubmissionAction(submissionId: string, accept: boolean, v: Values) {
  return runAction((a) => reviewSubmission(a, submissionId, accept, v.remarks ?? ""), { success: accept ? "Evidence verified" : "Evidence returned to the institution", revalidate: MONITORING });
}

export async function waiveItemAction(itemId: string, v: Values) {
  return runAction((a) => waiveItem(a, itemId, v.reason ?? ""), { success: "Item waived (recorded with reasons)", revalidate: MONITORING });
}

export async function acknowledgeAlertAction(alertId: string, v: Values) {
  return runAction((a) => acknowledgeAlert(a, alertId, v.note ?? ""), { success: "Escalation acknowledged", revalidate: ["/alerts", "/"] });
}

export async function runAlertSweepAction() {
  return runAction((a) => runAlertSweep(a), { success: (r) => `Alert sweep complete: ${r.raised} new alert(s) — ${r.reminders} reminder(s), ${r.overdue} overdue, ${r.escalations} escalation(s); ${r.resolved} resolved.`, revalidate: MONITORING });
}

export async function updateStageConfigAction(code: string, v: Values) {
  return runAction((a) => updateStageConfig(a, code, { slaDays: v.slaDays as unknown as number, newInstitutionSlaDays: (v.newInstitutionSlaDays ?? "") as unknown as number, reminderDaysBefore: v.reminderDaysBefore as unknown as number, escalateL2AfterDays: v.escalateL2AfterDays as unknown as number, escalateL3AfterDays: v.escalateL3AfterDays as unknown as number }), { success: "Stage timeline updated (applies to stages entered from now on)", revalidate: ["/admin/workflow"] });
}

export async function updateTypeRouteAction(applicationType: string, v: Values) {
  return runAction((a) => updateTypeRoute(a, applicationType, v.pathwayCode ?? ""), { success: "Routing updated for new submissions", revalidate: ["/admin/workflow"] });
}
