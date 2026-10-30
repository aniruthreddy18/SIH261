// Expert Visit Committee scheduling and reports, and SAC/SHC outcomes (PS 26262 §C). The
// committee's recommendation moves the application on or returns it to the institution; the
// regulatory decision itself stays with the competent authority.
import { z } from "zod";
import { assertPermission, DomainError, NotFoundError, type Actor } from "@/lib/auth/permissions";
import { COMMITTEE_OUTCOMES, EVC_RECOMMENDATIONS, type CommitteeOutcome, type EvcRecommendation } from "@/lib/workflow/stages";
import { prisma } from "./db";
import { recordAudit } from "./audit";
import { applicationScope, getAccessibleApplication } from "./applications";
import { notifyInstitution, notifyUsers } from "./notifications";
import { advanceToNextStage } from "./stage-engine";
import { returnForDeficiencies } from "./workflow";

const ScheduleSchema = z.object({
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a visit date"),
  convenorId: z.string().min(1, "Choose the committee convenor"),
  members: z.string().trim().max(500).optional(),
  reason: z.string().trim().max(1000).optional(),
});

async function getVisit(actor: Actor, visitId: string) {
  const visit = await prisma.evcVisit.findUnique({ where: { id: visitId }, include: { stageInstance: true } });
  if (!visit) throw new NotFoundError();
  const app = await getAccessibleApplication(actor, visit.applicationId);
  return { visit, app };
}

/** Schedule (or reschedule) an expert visit with a date, a convenor and committee members. */
export async function scheduleEvc(actor: Actor, visitId: string, input: z.input<typeof ScheduleSchema>) {
  assertPermission(actor, "evc.schedule");
  const data = ScheduleSchema.parse(input);
  const { visit, app } = await getVisit(actor, visitId);
  if (!["AWAITING_SCHEDULE", "SCHEDULED"].includes(visit.status)) throw new DomainError("This visit can no longer be scheduled.");
  if (visit.stageInstance.status !== "ACTIVE") throw new DomainError("The EVC stage for this visit is no longer active.");
  const date = new Date(`${data.visitDate}T00:00:00Z`);
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  if (date < today) throw new DomainError("The visit date cannot be in the past.");
  const rescheduling = visit.status === "SCHEDULED";
  if (rescheduling && (data.reason ?? "").length < 10) throw new DomainError("Give a reason (at least 10 characters) for rescheduling.");
  const convenor = await prisma.user.findFirst({ where: { id: data.convenorId, role: "COMMITTEE_MEMBER", active: true } });
  if (!convenor) throw new DomainError("The convenor must be an active committee member.");
  const members = [convenor.name, ...(data.members ? data.members.split(/[,;\n]/).map((m) => m.trim()).filter(Boolean) : [])];
  await prisma.$transaction(async (tx) => {
    await tx.evcVisit.update({ where: { id: visitId }, data: { status: "SCHEDULED", visitDate: date, convenorId: convenor.id, convenorName: convenor.name, committeeJson: JSON.stringify([...new Set(members)]), scheduledById: actor.userId, scheduledByName: actor.name, scheduledAt: new Date(), ...(rescheduling ? { rescheduleCount: { increment: 1 } } : {}) } });
    await recordAudit({ actor, eventType: "EVC_SCHEDULED", action: `${rescheduling ? "Rescheduled" : "Scheduled"} expert visit for ${data.visitDate} (convenor ${convenor.name})`, applicationId: app.id, reason: rescheduling ? data.reason : undefined, before: rescheduling ? { visitDate: visit.visitDate, convenor: visit.convenorName } : undefined, after: { visitDate: data.visitDate, committee: members, scheduleBy: visit.scheduleBy, scheduledInTime: !rescheduling ? new Date() <= visit.scheduleBy : undefined } }, tx);
    const link = `/applications/${app.id}?tab=workflow`;
    await notifyUsers([convenor.id], { type: "EVC_ASSIGNED", title: `Expert visit ${rescheduling ? "rescheduled" : "assigned"}: ${app.reference}`, body: `${app.institutionName} — visit on ${data.visitDate}. Submit the committee report after the visit.`, link, severity: "MEDIUM" }, tx);
    // Standardised communication to the institution (intimation of the visit).
    await notifyInstitution(app.institutionId, { type: "EVC_SCHEDULED", title: `Expert visit ${rescheduling ? "rescheduled" : "scheduled"}: ${data.visitDate}`, body: `An Expert Visit Committee will visit for application ${app.reference} on ${data.visitDate}. Keep the original documents and facilities ready for verification.`, link, severity: "HIGH" }, tx);
  });
}

const ReportSchema = z.object({
  recommendation: z.enum(Object.keys(EVC_RECOMMENDATIONS) as [EvcRecommendation, ...EvcRecommendation[]]),
  summary: z.string().trim().min(20, "Summarise the committee's observations (at least 20 characters)").max(4000),
  reference: z.string().trim().min(3, "Enter the report reference").max(120),
});

/** The convenor files the committee report; the recommendation routes the application. */
export async function submitEvcReport(actor: Actor, visitId: string, input: z.input<typeof ReportSchema>) {
  assertPermission(actor, "evc.report");
  const data = ReportSchema.parse(input);
  const { visit, app } = await getVisit(actor, visitId);
  if (visit.status !== "SCHEDULED") throw new DomainError(visit.status === "REPORT_SUBMITTED" ? "The report has already been submitted." : "The visit has not been scheduled yet.");
  if (visit.convenorId !== actor.userId) throw new DomainError("Only the convenor of this committee can submit its report.");
  if (visit.visitDate && visit.visitDate > new Date()) throw new DomainError("The report can be submitted on or after the visit date.");
  await prisma.$transaction(async (tx) => {
    await tx.evcVisit.update({ where: { id: visitId }, data: { status: "REPORT_SUBMITTED", reportSubmittedAt: new Date(), recommendation: data.recommendation, reportSummary: data.summary, reportReference: data.reference } });
    await recordAudit({ actor, eventType: "EVC_REPORT_SUBMITTED", action: `EVC report submitted — ${EVC_RECOMMENDATIONS[data.recommendation]}`, applicationId: app.id, reason: data.summary, after: { reference: data.reference, recommendation: data.recommendation } }, tx);
    if (data.recommendation !== "DEFICIENCIES") {
      await advanceToNextStage(tx, app.id, { actor }, { outcome: `EVC_${data.recommendation}`, remarks: data.summary, reference: data.reference });
    }
  });
  if (data.recommendation === "DEFICIENCIES") {
    await returnForDeficiencies(actor, app.id, `Expert Visit Committee observations (${data.reference}): ${data.summary}`, { viaCommittee: true });
  }
}

const CommitteeSchema = z.object({
  outcome: z.enum(Object.keys(COMMITTEE_OUTCOMES) as [CommitteeOutcome, ...CommitteeOutcome[]]),
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the meeting date"),
  remarks: z.string().trim().min(20, "Record the committee's reasons (at least 20 characters)").max(4000),
  reference: z.string().trim().min(3, "Enter the minutes reference").max(120),
});

/** SAC/SHC records its consideration; the outcome routes the application. */
export async function recordCommitteeOutcome(actor: Actor, applicationId: string, input: z.input<typeof CommitteeSchema>) {
  assertPermission(actor, "committee.record");
  const data = CommitteeSchema.parse(input);
  const app = await getAccessibleApplication(actor, applicationId);
  if (app.currentStage !== "SAC_SHC") throw new DomainError("The application is not at the SAC/SHC stage.");
  if (new Date(`${data.meetingDate}T00:00:00Z`) > new Date()) throw new DomainError("The meeting date cannot be in the future.");
  await prisma.$transaction(async (tx) => {
    await recordAudit({ actor, eventType: "COMMITTEE_OUTCOME_RECORDED", action: `SAC/SHC outcome recorded — ${COMMITTEE_OUTCOMES[data.outcome]}`, applicationId, reason: data.remarks, after: { meetingDate: data.meetingDate, reference: data.reference, outcome: data.outcome } }, tx);
    if (data.outcome !== "RETURN_FOR_DEFICIENCY") {
      await advanceToNextStage(tx, applicationId, { actor }, { outcome: `SAC_${data.outcome}`, remarks: data.remarks, reference: data.reference });
    }
  });
  if (data.outcome === "RETURN_FOR_DEFICIENCY") {
    await returnForDeficiencies(actor, applicationId, `SAC/SHC (${data.reference}, ${data.meetingDate}): ${data.remarks}`, { viaCommittee: true });
  }
}

/** EVC board: every visit in the actor's scope (committee members see their own visits first). */
export async function listEvcVisits(actor: Actor) {
  const visits = await prisma.evcVisit.findMany({
    where: { application: applicationScope(actor) },
    orderBy: [{ status: "asc" }, { scheduleBy: "asc" }],
    include: {
      application: { select: { id: true, reference: true, institutionName: true, applicationType: true, institution: { select: { city: true, state: true, region: { select: { name: true } } } } } },
      stageInstance: { select: { dueAt: true, enteredAt: true, status: true } },
    },
  });
  return visits;
}

export async function listCommitteeMembers() {
  return prisma.user.findMany({ where: { role: "COMMITTEE_MEMBER", active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, designation: true } });
}
