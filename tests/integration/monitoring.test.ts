// Approval workflow automation, EVC, compliance monitoring and alerts (PS 26262), exercised
// through the real services against the seeded demo database. Uses the background cases and
// compliance items from scripts/lib/monitoring-seed.ts so the story applications stay untouched.
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { toActor } from "@/server/auth";
import { getAccessibleApplication, listApplications } from "@/server/applications";
import { openStage, tryAutoRoute } from "@/server/stage-engine";
import { forwardForAuthorizedReview, recordDecision, returnForDeficiencies, revertToStage, submitRectification } from "@/server/workflow";
import { recordCommitteeOutcome, scheduleEvc, submitEvcReport } from "@/server/evc";
import { getComplianceItem, reviewSubmission, submitEvidence } from "@/server/compliance-monitor";
import { acknowledgeAlert, listAlerts, runAlertSweep } from "@/server/alerts";
import { getPendency } from "@/server/pendency";
import { buildMonitoringReport } from "@/server/monitoring-reports";
import { updateStageConfig } from "@/server/workflow-config";
import { AuthorizationError, DomainError, NotFoundError, type Actor } from "@/lib/auth/permissions";
import { addDays } from "@/lib/workflow/stages";
import { renderDoc } from "../../scripts/lib/render";

const actors: Record<string, Actor> = {};
const A = (e: string) => actors[e];
const appByName = (n: string) => prisma.application.findFirstOrThrow({ where: { institutionName: { contains: n } } });
const stagesFor = (applicationId: string) => prisma.stageInstance.findMany({ where: { applicationId }, orderBy: { enteredAt: "asc" } });
const today = () => new Date().toISOString().slice(0, 10);
const pdf = async (title: string) => (await renderDoc({ file: "evidence.pdf", category: "OTHER", issuer: "Test", title, fields: [["Reference", "T-1"]], created: "2026-10-01T00:00:00Z" })).buffer;

beforeAll(async () => {
  for (const u of await prisma.user.findMany()) actors[u.email] = toActor(u);
});

describe("seeded workflow configuration", () => {
  it("assigns every submitted application a pathway and a running stage with a due date", async () => {
    const valley = await appByName("Valley");
    expect(valley.pathwayCode).toBe("SCRUTINY_ONLY");
    expect(valley.currentStage).toBe("DECISION");
    const stages = await stagesFor(valley.id);
    expect(stages.map((s) => [s.stageCode, s.status])).toEqual([["SCRUTINY", "COMPLETED"], ["DECISION", "ACTIVE"]]);
    expect(stages[1].dueAt.getTime()).toBeGreaterThan(stages[1].enteredAt.getTime());
    const greenfield = await appByName("Greenfield");
    expect(greenfield.currentStage).toBeNull(); // a draft has not been submitted yet
  });
  it("uses the shorter new-institution timeline for new institutions", async () => {
    const aravali = await appByName("Aravali");
    const scrutiny = (await stagesFor(aravali.id)).find((s) => s.stageCode === "SCRUTINY")!;
    expect(Math.round((scrutiny.dueAt.getTime() - scrutiny.enteredAt.getTime()) / 86_400_000)).toBe(10);
    const shivalik = await appByName("Shivalik");
    const s2 = (await stagesFor(shivalik.id))[0];
    expect(Math.round((s2.dueAt.getTime() - s2.enteredAt.getTime()) / 86_400_000)).toBe(15);
  });
});

describe("Region scoping", () => {
  it("limits a Regional officer to institutions in their Region", async () => {
    const ro = A("ro.south@pravah.demo");
    expect(ro.regionId).toBeTruthy();
    const apps = await listApplications(ro);
    expect(apps.length).toBeGreaterThan(0);
    const regions = await prisma.institution.findMany({ where: { applications: { some: { id: { in: apps.map((a) => a.id) } } } }, select: { regionId: true } });
    expect(new Set(regions.map((r) => r.regionId))).toEqual(new Set([ro.regionId]));
    const meridian = await appByName("Meridian"); // Western Region
    await expect(getAccessibleApplication(ro, meridian.id)).rejects.toBeInstanceOf(NotFoundError);
    const p = await getPendency(ro);
    expect(p.cases.every((c) => c.regionId === ro.regionId)).toBe(true);
  });
  it("lets the Bureau see pendency across every Region", async () => {
    const p = await getPendency(A("bureau@pravah.demo"));
    expect(new Set(p.cases.map((c) => c.regionName)).size).toBeGreaterThanOrEqual(3);
    expect(p.totals.inProcess).toBe(await prisma.stageInstance.count({ where: { status: "ACTIVE" } }));
    const rows = (await buildMonitoringReport(A("bureau@pravah.demo"), "regions")).rows;
    expect(rows).toHaveLength(4);
  });
});

describe("automatic routing", () => {
  it("routes an application out of clean preliminary checks without human action", async () => {
    const malabar = await appByName("Malabar");
    // Put the case on the Only-EVC pathway at preliminary checks with a clean automated result.
    await prisma.stageInstance.updateMany({ where: { applicationId: malabar.id, status: "ACTIVE" }, data: { status: "COMPLETED", completedAt: new Date(), outcome: "TEST_RESET" } });
    await prisma.application.update({ where: { id: malabar.id }, data: { status: "AUTO_PASSED", pathwayCode: "EVC_ONLY", pathwayStagesJson: JSON.stringify(["EVC", "DECISION"]) } });
    await prisma.$transaction((tx) => openStage(tx, malabar.id, "PRELIMINARY", { actor: null }, { notify: false }));
    expect(await tryAutoRoute(malabar.id)).toBe(true);
    const after = await prisma.application.findUniqueOrThrow({ where: { id: malabar.id } });
    expect(after.currentStage).toBe("EVC");
    expect(after.status).toBe("IN_STAGE_REVIEW");
    const prelim = (await stagesFor(malabar.id)).find((s) => s.stageCode === "PRELIMINARY")!;
    expect(prelim.outcome).toBe("AUTO_ROUTED");
    expect(prelim.completedByName).toBe("system:workflow-engine");
    expect(await prisma.evcVisit.count({ where: { applicationId: malabar.id, status: "AWAITING_SCHEDULE" } })).toBe(1);
  });
  it("does not let an application leave a committee stage through the scrutiny forward action", async () => {
    const hooghly = await appByName("Hooghly");
    await expect(forwardForAuthorizedReview(A("scrutiny@pravah.demo"), hooghly.id, "Trying to skip the expert visit")).rejects.toBeInstanceOf(DomainError);
  });
});

describe("Expert Visit Committee", () => {
  it("schedules a visit, accepts the convenor's report and moves the application on automatically", async () => {
    const hooghly = await appByName("Hooghly");
    const visit = await prisma.evcVisit.findFirstOrThrow({ where: { applicationId: hooghly.id, status: "AWAITING_SCHEDULE" } });
    const bureau = A("bureau@pravah.demo");
    const convenor = A("committee@pravah.demo");
    await expect(scheduleEvc(bureau, visit.id, { visitDate: "2020-01-01", convenorId: convenor.userId })).rejects.toBeInstanceOf(DomainError);
    await expect(scheduleEvc(bureau, visit.id, { visitDate: today(), convenorId: bureau.userId })).rejects.toThrow(/committee member/);
    await expect(scheduleEvc(A("committee@pravah.demo"), visit.id, { visitDate: today(), convenorId: convenor.userId })).rejects.toBeInstanceOf(AuthorizationError);
    await scheduleEvc(bureau, visit.id, { visitDate: today(), convenorId: convenor.userId, members: "Dr. Harish Bhat" });
    await expect(scheduleEvc(bureau, visit.id, { visitDate: today(), convenorId: convenor.userId })).rejects.toThrow(/reason/);
    const institutionNote = await prisma.notification.findFirst({ where: { type: "EVC_SCHEDULED", user: { institutionId: hooghly.institutionId } } });
    expect(institutionNote?.link).toMatch(/^\/portal\/applications\//);

    const report = { recommendation: "SATISFACTORY" as const, summary: "Laboratories, library and faculty records verified against the application.", reference: "EVC/TEST/1" };
    await expect(submitEvcReport(A("committee2@pravah.demo"), visit.id, report)).rejects.toThrow(/convenor/);
    await submitEvcReport(convenor, visit.id, report);
    const after = await prisma.application.findUniqueOrThrow({ where: { id: hooghly.id } });
    expect(after.currentStage).toBe("DECISION");
    expect(after.status).toBe("READY_FOR_AUTHORIZED_REVIEW");
    expect((await stagesFor(hooghly.id)).find((s) => s.stageCode === "EVC")!.outcome).toBe("EVC_SATISFACTORY");
  });
  it("records a decision with a time-bound undertaking that is then tracked", async () => {
    const hooghly = await appByName("Hooghly");
    const due = addDays(new Date(), 90).toISOString().slice(0, 10);
    await recordDecision(A("senior@pravah.demo"), hooghly.id, "SATISFACTORY_FOR_FURTHER_PROCESSING", "Scrutiny and EVC complete with no open issues.", "TEST/DEC/1", { typeCode: "FACULTY_RECRUITMENT", title: "Appoint faculty for the additional intake", dueDate: due });
    const after = await prisma.application.findUniqueOrThrow({ where: { id: hooghly.id } });
    expect(after.status).toBe("CLOSED");
    expect(after.currentStage).toBe("CLOSED");
    const item = await prisma.complianceItem.findFirstOrThrow({ where: { applicationId: hooghly.id, kind: "UNDERTAKING" } });
    expect(item.dueDate.toISOString().slice(0, 10)).toBe(due);
  });
  it("lets SAC/SHC record its outcome, moving the application to the competent authority", async () => {
    const thar = await appByName("Thar");
    const committee = A("committee@pravah.demo");
    const input = { outcome: "RECOMMENDED" as const, meetingDate: today(), remarks: "Committee considered the EVC report and recommends further processing.", reference: "SAC/TEST/1" };
    await expect(recordCommitteeOutcome(committee, thar.id, { ...input, meetingDate: addDays(new Date(), 3).toISOString().slice(0, 10) })).rejects.toThrow(/future/);
    await expect(recordCommitteeOutcome(A("scrutiny@pravah.demo"), thar.id, input)).rejects.toBeInstanceOf(AuthorizationError);
    await recordCommitteeOutcome(committee, thar.id, input);
    const after = await prisma.application.findUniqueOrThrow({ where: { id: thar.id } });
    expect([after.currentStage, after.status]).toEqual(["DECISION", "READY_FOR_AUTHORIZED_REVIEW"]);
  });
});

describe("return, re-scrutiny and revert", () => {
  it("re-opens scrutiny (re-scrutiny) when the institution resubmits after a return", async () => {
    const kalinga = await appByName("Kalinga");
    expect([kalinga.currentStage, kalinga.status]).toEqual(["RETURNED", "RECTIFICATION_REQUIRED"]);
    const applicant = Object.values(actors).find((a) => a.institutionId === kalinga.institutionId)!;
    await submitRectification(applicant, kalinga.id, "Registered lease deed in the applicant society's name uploaded.");
    const stages = await stagesFor(kalinga.id);
    expect(stages.map((s) => [s.stageCode, s.attempt, s.status])).toEqual([["SCRUTINY", 1, "RETURNED"], ["SCRUTINY", 2, "ACTIVE"]]);
    expect((await prisma.application.findUniqueOrThrow({ where: { id: kalinga.id } })).currentStage).toBe("SCRUTINY");
  });
  it("returns an application from a committee stage with the reason recorded and the visit cancelled", async () => {
    const aravali = await appByName("Aravali");
    await expect(returnForDeficiencies(A("committee@pravah.demo"), aravali.id, "Committee members cannot return directly")).rejects.toBeInstanceOf(AuthorizationError);
    await returnForDeficiencies(A("bureau@pravah.demo"), aravali.id, "Building plan approval not submitted for the new block.");
    const after = await prisma.application.findUniqueOrThrow({ where: { id: aravali.id } });
    expect([after.currentStage, after.status]).toEqual(["RETURNED", "RECTIFICATION_REQUIRED"]);
    expect(await prisma.evcVisit.count({ where: { applicationId: aravali.id, status: "CANCELLED" } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { applicationId: aravali.id, eventType: "APPLICATION_RETURNED" } })).toBe(1);
  });
  it("lets an authorised official revert to an earlier stage, with a reason", async () => {
    const nilgiri = await appByName("Nilgiri");
    await expect(revertToStage(A("scrutiny@pravah.demo"), nilgiri.id, "EVC", "Officers cannot revert stages")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(revertToStage(A("senior@pravah.demo"), nilgiri.id, "SAC_SHC", "Not part of this pathway at all")).rejects.toBeInstanceOf(DomainError);
    await revertToStage(A("senior@pravah.demo"), nilgiri.id, "EVC", "Laboratory photographs in the EVC report are of a different block.");
    const after = await prisma.application.findUniqueOrThrow({ where: { id: nilgiri.id } });
    expect([after.currentStage, after.status]).toEqual(["EVC", "IN_STAGE_REVIEW"]);
    const evc = (await stagesFor(nilgiri.id)).filter((s) => s.stageCode === "EVC");
    expect(evc.map((s) => s.attempt)).toEqual([1, 2]);
    expect(await prisma.evcVisit.count({ where: { applicationId: nilgiri.id, status: "AWAITING_SCHEDULE" } })).toBe(1);
  });
});

describe("undertakings and document validity", () => {
  it("accepts a renewed document online, verifies it and moves the validity date", async () => {
    const lease = await prisma.complianceItem.findFirstOrThrow({ where: { typeCode: "LEASE_DEED", institution: { name: { contains: "Greenfield" } } } });
    const applicant = A("applicant.greenfield@pravah.demo");
    const buffer = await pdf("Renewed lease deed");
    const base = { fileName: "lease-renewed.pdf", mimeType: "application/pdf", buffer, note: "Lease extended by 30 years; registered deed attached." };
    await expect(getComplianceItem(A("applicant.meridian@pravah.demo"), lease.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(submitEvidence(applicant, lease.id, { ...base, newValidUntil: "2020-01-01" })).rejects.toThrow(/beyond/);
    await expect(submitEvidence(applicant, lease.id, { ...base, fileName: "lease.exe", mimeType: "application/octet-stream", newValidUntil: "2056-12-31" })).rejects.toBeInstanceOf(DomainError);
    const sub = await submitEvidence(applicant, lease.id, { ...base, newValidUntil: "2056-12-31", newReference: "DEMO/LEASE/TN/2026/0901" });
    expect((await prisma.complianceItem.findUniqueOrThrow({ where: { id: lease.id } })).status).toBe("SUBMITTED");
    await expect(reviewSubmission(applicant, sub.id, true, "Self-verification")).rejects.toBeInstanceOf(AuthorizationError);
    await reviewSubmission(A("bureau@pravah.demo"), sub.id, true, "Registered deed checked against the sub-registrar record.");
    const after = await prisma.complianceItem.findUniqueOrThrow({ where: { id: lease.id } });
    expect([after.status, after.dueDate.toISOString().slice(0, 10), after.reference, after.escalationLevel]).toEqual(["OPEN", "2056-12-31", "DEMO/LEASE/TN/2026/0901", 0]);
  });
  it("returns unsatisfactory undertaking evidence to the institution with remarks", async () => {
    const und = await prisma.complianceItem.findFirstOrThrow({ where: { status: "SUBMITTED", institution: { name: { contains: "Northfield" } } }, include: { submissions: true } });
    await expect(reviewSubmission(A("ro.south@pravah.demo"), und.submissions[0].id, false, "Outside my Region")).rejects.toBeInstanceOf(NotFoundError);
    await reviewSubmission(A("scrutiny@pravah.demo"), und.submissions[0].id, false, "Joining reports are unsigned; resubmit signed copies.");
    expect((await prisma.complianceItem.findUniqueOrThrow({ where: { id: und.id } })).status).toBe("OPEN");
  });
});

describe("alerts and escalation", () => {
  it("is idempotent: a second sweep raises nothing new", async () => {
    await runAlertSweep(null);
    const again = await runAlertSweep(null);
    expect(again.raised).toBe(0);
  });
  it("escalates an overdue stage up the ladder to the competent authority", async () => {
    const brahmaputra = await appByName("Brahmaputra");
    const stage = (await stagesFor(brahmaputra.id))[0];
    expect(stage.escalationLevel).toBe(3);
    const esc = await prisma.alert.findFirstOrThrow({ where: { applicationId: brahmaputra.id, kind: "ESCALATION", level: 3 } });
    expect(esc.recipientRoles).toContain("SENIOR_OFFICIAL");
    await expect(acknowledgeAlert(A("senior@pravah.demo"), esc.id, "ok")).rejects.toBeInstanceOf(DomainError);
    await acknowledgeAlert(A("senior@pravah.demo"), esc.id, "Directed the Regional office to complete scrutiny this week.");
    expect(await prisma.auditEvent.count({ where: { eventType: "ESCALATION_ACKNOWLEDGED", applicationId: brahmaputra.id } })).toBe(1);
  });
  it("resolves alerts once the underlying work is done", async () => {
    // Hooghly was decided above; its stage alerts (if any) and the Greenfield lease reminder are now moot.
    await runAlertSweep(null);
    const lease = await prisma.alert.findFirst({ where: { subjectType: "DOCUMENT", title: { contains: "DEMO/LEASE/TN/2011/0418" } } });
    expect(lease?.resolvedAt).toBeTruthy();
  });
  it("raises reminders before a deadline and keeps Regional officers to their Region", async () => {
    const future = addDays(new Date(), 13);
    const r = await runAlertSweep(null, future);
    expect(r.raised).toBeGreaterThan(0);
    const ro = A("ro.south@pravah.demo");
    const mine = await listAlerts(ro, {});
    expect(mine.every((a) => a.regionId === ro.regionId)).toBe(true);
    await expect(listAlerts(A("applicant.greenfield@pravah.demo"), {})).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("configurable timelines", () => {
  it("lets only administrators change a stage timeline, audited with before and after", async () => {
    const patch = { slaDays: 12, newInstitutionSlaDays: 8, reminderDaysBefore: 3, escalateL2AfterDays: 3, escalateL3AfterDays: 10 };
    await expect(updateStageConfig(A("bureau@pravah.demo"), "SCRUTINY", patch)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(updateStageConfig(A("admin@pravah.demo"), "SCRUTINY", { ...patch, escalateL3AfterDays: 2 })).rejects.toBeInstanceOf(DomainError);
    await updateStageConfig(A("admin@pravah.demo"), "SCRUTINY", patch);
    expect((await prisma.stageConfig.findUniqueOrThrow({ where: { code: "SCRUTINY" } })).slaDays).toBe(12);
    const ev = await prisma.auditEvent.findFirstOrThrow({ where: { eventType: "WORKFLOW_CONFIG_UPDATED" }, orderBy: { createdAt: "desc" } });
    expect(JSON.parse(ev.beforeJson ?? "{}").slaDays).toBe(15);
    // A stage visit opened afterwards uses the new timeline; visits already running keep theirs.
    const bundel = await appByName("Bundelkhand");
    await revertToStage(A("senior@pravah.demo"), bundel.id, "SCRUTINY", "Fee receipt needs to be re-checked by the Regional office.");
    const reopened = (await stagesFor(bundel.id)).filter((s) => s.stageCode === "SCRUTINY").at(-1)!;
    expect(reopened.attempt).toBe(2);
    expect(Math.round((reopened.dueAt.getTime() - reopened.enteredAt.getTime()) / 86_400_000)).toBe(12);
  });
});
