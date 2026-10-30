// Seed data for approval-workflow monitoring (PS 26262): Regions, the sample workflow
// configuration, and lightweight background cases spread across Regions, stages and timelines
// so the pendency, EVC, compliance and alert screens have realistic content.
//
// Background cases are synthetic records driven through the real stage engine with backdated
// times. They carry no uploaded documents — the three story applications cover document
// validation end to end. Every timeline is sample configuration, not a value from the APH.
import { prisma } from "../../src/server/db";
import { hashPassword } from "../../src/lib/auth/password";
import { toActor } from "../../src/server/auth";
import { createApplication, transitionStatus } from "../../src/server/applications";
import { advanceToNextStage, assignPathway, openStage } from "../../src/server/stage-engine";
import { returnForDeficiencies } from "../../src/server/workflow";
import { runAlertSweep } from "../../src/server/alerts";
import { saveFile, sha256 } from "../../src/server/storage";
import { addDays, DEFAULT_PATHWAYS, DEFAULT_STAGES, DEFAULT_TYPE_ROUTES, APPLICATION_TYPE_LABELS } from "../../src/lib/workflow/stages";
import type { Actor } from "../../src/lib/auth/permissions";
import type { ApplicationStatus } from "../../src/lib/domain";
import { ACADEMIC_YEAR, DEMO_PASSWORD } from "./demo-data";
import { renderDoc } from "./render";

export const REGIONS = [
  { code: "NR", name: "Northern Region", office: "Demo Regional Office — North", states: ["Punjab", "Uttarakhand", "Haryana", "Himachal Pradesh", "Delhi"] },
  { code: "WR", name: "Western Region", office: "Demo Regional Office — West", states: ["Gujarat", "Maharashtra", "Rajasthan", "Goa"] },
  { code: "SR", name: "Southern Region", office: "Demo Regional Office — South", states: ["Karnataka", "Kerala", "Tamil Nadu", "Telangana", "Andhra Pradesh"] },
  { code: "ER", name: "Eastern Region", office: "Demo Regional Office — East", states: ["Odisha", "West Bengal", "Assam", "Bihar", "Jharkhand"] },
];

export const MONITORING_STAFF = [
  { email: "ro.south@pravah.demo", name: "Lakshmi Narayanan", role: "SCRUTINY_OFFICER" as const, designation: "Regional Officer, Southern Region (Demo)", region: "SR" },
  { email: "bureau@pravah.demo", name: "Rohit Saxena", role: "BUREAU_OFFICER" as const, designation: "Approval Bureau Officer (Demo)" },
  { email: "committee@pravah.demo", name: "Prof. Meera Pillai", role: "COMMITTEE_MEMBER" as const, designation: "EVC Convenor / SAC member (Demo)" },
  { email: "committee2@pravah.demo", name: "Dr. Harish Bhat", role: "COMMITTEE_MEMBER" as const, designation: "EVC Member (Demo)" },
];

/** Regions, stage timelines, pathways and application-type routing (sample configuration). */
export async function seedWorkflowConfig() {
  const regionIds = new Map<string, string>();
  for (const [i, r] of REGIONS.entries()) {
    const row = await prisma.region.create({ data: { code: r.code, name: r.name, office: r.office, sortOrder: i } });
    regionIds.set(r.code, row.id);
  }
  for (const [i, s] of DEFAULT_STAGES.entries()) {
    await prisma.stageConfig.create({ data: { ...s, sortOrder: i } });
  }
  for (const [i, p] of DEFAULT_PATHWAYS.entries()) {
    await prisma.pathwayConfig.create({ data: { code: p.code, name: p.name, description: p.description, stagesJson: JSON.stringify(p.stages), sortOrder: i } });
  }
  for (const [i, r] of DEFAULT_TYPE_ROUTES.entries()) {
    await prisma.applicationTypeRoute.create({ data: { applicationType: r.applicationType, name: APPLICATION_TYPE_LABELS[r.applicationType], pathwayCode: r.pathwayCode, isNewInstitution: r.isNewInstitution, sortOrder: i } });
  }
  return regionIds;
}

export function regionForState(state: string, regionIds: Map<string, string>): string | null {
  const r = REGIONS.find((x) => x.states.includes(state));
  return r ? regionIds.get(r.code) ?? null : null;
}

type Step =
  | { kind: "advance"; at: number; outcome: string; remarks: string; reference?: string }
  | { kind: "evc"; at: number; visitIn?: number; reportAt?: number; recommendation?: string; scheduledAt?: number }
  | { kind: "return"; message: string }
  | { kind: "close"; at: number; outcome: string };

interface CaseSpec {
  type: keyof typeof APPLICATION_TYPE_LABELS;
  submittedDaysAgo: number;
  programme: string;
  /** Status after preliminary processing (before the engine opens the first stage). */
  status: ApplicationStatus;
  steps: Step[];
  academicYear?: string;
}

interface Background extends CaseSpec {
  code: string;
  name: string;
  category: string;
  state: string;
  city: string;
}

/**
 * Compact demo: further applications for the three story institutions, so one small dataset
 * still shows every part of the workflow (EVC report due, an unscheduled visit escalated after
 * automatic preliminary routing, and last year's closed case whose undertaking is overdue).
 */
const STORY_CASES: (CaseSpec & { institutionCode: string })[] = [
  { institutionCode: "PRV-INST-1055", type: "INCREASE_IN_INTAKE", submittedDaysAgo: 30, programme: "Bachelor of Architecture", status: "REVIEW_REQUIRED",
    steps: [{ kind: "advance", at: -19, outcome: "FORWARDED", remarks: "Scrutiny complete; no open findings. Forwarded to the Expert Visit Committee." }, { kind: "evc", at: -19, scheduledAt: -16, visitIn: -3 }] },
  { institutionCode: "PRV-INST-1081", type: "CHANGE_OF_SITE", submittedDaysAgo: 18, programme: "B.Tech Artificial Intelligence and Data Science", status: "AUTO_PASSED",
    steps: [{ kind: "advance", at: -16, outcome: "AUTO_ROUTED", remarks: "Automated preliminary checks passed with no open findings and issuer verification complete; routed automatically to the next stage of the pathway." }] },
  { institutionCode: "PRV-INST-1027", type: "EXTENSION_OF_APPROVAL", academicYear: "2026-27", submittedDaysAgo: 150, programme: "Master of Business Administration", status: "REVIEW_REQUIRED",
    steps: [{ kind: "advance", at: -138, outcome: "FORWARDED", remarks: "Scrutiny complete; forwarded for authorised review." }, { kind: "close", at: -128, outcome: "SATISFACTORY_FOR_FURTHER_PROCESSING" }] },
];

// Day offsets are relative to the seed time (negative = in the past).
const BACKGROUND: Background[] = [
  { code: "PRV-INST-2001", name: "Aravali Institute of Engineering", category: "Engineering & Technology", state: "Haryana", city: "Gurugram", type: "NEW_INSTITUTION", submittedDaysAgo: 24, programme: "B.Tech Computer Science and Engineering", status: "REVIEW_REQUIRED",
    steps: [{ kind: "advance", at: -15, outcome: "FORWARDED", remarks: "Scrutiny complete; no open findings. Forwarded to the Expert Visit Committee." }, { kind: "evc", at: -15, scheduledAt: -12, visitIn: 6 }] },
  { code: "PRV-INST-2002", name: "Shivalik College of Pharmacy", category: "Pharmacy", state: "Himachal Pradesh", city: "Solan", type: "INCREASE_IN_INTAKE", submittedDaysAgo: 22, programme: "Bachelor of Pharmacy", status: "REVIEW_REQUIRED", steps: [] },
  { code: "PRV-INST-2003", name: "Konkan Institute of Technology", category: "Engineering & Technology", state: "Maharashtra", city: "Ratnagiri", type: "CHANGE_OF_SITE", submittedDaysAgo: 18, programme: "B.Tech Mechanical Engineering", status: "AUTO_PASSED",
    steps: [{ kind: "advance", at: -16, outcome: "AUTO_ROUTED", remarks: "Automated preliminary checks passed with no open findings and issuer verification complete; routed automatically to the next stage of the pathway." }] },
  { code: "PRV-INST-2004", name: "Thar College of Engineering", category: "Engineering & Technology", state: "Rajasthan", city: "Jodhpur", type: "RESTORATION_APPEAL", submittedDaysAgo: 62, programme: "B.Tech Civil Engineering", status: "AUTO_PASSED",
    steps: [{ kind: "advance", at: -60, outcome: "AUTO_ROUTED", remarks: "Automated preliminary checks passed; routed automatically to the next stage of the pathway." }, { kind: "evc", at: -60, scheduledAt: -55, visitIn: -22, reportAt: -18, recommendation: "SATISFACTORY" }] },
  { code: "PRV-INST-2005", name: "Sabarmati Institute of Management", category: "Management", state: "Gujarat", city: "Ahmedabad", type: "EXTENSION_OF_APPROVAL", submittedDaysAgo: 70, programme: "Master of Business Administration", status: "REVIEW_REQUIRED",
    steps: [{ kind: "advance", at: -58, outcome: "FORWARDED", remarks: "Scrutiny complete; forwarded for authorised review." }, { kind: "close", at: -51, outcome: "SATISFACTORY_FOR_FURTHER_PROCESSING" }] },
  { code: "PRV-INST-2006", name: "Godavari Institute of Engineering", category: "Engineering & Technology", state: "Andhra Pradesh", city: "Rajahmundry", type: "NEW_INSTITUTION", submittedDaysAgo: 30, programme: "B.Tech Electrical and Electronics Engineering", status: "REVIEW_REQUIRED",
    steps: [{ kind: "advance", at: -19, outcome: "FORWARDED", remarks: "Scrutiny complete; forwarded to the Expert Visit Committee." }, { kind: "evc", at: -19, scheduledAt: -16, visitIn: -3 }] },
  { code: "PRV-INST-2007", name: "Nilgiri College of Architecture", category: "Architecture", state: "Tamil Nadu", city: "Udhagamandalam", type: "INCREASE_IN_INTAKE", submittedDaysAgo: 58, programme: "Bachelor of Architecture", status: "REVIEW_REQUIRED",
    steps: [{ kind: "advance", at: -46, outcome: "FORWARDED", remarks: "Scrutiny complete; forwarded to the Expert Visit Committee." }, { kind: "evc", at: -46, scheduledAt: -30, visitIn: -12, reportAt: -8, recommendation: "SATISFACTORY" }] },
  { code: "PRV-INST-2008", name: "Malabar Institute of Technology", category: "Engineering & Technology", state: "Kerala", city: "Thrissur", type: "EXTENSION_OF_APPROVAL", submittedDaysAgo: 4, programme: "B.Tech Information Technology", status: "REVIEW_REQUIRED", steps: [] },
  { code: "PRV-INST-2009", name: "Deccan School of Planning", category: "Architecture & Planning", state: "Telangana", city: "Hyderabad", type: "EXTENSION_OF_APPROVAL", submittedDaysAgo: 120, programme: "Bachelor of Planning", status: "REVIEW_REQUIRED",
    steps: [{ kind: "advance", at: -108, outcome: "FORWARDED", remarks: "Scrutiny complete; forwarded for authorised review." }, { kind: "close", at: -95, outcome: "SATISFACTORY_FOR_FURTHER_PROCESSING" }] },
  { code: "PRV-INST-2010", name: "Hooghly Institute of Technology", category: "Engineering & Technology", state: "West Bengal", city: "Howrah", type: "INCREASE_IN_INTAKE", submittedDaysAgo: 19, programme: "B.Tech Electronics and Communication Engineering", status: "REVIEW_REQUIRED",
    steps: [{ kind: "advance", at: -4, outcome: "FORWARDED", remarks: "Scrutiny complete; forwarded to the Expert Visit Committee." }, { kind: "evc", at: -4 }] },
  { code: "PRV-INST-2011", name: "Brahmaputra College of Engineering", category: "Engineering & Technology", state: "Assam", city: "Guwahati", type: "NEW_INSTITUTION", submittedDaysAgo: 27, programme: "B.Tech Civil Engineering", status: "REVIEW_REQUIRED", steps: [] },
  { code: "PRV-INST-2012", name: "Kalinga Polytechnic", category: "Engineering & Technology (Diploma)", state: "Odisha", city: "Bhubaneswar", type: "EXTENSION_OF_APPROVAL", submittedDaysAgo: 12, programme: "Diploma in Mechanical Engineering", status: "REVIEW_REQUIRED",
    steps: [{ kind: "return", message: "The land documents show the lease in the name of the parent society, which is not the applicant society. Submit the registered lease deed or transfer deed in the applicant's name." }] },
  { code: "PRV-INST-2013", name: "Bundelkhand Institute of Pharmacy", category: "Pharmacy", state: "Rajasthan", city: "Kota", type: "EXTENSION_OF_APPROVAL", submittedDaysAgo: 9, programme: "Bachelor of Pharmacy", status: "REVIEW_REQUIRED",
    steps: [{ kind: "advance", at: -2, outcome: "FORWARDED", remarks: "Scrutiny complete; forwarded for authorised review." }] },
];

const day = (now: Date, offset: number) => addDays(now, offset);

type Ctx = { now: Date; staff: Map<string, Actor> };

/** Create one application for an institution and drive it through the stage engine with backdated times. */
async function runCase(c: CaseSpec, inst: { id: string; code: string; name: string; category: string }, applicant: Actor, ctx: Ctx) {
  const { now, staff } = ctx;
  const scrutiny = staff.get("scrutiny@pravah.demo")!;
  const bureau = staff.get("bureau@pravah.demo")!;
  const convenor = staff.get("committee@pravah.demo")!;
  const member = staff.get("committee2@pravah.demo")!;
  const senior = staff.get("senior@pravah.demo")!;
  const tag = inst.code.slice(-4);
  const submitted = day(now, -c.submittedDaysAgo);
  const app = await createApplication(applicant, {
    institutionId: inst.id, templateCode: "EOA", institutionName: inst.name, institutionCode: inst.code, institutionCategory: inst.category, academicYear: c.academicYear ?? ACADEMIC_YEAR,
    contactName: applicant.name, contactEmail: applicant.email, programmes: [{ name: c.programme, level: c.programme.startsWith("Master") ? "PG" : c.programme.startsWith("Diploma") ? "Diploma" : "UG", intake: 60 }],
  }, { createdAt: submitted });
  await prisma.application.update({ where: { id: app.id }, data: { applicationType: c.type, submittedAt: submitted, status: c.status } });
  await prisma.statusChange.create({ data: { applicationId: app.id, fromStatus: "DRAFT", toStatus: c.status, actorLabel: "seed:monitoring-case", reason: "Synthetic case for workflow monitoring (no documents attached).", createdAt: submitted } });

  await prisma.$transaction(async (tx) => {
    const stages = await assignPathway(tx, app.id, { actor: null, at: submitted });
    await openStage(tx, app.id, stages[0], { actor: null, at: submitted }, { note: "on submission", notify: false });
  }, { timeout: 30_000 });

  for (const s of c.steps) {
    if (s.kind === "advance") {
      const cur = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
      const by = cur.currentStage === "SCRUTINY" ? scrutiny : cur.currentStage === "PRELIMINARY" ? null : cur.currentStage === "EVC" ? bureau : senior;
      await prisma.$transaction((tx) => advanceToNextStage(tx, app.id, { actor: by, at: day(now, s.at) }, { outcome: s.outcome, remarks: s.remarks, reference: s.reference ?? null }), { timeout: 30_000 });
      if (by) await prisma.reviewAction.create({ data: { applicationId: app.id, actorId: by.userId, actorName: by.name, actorRole: by.role, action: "FORWARD", outcome: s.outcome, reason: s.remarks, createdAt: day(now, s.at) } });
    } else if (s.kind === "evc") {
      const visit = await prisma.evcVisit.findFirstOrThrow({ where: { applicationId: app.id, status: "AWAITING_SCHEDULE" } });
      if (s.scheduledAt === undefined) continue;
      await prisma.evcVisit.update({ where: { id: visit.id }, data: { status: "SCHEDULED", visitDate: day(now, s.visitIn ?? 7), convenorId: convenor.userId, convenorName: convenor.name, committeeJson: JSON.stringify([convenor.name, member.name]), scheduledById: bureau.userId, scheduledByName: bureau.name, scheduledAt: day(now, s.scheduledAt) } });
      if (s.reportAt !== undefined) {
        await prisma.evcVisit.update({ where: { id: visit.id }, data: { status: "REPORT_SUBMITTED", recommendation: s.recommendation ?? "SATISFACTORY", reportSummary: "Infrastructure, laboratories and faculty records were seen and found broadly in line with the application. Minor observations noted for the institution (synthetic report).", reportReference: `EVC/${tag}/2026`, reportSubmittedAt: day(now, s.reportAt) } });
        await prisma.$transaction((tx) => advanceToNextStage(tx, app.id, { actor: convenor, at: day(now, s.reportAt!) }, { outcome: "EVC_SATISFACTORY", remarks: "EVC report submitted: satisfactory.", reference: `EVC/${tag}/2026` }), { timeout: 30_000 });
      }
    } else if (s.kind === "return") {
      await returnForDeficiencies(scrutiny, app.id, s.message);
    } else if (s.kind === "close") {
      await prisma.$transaction(async (tx) => {
        await advanceToNextStage(tx, app.id, { actor: senior, at: day(now, s.at) }, { outcome: "DECIDED", remarks: "Outcome recorded by the competent authority.", reference: `DEMO/DEC/${tag}` });
        await transitionStatus(tx, app.id, "CLOSED", { actor: senior, reason: "Outcome recorded (synthetic case)." });
        await tx.reviewAction.create({ data: { applicationId: app.id, actorId: senior.userId, actorName: senior.name, actorRole: senior.role, action: "DECISION", outcome: s.outcome, reason: "Scrutiny complete with no open findings; outcome recorded for the demo record.", reference: `DEMO/DEC/${tag}`, createdAt: day(now, s.at) } });
      }, { timeout: 30_000 });
    }
  }
  return app;
}

/** Background institutions, one case each (DEMO_DATASET=full, used by the automated tests). */
export async function seedBackgroundCases(opts: { now: Date; regionIds: Map<string, string>; staff: Map<string, Actor> }) {
  const institutionIds = new Map<string, string>();
  for (const b of BACKGROUND) {
    const inst = await prisma.institution.create({ data: { code: b.code, name: b.name, category: b.category, state: b.state, city: b.city, establishedYear: b.type === "NEW_INSTITUTION" ? 2026 : 2012, regionId: regionForState(b.state, opts.regionIds), programmes: { create: [{ name: b.programme, level: b.category.includes("Diploma") ? "Diploma" : b.programme.startsWith("Master") ? "PG" : "UG", approvedIntake: b.type === "NEW_INSTITUTION" ? 0 : 60, lastApprovedYear: b.type === "NEW_INSTITUTION" ? "N/A (new)" : "2026-27" }] } } });
    institutionIds.set(b.code, inst.id);
    const user = await prisma.user.create({ data: { email: `applicant.${b.code.slice(-4)}@pravah.demo`, name: `Principal, ${b.name}`, role: "APPLICANT", designation: `Authorised contact, ${b.name}`, institutionId: inst.id, passwordHash: await hashPassword(DEMO_PASSWORD) } });
    await runCase(b, inst, toActor(user), opts);
  }
  return institutionIds;
}

/**
 * Compact demo (default): extra applications for the three story institutions, and their
 * current scrutiny stages backdated so pendency, reminders and escalation have something to show.
 */
export async function seedStoryCases(opts: { now: Date; staff: Map<string, Actor> }) {
  for (const c of STORY_CASES) {
    const inst = await prisma.institution.findUniqueOrThrow({ where: { code: c.institutionCode } });
    const user = await prisma.user.findFirstOrThrow({ where: { institutionId: inst.id, role: "APPLICANT" } });
    const app = await runCase(c, inst, toActor(user), opts);
    if (c.academicYear === "2026-27") {
      // Last year's approval carried a time-bound condition that has not been met.
      const bureau = opts.staff.get("bureau@pravah.demo")!;
      await prisma.complianceItem.create({ data: { institutionId: inst.id, applicationId: app.id, kind: "UNDERTAKING", typeCode: "FACULTY_RECRUITMENT", title: "Appoint four regular faculty for the MBA programme", description: "Condition recorded with last year's outcome: appoint four regular faculty and submit appointment orders and joining reports.", dueDate: day(opts.now, -10), createdAt: day(opts.now, -128), createdById: bureau.userId, createdByName: bureau.name } });
    }
  }
  // The story applications were scrutinised "today"; place them earlier in their timelines.
  for (const [code, daysAgo] of [["PRV-INST-1027", 20], ["PRV-INST-1055", 6]] as const) {
    const stage = await prisma.stageInstance.findFirst({ where: { status: "ACTIVE", stageCode: "SCRUTINY", application: { institutionCode: code, academicYear: ACADEMIC_YEAR } } });
    if (!stage) continue;
    const enteredAt = day(opts.now, -daysAgo);
    await prisma.stageInstance.update({ where: { id: stage.id }, data: { enteredAt, dueAt: addDays(enteredAt, Math.round((stage.dueAt.getTime() - stage.enteredAt.getTime()) / 86_400_000)) } });
  }
}

/** Undertakings and document validity items in every state (due soon, overdue, submitted, closed). */
export async function seedComplianceItems(opts: { now: Date; institutionIds: Map<string, string>; staff: Map<string, Actor> }) {
  const { now, institutionIds, staff } = opts;
  const bureau = staff.get("bureau@pravah.demo")!;
  const app = async (instId: string) => prisma.application.findFirst({ where: { institutionId: instId }, orderBy: { createdAt: "desc" }, select: { id: true } });
  const by = { createdById: bureau.userId, createdByName: bureau.name };
  const make = async (code: string, item: { kind: "UNDERTAKING" | "DOCUMENT_VALIDITY"; typeCode: string; title: string; description: string; reference?: string; due: number; createdAgo: number }) => {
    const instId = institutionIds.get(code);
    if (!instId) return null;
    const a = await app(instId);
    return prisma.complianceItem.create({ data: { institutionId: instId, applicationId: a?.id ?? null, kind: item.kind, typeCode: item.typeCode, title: item.title, description: item.description, reference: item.reference ?? null, dueDate: day(now, item.due), createdAt: day(now, -item.createdAgo), ...by } });
  };

  // Story institutions: Greenfield can renew its lease deed online; Northfield has evidence awaiting verification.
  await make("PRV-INST-1081", { kind: "DOCUMENT_VALIDITY", typeCode: "LEASE_DEED", title: "Lease deed — campus land", description: "Registered lease deed for the campus land. Upload the renewed or extended deed before it expires.", reference: "DEMO/LEASE/TN/2011/0418", due: 25, createdAgo: 200 });
  await make("PRV-INST-1081", { kind: "DOCUMENT_VALIDITY", typeCode: "FIRE_NOC", title: "Fire safety NOC", description: "Fire & building safety NOC for the academic block.", reference: "DSFBSA/NOC/2026/1081", due: 290, createdAgo: 60 });
  const und = await make("PRV-INST-1055", { kind: "UNDERTAKING", typeCode: "FACULTY_RECRUITMENT", title: "Appoint two additional faculty for B.Arch", description: "Undertaking to appoint two regular faculty members and submit appointment orders and joining reports.", due: 12, createdAgo: 80 });
  if (und) {
    const { buffer } = await renderDoc({ file: "northfield-faculty-appointments.pdf", category: "OTHER", issuer: "Northfield School of Architecture", title: "Faculty Appointment Orders (Synthetic)", fields: [["Institution ID", "PRV-INST-1055"], ["Appointments", "2 regular faculty (Architecture)"], ["Date of Issue", "15/10/2026"]], body: "Appointment orders and joining reports of two regular faculty members, submitted against the undertaking. Synthetic document for demonstration.", signedBy: "Principal, Northfield School of Architecture", created: "2026-10-15T09:00:00Z" });
    const key = await saveFile(buffer);
    const applicant = await prisma.user.findFirst({ where: { institutionId: und.institutionId, role: "APPLICANT" } });
    await prisma.complianceSubmission.create({ data: { itemId: und.id, fileName: "northfield-faculty-appointments.pdf", mimeType: "application/pdf", sizeBytes: buffer.length, sha256: sha256(buffer), storageKey: key, note: "Two regular faculty appointed; appointment orders and joining reports attached.", submittedById: applicant?.id ?? bureau.userId, submittedByName: applicant?.name ?? "Institution", submittedAt: day(now, -2) } });
    await prisma.complianceItem.update({ where: { id: und.id }, data: { status: "SUBMITTED" } });
  }
  await make("PRV-INST-1027", { kind: "DOCUMENT_VALIDITY", typeCode: "OCCUPANCY_CERTIFICATE", title: "Occupancy certificate — new hostel block", description: "Occupancy certificate from the local authority for the hostel block.", reference: "DEMO/OC/GJ/2021/0077", due: 48, createdAgo: 300 });

  // Background institutions across Regions.
  await make("PRV-INST-2005", { kind: "DOCUMENT_VALIDITY", typeCode: "LEASE_DEED", title: "Lease deed — campus land", description: "Registered lease deed for the campus land.", reference: "DEMO/LEASE/GJ/2006/0193", due: 40, createdAgo: 51 });
  await make("PRV-INST-2005", { kind: "UNDERTAKING", typeCode: "LAB_LIBRARY", title: "Complete the second computer laboratory", description: "Undertaking to commission the second computer laboratory and submit photographs and the completion certificate.", due: 75, createdAgo: 51 });
  await make("PRV-INST-2009", { kind: "UNDERTAKING", typeCode: "FACULTY_RECRUITMENT", title: "Fill the faculty shortfall in Planning", description: "Undertaking to fill the faculty shortfall and submit appointment orders.", due: -10, createdAgo: 95 });
  await make("PRV-INST-2009", { kind: "DOCUMENT_VALIDITY", typeCode: "FIRE_NOC", title: "Fire safety NOC", description: "Fire & building safety NOC for the main building.", reference: "DSFBSA/NOC/2025/2009", due: -35, createdAgo: 95 });
  await make("PRV-INST-2012", { kind: "DOCUMENT_VALIDITY", typeCode: "BUILDING_STABILITY", title: "Structural stability certificate", description: "Structural stability certificate from a registered structural engineer.", reference: "DEMO/BSC/OD/2023/0311", due: 9, createdAgo: 400 });
  await make("PRV-INST-2004", { kind: "DOCUMENT_VALIDITY", typeCode: "ACCREDITATION", title: "Programme accreditation — Civil Engineering", description: "Accreditation certificate for B.Tech Civil Engineering.", reference: "DNAR/ACC/2023/2004", due: 130, createdAgo: 60 });
  const closed = await make("PRV-INST-2005", { kind: "UNDERTAKING", typeCode: "OTHER_CONDITION", title: "Display mandatory disclosures on the website", description: "Undertaking to publish mandatory disclosures on the institution website.", due: -20, createdAgo: 51 });
  if (closed) await prisma.complianceItem.update({ where: { id: closed.id }, data: { status: "FULFILLED", closedAt: day(now, -24), closedNote: "Verified on the institution website; screenshots on record." } });
}

/** Raise the initial reminders, overdue alerts and escalations for the backdated data. */
export async function seedAlerts(now: Date) {
  return runAlertSweep(null, now);
}

