// Approval workflow vocabulary and pure routing logic (PS 26262). The stage list, the
// pathways and the timelines are SAMPLE configuration, editable by the administrator under
// Workflow & Timelines. They are not values taken from the Approval Process Handbook (APH);
// configure them per the applicable APH before any real use.
import type { Role } from "@/lib/domain";

/** Configurable processing stages. PRELIMINARY is the automatic check step used by pathways
 *  that have no scrutiny desk (e.g. Only EVC); DECISION is always the last stage. */
export const STAGE_CODES = ["PRELIMINARY", "SCRUTINY", "EVC", "SAC_SHC", "DECISION"] as const;
export type StageCode = (typeof STAGE_CODES)[number];

export const STAGE_LABELS: Record<StageCode, string> = {
  PRELIMINARY: "Preliminary checks",
  SCRUTINY: "Scrutiny",
  EVC: "Expert Visit Committee",
  SAC_SHC: "SAC / SHC",
  DECISION: "Competent authority",
};
export const STAGE_SHORT: Record<StageCode, string> = { PRELIMINARY: "Prelim.", SCRUTINY: "Scrutiny", EVC: "EVC", SAC_SHC: "SAC/SHC", DECISION: "Decision" };

/** Where an application is when it is not at a processing stage. */
export const OFF_STAGE = { RETURNED: "RETURNED", CLOSED: "CLOSED" } as const;
export const OFF_STAGE_LABELS: Record<string, string> = { RETURNED: "With institution (rectification)", CLOSED: "Closed" };

export function stageLabel(code: string | null | undefined, attempt = 1): string {
  if (!code) return "Not submitted";
  if (code === "SCRUTINY" && attempt > 1) return "Re-scrutiny";
  return STAGE_LABELS[code as StageCode] ?? OFF_STAGE_LABELS[code] ?? code;
}

export const APPLICATION_TYPES = ["NEW_INSTITUTION", "EXTENSION_OF_APPROVAL", "INCREASE_IN_INTAKE", "CHANGE_OF_SITE", "RESTORATION_APPEAL"] as const;
export type ApplicationType = (typeof APPLICATION_TYPES)[number];
export const APPLICATION_TYPE_LABELS: Record<ApplicationType, string> = {
  NEW_INSTITUTION: "New institution",
  EXTENSION_OF_APPROVAL: "Extension of approval",
  INCREASE_IN_INTAKE: "Increase in intake / new programme",
  CHANGE_OF_SITE: "Change of site / relocation",
  RESTORATION_APPEAL: "Restoration / appeal",
};
export function applicationTypeLabel(t: string): string {
  return APPLICATION_TYPE_LABELS[t as ApplicationType] ?? t;
}

export interface StageDefaults {
  code: StageCode;
  name: string;
  description: string;
  responsibleRole: Role;
  slaDays: number;
  newInstitutionSlaDays: number | null;
  reminderDaysBefore: number;
  escalateL2AfterDays: number;
  escalateL3AfterDays: number;
}

/** Sample timelines used to seed StageConfig. */
export const DEFAULT_STAGES: StageDefaults[] = [
  { code: "PRELIMINARY", name: STAGE_LABELS.PRELIMINARY, description: "Automated document checks and issuer verification before routing to the first committee stage (pathways without a scrutiny desk).", responsibleRole: "SCRUTINY_OFFICER", slaDays: 5, newInstitutionSlaDays: null, reminderDaysBefore: 2, escalateL2AfterDays: 2, escalateL3AfterDays: 7 },
  { code: "SCRUTINY", name: STAGE_LABELS.SCRUTINY, description: "Regional office scrutiny (and re-scrutiny after a rectification) of documents and findings.", responsibleRole: "SCRUTINY_OFFICER", slaDays: 15, newInstitutionSlaDays: 10, reminderDaysBefore: 3, escalateL2AfterDays: 3, escalateL3AfterDays: 10 },
  { code: "EVC", name: STAGE_LABELS.EVC, description: "Expert Visit Committee: schedule the visit, conduct it and submit the report.", responsibleRole: "BUREAU_OFFICER", slaDays: 30, newInstitutionSlaDays: 21, reminderDaysBefore: 5, escalateL2AfterDays: 3, escalateL3AfterDays: 10 },
  { code: "SAC_SHC", name: STAGE_LABELS.SAC_SHC, description: "Standing Appellate Committee / Standing Hearing Committee consideration.", responsibleRole: "COMMITTEE_MEMBER", slaDays: 21, newInstitutionSlaDays: null, reminderDaysBefore: 5, escalateL2AfterDays: 5, escalateL3AfterDays: 15 },
  { code: "DECISION", name: STAGE_LABELS.DECISION, description: "Recorded outcome by the competent authority.", responsibleRole: "SENIOR_OFFICIAL", slaDays: 10, newInstitutionSlaDays: null, reminderDaysBefore: 3, escalateL2AfterDays: 3, escalateL3AfterDays: 7 },
];

export interface PathwayDefaults { code: string; name: string; description: string; stages: StageCode[] }

/** Stage combinations named in PS 26262 (the PRELIMINARY step is added automatically). */
export const DEFAULT_PATHWAYS: PathwayDefaults[] = [
  { code: "SCRUTINY_ONLY", name: "Only Scrutiny", description: "Scrutiny, then the competent authority.", stages: ["SCRUTINY", "DECISION"] },
  { code: "SCRUTINY_EVC", name: "Scrutiny + EVC", description: "Scrutiny, an Expert Visit Committee, then the competent authority.", stages: ["SCRUTINY", "EVC", "DECISION"] },
  { code: "SCRUTINY_EVC_SAC", name: "Scrutiny + EVC + SAC/SHC", description: "Scrutiny, an Expert Visit Committee, the SAC/SHC, then the competent authority.", stages: ["SCRUTINY", "EVC", "SAC_SHC", "DECISION"] },
  { code: "EVC_SAC", name: "EVC + SAC/SHC", description: "Preliminary checks, an Expert Visit Committee, the SAC/SHC, then the competent authority.", stages: ["EVC", "SAC_SHC", "DECISION"] },
  { code: "EVC_ONLY", name: "Only EVC", description: "Preliminary checks, an Expert Visit Committee, then the competent authority.", stages: ["EVC", "DECISION"] },
];

/** Sample application-type → pathway mapping (configure per the applicable APH). */
export const DEFAULT_TYPE_ROUTES: { applicationType: ApplicationType; pathwayCode: string; isNewInstitution: boolean }[] = [
  { applicationType: "NEW_INSTITUTION", pathwayCode: "SCRUTINY_EVC", isNewInstitution: true },
  { applicationType: "EXTENSION_OF_APPROVAL", pathwayCode: "SCRUTINY_ONLY", isNewInstitution: false },
  { applicationType: "INCREASE_IN_INTAKE", pathwayCode: "SCRUTINY_EVC", isNewInstitution: false },
  { applicationType: "CHANGE_OF_SITE", pathwayCode: "EVC_ONLY", isNewInstitution: false },
  { applicationType: "RESTORATION_APPEAL", pathwayCode: "EVC_SAC", isNewInstitution: false },
];

/** The full ordered stage list an application walks through, including the implicit
 *  PRELIMINARY step for pathways without a scrutiny desk. */
export function effectiveStages(pathwayStages: string[]): StageCode[] {
  const stages = pathwayStages.filter((s): s is StageCode => (STAGE_CODES as readonly string[]).includes(s));
  if (!stages.includes("DECISION")) stages.push("DECISION");
  return stages[0] === "SCRUTINY" ? stages : ["PRELIMINARY", ...stages.filter((s) => s !== "PRELIMINARY")];
}

export interface StageVisit { stageCode: string; status: "ACTIVE" | "COMPLETED" | "RETURNED" }

/**
 * The stage that follows `from`: the first later stage of the pathway that has not been
 * completed yet. A stage completed earlier is not repeated after a return (e.g. an EVC that was
 * completed before the competent authority returned the application is not visited again).
 */
export function nextStage(stages: StageCode[], from: StageCode, history: StageVisit[]): StageCode | null {
  const done = new Set(history.filter((h) => h.status === "COMPLETED").map((h) => h.stageCode));
  const start = stages.indexOf(from);
  for (let i = start + 1; i < stages.length; i++) if (!done.has(stages[i])) return stages[i];
  return null;
}

/** The stage an application re-enters after the institution submits its rectification:
 *  re-scrutiny when the pathway has a scrutiny desk, otherwise preliminary checks. */
export function reentryStage(stages: StageCode[]): StageCode {
  return stages.includes("SCRUTINY") ? "SCRUTINY" : "PRELIMINARY";
}

/** Earlier stages an authorised official may revert an application to. */
export function revertTargets(stages: StageCode[], current: string | null): StageCode[] {
  const i = stages.indexOf(current as StageCode);
  return i <= 0 ? [] : stages.slice(0, i).filter((s) => s !== "PRELIMINARY");
}

export const DAY_MS = 86_400_000;

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** Whole days from a to b (negative if b is earlier). */
export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / DAY_MS);
}

export type DueState = "ON_TRACK" | "DUE_SOON" | "OVERDUE";
export const DUE_STATE_LABELS: Record<DueState, string> = { ON_TRACK: "On track", DUE_SOON: "Due soon", OVERDUE: "Overdue" };

export function dueState(dueAt: Date, now: Date, warnDays: number): DueState {
  if (now.getTime() > dueAt.getTime()) return "OVERDUE";
  return dueAt.getTime() - now.getTime() <= warnDays * DAY_MS ? "DUE_SOON" : "ON_TRACK";
}

export const AGE_BUCKETS = [
  { key: "0-7", label: "0–7 days", max: 7 },
  { key: "8-15", label: "8–15 days", max: 15 },
  { key: "16-30", label: "16–30 days", max: 30 },
  { key: "31+", label: "Over 30 days", max: Infinity },
] as const;
export function ageBucket(days: number): (typeof AGE_BUCKETS)[number]["key"] {
  return AGE_BUCKETS.find((b) => days <= b.max)!.key;
}

/** Escalation ladder: level 1 is the responsible role, then the Bureau, then the competent authority. */
export function escalationChain(responsible: Role): Role[] {
  return (["BUREAU_OFFICER", "SENIOR_OFFICIAL"] as Role[]).filter((r) => r !== responsible);
}

// --- EVC and committees ----------------------------------------------------------------------
export const EVC_RECOMMENDATIONS = {
  SATISFACTORY: "Satisfactory — recommended for further processing",
  DEFICIENCIES: "Deficiencies observed — return to institution",
  NOT_SATISFACTORY: "Not satisfactory — refer to the next authority",
} as const;
export type EvcRecommendation = keyof typeof EVC_RECOMMENDATIONS;

export const COMMITTEE_OUTCOMES = {
  RECOMMENDED: "Recommended for further processing",
  NOT_RECOMMENDED: "Not recommended — refer to the competent authority",
  RETURN_FOR_DEFICIENCY: "Return to institution for deficiencies",
} as const;
export type CommitteeOutcome = keyof typeof COMMITTEE_OUTCOMES;

export const EVC_STATUS_LABELS: Record<string, string> = {
  AWAITING_SCHEDULE: "Awaiting scheduling",
  SCHEDULED: "Scheduled",
  REPORT_SUBMITTED: "Report submitted",
  CANCELLED: "Cancelled",
};

// --- Institutional compliance ----------------------------------------------------------------
export const UNDERTAKING_TYPES: Record<string, string> = {
  FACULTY_RECRUITMENT: "Faculty recruitment as per norms",
  LAND_CONVERSION: "Land use conversion",
  BUILDING_COMPLETION: "Completion of building / occupancy",
  LAB_LIBRARY: "Laboratory and library completion",
  ACCREDITATION_APPLICATION: "Apply for programme accreditation",
  OTHER_CONDITION: "Other approval condition",
};
export const DOCUMENT_VALIDITY_TYPES: Record<string, string> = {
  LEASE_DEED: "Lease deed",
  FIRE_NOC: "Fire safety NOC",
  BUILDING_STABILITY: "Building stability certificate",
  OCCUPANCY_CERTIFICATE: "Occupancy certificate",
  ACCREDITATION: "Accreditation certificate",
};
export function complianceTypeLabel(code: string): string {
  return UNDERTAKING_TYPES[code] ?? DOCUMENT_VALIDITY_TYPES[code] ?? code;
}

export const COMPLIANCE_STATUS_LABELS: Record<string, string> = { OPEN: "Open", SUBMITTED: "Submitted — awaiting verification", FULFILLED: "Fulfilled (verified)", WAIVED: "Waived" };

// --- Alerts --------------------------------------------------------------------------------
export const ALERT_KIND_LABELS: Record<string, string> = { REMINDER: "Reminder", OVERDUE: "Overdue", ESCALATION: "Escalation" };
export const ALERT_SUBJECT_LABELS: Record<string, string> = { STAGE: "Processing stage", EVC: "Expert visit", UNDERTAKING: "Undertaking", DOCUMENT: "Document validity", FINDING: "Finding" };
