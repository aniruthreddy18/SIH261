// Alert and escalation engine (PS 26262 §F). A sweep evaluates every open deadline — stage
// timelines, EVC scheduling and reports, time-bound undertakings and document validity — and
// raises reminders before the due date, overdue alerts after it, and escalations up the ladder
// (responsible officer → Approval Bureau → competent authority). Each alert has a dedupe key, so
// running the sweep again never repeats an alert; alerts whose subject has been dealt with are
// marked resolved. Alerts support the process — they never take a regulatory decision.
import type { Actor } from "@/lib/auth/permissions";
import { assertPermission, DomainError, NotFoundError } from "@/lib/auth/permissions";
import { ACTIVE_FINDING_STATUSES, type Role, type Severity } from "@/lib/domain";
import { daysBetween, escalationChain, stageLabel, complianceTypeLabel, type StageCode } from "@/lib/workflow/stages";
import { prisma } from "./db";
import { recordAudit, SYSTEM } from "./audit";
import { notifyUsers, staffForRegion } from "./notifications";
import { getSettings } from "./settings";
import { loadStageConfigs } from "./stage-engine";

interface Raise {
  kind: "REMINDER" | "OVERDUE" | "ESCALATION";
  subjectType: "STAGE" | "EVC" | "UNDERTAKING" | "DOCUMENT" | "FINDING";
  subjectId: string;
  dedupeKey: string;
  level: number;
  title: string;
  body: string;
  link: string;
  severity: Severity;
  applicationId?: string | null;
  institutionId?: string | null;
  regionId?: string | null;
  /** Staff roles to notify (Region-scoped). */
  roles?: Role[];
  /** Specific users to notify (e.g. the EVC convenor). */
  userIds?: string[];
  /** Also notify the institution's own users. */
  institution?: boolean;
}

const fmt = (d: Date) => d.toISOString().slice(0, 10);

/** Create the alert once (by dedupe key) and fan it out as in-app notifications. */
async function raise(r: Raise, now: Date): Promise<boolean> {
  if (await prisma.alert.findUnique({ where: { dedupeKey: r.dedupeKey } })) return false;
  const users = new Set<string>(r.userIds ?? []);
  if (r.roles?.length) for (const id of await staffForRegion(r.roles, r.regionId ?? null)) users.add(id);
  const instUsers = r.institution && r.institutionId ? await prisma.user.findMany({ where: { institutionId: r.institutionId, role: "APPLICANT", active: true }, select: { id: true } }) : [];
  try {
    await prisma.$transaction(async (tx) => {
      await tx.alert.create({ data: { kind: r.kind, subjectType: r.subjectType, subjectId: r.subjectId, applicationId: r.applicationId ?? null, institutionId: r.institutionId ?? null, regionId: r.regionId ?? null, level: r.level, title: r.title, body: r.body, link: r.link, severity: r.severity, dedupeKey: r.dedupeKey, recipients: users.size + instUsers.length, recipientRoles: [...(r.roles ?? []), ...(r.institution ? ["INSTITUTION"] : []), ...(r.userIds?.length ? ["ASSIGNEE"] : [])].join(","), createdAt: now } });
      const n = { type: `ALERT_${r.kind}`, title: r.title, body: r.body, link: r.link, severity: r.severity, dedupeKey: r.dedupeKey };
      await notifyUsers([...users], n, tx);
      // Institution users open the same subject in their own portal.
      if (instUsers.length) await notifyUsers(instUsers.map((u) => u.id), { ...n, link: r.subjectType === "UNDERTAKING" || r.subjectType === "DOCUMENT" ? `/portal/compliance/${r.subjectId}` : r.applicationId ? `/portal/applications/${r.applicationId}` : "/portal" }, tx);
      await recordAudit({ actor: SYSTEM.alerts, eventType: r.kind === "ESCALATION" ? "ESCALATION_RAISED" : "ALERT_RAISED", action: `${r.kind === "ESCALATION" ? `Escalation level ${r.level}` : r.kind === "OVERDUE" ? "Overdue alert" : "Reminder"}: ${r.title}`, applicationId: r.applicationId ?? null, after: { subject: `${r.subjectType}:${r.subjectId}`, recipients: users.size + instUsers.length, roles: r.roles ?? [] } }, tx);
    });
  } catch (err) {
    // A concurrent sweep raised the same alert first.
    if ((err as { code?: string }).code === "P2002") return false;
    throw err;
  }
  return true;
}

/** Escalation levels reached after `overdueDays`, given the thresholds for level 2 and 3. */
function escalationLevels(overdueDays: number, l2: number, l3: number): number[] {
  const out: number[] = [];
  if (overdueDays >= l2) out.push(2);
  if (overdueDays >= l3) out.push(3);
  return out;
}

export interface SweepResult { raised: number; reminders: number; overdue: number; escalations: number; resolved: number; checked: { stages: number; evc: number; undertakings: number; documents: number } }

export async function runAlertSweep(actor: Actor | null, now: Date = new Date()): Promise<SweepResult> {
  if (actor) assertPermission(actor, "alerts.run");
  const [settings, configs] = await Promise.all([getSettings(), loadStageConfigs()]);
  const res: SweepResult = { raised: 0, reminders: 0, overdue: 0, escalations: 0, resolved: 0, checked: { stages: 0, evc: 0, undertakings: 0, documents: 0 } };
  const count = async (r: Raise) => {
    if (await raise(r, now)) {
      res.raised++;
      if (r.kind === "REMINDER") res.reminders++;
      else if (r.kind === "OVERDUE") res.overdue++;
      else res.escalations++;
    }
  };

  // 1. Processing stages (application ageing against the stage timeline).
  const stages = await prisma.stageInstance.findMany({ where: { status: "ACTIVE" }, include: { application: { select: { id: true, reference: true, institutionName: true, institutionId: true, institution: { select: { regionId: true } } } } } });
  res.checked.stages = stages.length;
  for (const s of stages) {
    const cfg = configs.get(s.stageCode as StageCode);
    if (!cfg) continue;
    const a = s.application;
    const label = stageLabel(s.stageCode, s.attempt);
    const base = { subjectType: "STAGE" as const, subjectId: s.id, applicationId: a.id, institutionId: a.institutionId, regionId: a.institution.regionId, link: `/applications/${a.id}?tab=workflow` };
    const responsible = cfg.responsibleRole as Role;
    const daysLeft = daysBetween(now, s.dueAt);
    if (now <= s.dueAt) {
      if (daysLeft <= cfg.reminderDaysBefore) await count({ ...base, kind: "REMINDER", level: 1, dedupeKey: `stage:${s.id}:reminder`, title: `${label} due ${daysLeft <= 0 ? "today" : `in ${daysLeft} day(s)`}: ${a.reference}`, body: `${a.institutionName} — complete the ${label.toLowerCase()} stage by ${fmt(s.dueAt)}.`, severity: "MEDIUM", roles: [responsible] });
      continue;
    }
    const overdueDays = daysBetween(s.dueAt, now);
    await count({ ...base, kind: "OVERDUE", level: 1, dedupeKey: `stage:${s.id}:overdue`, title: `${label} overdue: ${a.reference}`, body: `${a.institutionName} — the ${label.toLowerCase()} timeline ended on ${fmt(s.dueAt)} (${overdueDays} day(s) ago).`, severity: "HIGH", roles: [responsible] });
    const chain = escalationChain(responsible);
    for (const level of escalationLevels(overdueDays, cfg.escalateL2AfterDays, cfg.escalateL3AfterDays)) {
      const to = chain[level - 2];
      if (!to) continue;
      await count({ ...base, kind: "ESCALATION", level, dedupeKey: `stage:${s.id}:esc${level}`, title: `Escalated (level ${level}): ${label} overdue ${overdueDays} day(s) — ${a.reference}`, body: `${a.institutionName} has been at ${label.toLowerCase()} since ${fmt(s.enteredAt)}; due ${fmt(s.dueAt)}. Responsible: ${responsible.replace(/_/g, " ").toLowerCase()}.`, severity: level === 3 ? "CRITICAL" : "HIGH", roles: [to] });
      if (s.escalationLevel < level) await prisma.stageInstance.update({ where: { id: s.id }, data: { escalationLevel: level } });
    }
  }

  // 2. Expert visits: scheduling deadline, visit intimation, report after the visit.
  const visits = await prisma.evcVisit.findMany({ where: { status: { in: ["AWAITING_SCHEDULE", "SCHEDULED"] } }, include: { application: { select: { id: true, reference: true, institutionName: true, institutionId: true, institution: { select: { regionId: true } } } } } });
  res.checked.evc = visits.length;
  for (const v of visits) {
    const a = v.application;
    const base = { subjectType: "EVC" as const, subjectId: v.id, applicationId: a.id, institutionId: a.institutionId, regionId: a.institution.regionId, link: `/evc` };
    if (v.status === "AWAITING_SCHEDULE") {
      const left = daysBetween(now, v.scheduleBy);
      if (now <= v.scheduleBy) {
        if (left <= 2) await count({ ...base, kind: "REMINDER", level: 1, dedupeKey: `evc:${v.id}:schedule-reminder`, title: `Schedule the expert visit by ${fmt(v.scheduleBy)}: ${a.reference}`, body: `${a.institutionName} is in the EVC queue and has no visit date yet.`, severity: "MEDIUM", roles: ["BUREAU_OFFICER", "SCRUTINY_OFFICER"] });
      } else {
        const late = daysBetween(v.scheduleBy, now);
        await count({ ...base, kind: "OVERDUE", level: 1, dedupeKey: `evc:${v.id}:schedule-overdue`, title: `Expert visit not scheduled (${late} day(s) late): ${a.reference}`, body: `${a.institutionName} — the visit should have been scheduled by ${fmt(v.scheduleBy)}.`, severity: "HIGH", roles: ["BUREAU_OFFICER", "SCRUTINY_OFFICER"] });
        if (late >= 3) await count({ ...base, kind: "ESCALATION", level: 3, dedupeKey: `evc:${v.id}:schedule-esc3`, title: `Escalated: expert visit unscheduled for ${late} day(s) — ${a.reference}`, body: `${a.institutionName} — EVC scheduling deadline was ${fmt(v.scheduleBy)}.`, severity: "CRITICAL", roles: ["SENIOR_OFFICIAL"] });
      }
    } else if (v.visitDate) {
      const toVisit = daysBetween(now, v.visitDate);
      if (toVisit >= 0 && toVisit <= settings.evcVisitReminderDays) {
        await count({ ...base, kind: "REMINDER", level: 1, dedupeKey: `evc:${v.id}:${fmt(v.visitDate)}:visit-reminder`, title: `Expert visit on ${fmt(v.visitDate)}: ${a.reference}`, body: `${a.institutionName} — committee visit ${toVisit === 0 ? "today" : `in ${toVisit} day(s)`}.`, severity: "MEDIUM", userIds: v.convenorId ? [v.convenorId] : [], institution: true });
      }
      const reportDue = new Date(v.visitDate.getTime() + settings.evcReportWithinDays * 86_400_000);
      if (now > reportDue) {
        const late = daysBetween(reportDue, now);
        await count({ ...base, kind: "OVERDUE", level: 1, dedupeKey: `evc:${v.id}:${fmt(v.visitDate)}:report-overdue`, title: `EVC report overdue (${late} day(s)): ${a.reference}`, body: `${a.institutionName} — visit on ${fmt(v.visitDate)}; the report was due by ${fmt(reportDue)}.`, severity: "HIGH", userIds: v.convenorId ? [v.convenorId] : [], roles: ["BUREAU_OFFICER"] });
        if (late >= 5) await count({ ...base, kind: "ESCALATION", level: 3, dedupeKey: `evc:${v.id}:${fmt(v.visitDate)}:report-esc3`, title: `Escalated: EVC report ${late} day(s) late — ${a.reference}`, body: `${a.institutionName} — convenor ${v.convenorName ?? "unassigned"}.`, severity: "CRITICAL", roles: ["SENIOR_OFFICIAL"] });
      }
    }
  }

  // 3–4. Undertakings and document validity.
  const items = await prisma.complianceItem.findMany({ where: { status: { in: ["OPEN", "SUBMITTED"] } }, include: { institution: { select: { id: true, name: true, regionId: true } }, submissions: { where: { review: "PENDING" }, orderBy: { submittedAt: "desc" }, take: 1 } } });
  for (const i of items) {
    const isDoc = i.kind === "DOCUMENT_VALIDITY";
    if (isDoc) res.checked.documents++;
    else res.checked.undertakings++;
    const subjectType = isDoc ? ("DOCUMENT" as const) : ("UNDERTAKING" as const);
    const due = fmt(i.dueDate);
    const what = isDoc ? `${complianceTypeLabel(i.typeCode)}${i.reference ? ` ${i.reference}` : ""}` : i.title;
    const base = { subjectType, subjectId: i.id, applicationId: i.applicationId, institutionId: i.institutionId, regionId: i.institution.regionId, link: `/compliance-monitor/${i.id}` };
    // Keys include the due date, so a renewed document starts a fresh alert cycle.
    const key = `${isDoc ? "doc" : "und"}:${i.id}:${due}`;
    if (i.status === "SUBMITTED") {
      const sub = i.submissions[0];
      if (sub && daysBetween(sub.submittedAt, now) >= settings.complianceVerifyWithinDays) {
        await count({ ...base, kind: "REMINDER", level: 1, dedupeKey: `${key}:verify:${sub.id}`, title: `Evidence awaiting verification for ${daysBetween(sub.submittedAt, now)} day(s): ${i.institution.name}`, body: `${what} — submitted ${fmt(sub.submittedAt)} by ${sub.submittedByName}.`, severity: "MEDIUM", roles: ["SCRUTINY_OFFICER", "BUREAU_OFFICER"] });
      }
      continue;
    }
    const left = daysBetween(now, i.dueDate);
    if (now <= i.dueDate) {
      const first = isDoc ? settings.documentExpiryFirstAlertDays : settings.undertakingReminderDays;
      const second = isDoc ? settings.documentExpirySecondAlertDays : settings.undertakingFinalReminderDays;
      const verb = isDoc ? `expires on ${due}` : `is due on ${due}`;
      if (left <= second) await count({ ...base, kind: "REMINDER", level: 1, dedupeKey: `${key}:t${second}`, title: `${isDoc ? "Renew" : "Undertaking due"}: ${what} — ${left} day(s) left`, body: `${i.institution.name} — ${what} ${verb}. ${isDoc ? "Submit the renewed document" : "Submit the supporting evidence"} online.`, severity: "HIGH", institution: true, roles: ["SCRUTINY_OFFICER"] });
      else if (left <= first) await count({ ...base, kind: "REMINDER", level: 1, dedupeKey: `${key}:t${first}`, title: `${isDoc ? "Expiring soon" : "Upcoming undertaking"}: ${what}`, body: `${i.institution.name} — ${what} ${verb}. ${isDoc ? "Arrange the renewal and submit the renewed document" : "Submit the supporting evidence"} before then.`, severity: "MEDIUM", institution: true });
      continue;
    }
    const overdueDays = daysBetween(i.dueDate, now);
    await count({ ...base, kind: "OVERDUE", level: 1, dedupeKey: `${key}:overdue`, title: `${isDoc ? "Expired" : "Undertaking overdue"}: ${what} — ${i.institution.name}`, body: `${isDoc ? `Expired on ${due}; no verified renewal yet` : `Due on ${due}; not fulfilled`} (${overdueDays} day(s)).`, severity: "HIGH", institution: true, roles: ["SCRUTINY_OFFICER"] });
    for (const level of escalationLevels(overdueDays, settings.complianceEscalateL2Days, settings.complianceEscalateL3Days)) {
      await count({ ...base, kind: "ESCALATION", level, dedupeKey: `${key}:esc${level}`, title: `Escalated (level ${level}): ${isDoc ? "expired" : "unfulfilled"} ${what} — ${i.institution.name}`, body: `${overdueDays} day(s) past ${due}.`, severity: level === 3 ? "CRITICAL" : "HIGH", roles: [level === 2 ? "BUREAU_OFFICER" : "SENIOR_OFFICIAL"] });
      if (i.escalationLevel < level) await prisma.complianceItem.update({ where: { id: i.id }, data: { escalationLevel: level } });
    }
  }

  // 5. Ageing high-severity findings (unchanged behaviour, now recorded as alerts too).
  const cutoff = new Date(now.getTime() - settings.highSeverityAlertDays * 86_400_000);
  const aged = await prisma.finding.findMany({ where: { status: { in: ACTIVE_FINDING_STATUSES }, severity: { in: ["HIGH", "CRITICAL"] }, createdAt: { lte: cutoff }, application: { status: { not: "CLOSED" } } }, include: { application: { select: { reference: true, institutionId: true, institution: { select: { regionId: true } } } } } });
  for (const f of aged) {
    await count({ kind: "REMINDER", subjectType: "FINDING", subjectId: f.id, applicationId: f.applicationId, institutionId: f.application.institutionId, regionId: f.application.institution.regionId, level: 1, dedupeKey: `ageing:${f.id}`, title: "Unresolved high-severity finding", body: `${f.application.reference}: ${f.title} (open since ${fmt(f.createdAt)})`, link: `/review/${f.id}`, severity: f.severity as Severity, roles: [(f.assignedRole as Role) ?? "SCRUTINY_OFFICER"] });
  }

  res.resolved = await resolveAlerts(now);
  await recordAudit({ actor: actor ?? SYSTEM.alerts, eventType: "ALERT_SWEEP_RUN", action: `Alert sweep: ${res.raised} new alert(s) (${res.reminders} reminder(s), ${res.overdue} overdue, ${res.escalations} escalation(s)); ${res.resolved} resolved`, after: res });
  return res;
}

/** Mark alerts resolved once their subject no longer needs action. */
export async function resolveAlerts(now: Date = new Date()): Promise<number> {
  const open = await prisma.alert.findMany({ where: { resolvedAt: null }, select: { id: true, subjectType: true, subjectId: true, dedupeKey: true } });
  if (!open.length) return 0;
  const ids = (t: string) => [...new Set(open.filter((a) => a.subjectType === t).map((a) => a.subjectId))];
  const [stages, visits, items, findings] = await Promise.all([
    prisma.stageInstance.findMany({ where: { id: { in: ids("STAGE") } }, select: { id: true, status: true } }),
    prisma.evcVisit.findMany({ where: { id: { in: ids("EVC") } }, select: { id: true, status: true, visitDate: true } }),
    prisma.complianceItem.findMany({ where: { id: { in: [...ids("UNDERTAKING"), ...ids("DOCUMENT")] } }, select: { id: true, status: true, dueDate: true } }),
    prisma.finding.findMany({ where: { id: { in: ids("FINDING") } }, select: { id: true, status: true } }),
  ]);
  const done = new Set<string>();
  for (const a of open) {
    let resolved = false;
    if (a.subjectType === "STAGE") resolved = stages.find((s) => s.id === a.subjectId)?.status !== "ACTIVE";
    else if (a.subjectType === "EVC") {
      const v = visits.find((x) => x.id === a.subjectId);
      resolved = !v || v.status === "REPORT_SUBMITTED" || v.status === "CANCELLED" || (a.dedupeKey.includes("schedule") && v.status === "SCHEDULED");
    } else if (a.subjectType === "UNDERTAKING" || a.subjectType === "DOCUMENT") {
      const i = items.find((x) => x.id === a.subjectId);
      // Resolved when closed, or (documents) when a verified renewal moved the due date on.
      resolved = !i || i.status === "FULFILLED" || i.status === "WAIVED" || !a.dedupeKey.includes(`:${fmt(i.dueDate)}:`) || (a.dedupeKey.includes(":verify:") && i.status !== "SUBMITTED");
    } else if (a.subjectType === "FINDING") {
      const f = findings.find((x) => x.id === a.subjectId);
      resolved = !f || !(ACTIVE_FINDING_STATUSES as string[]).includes(f.status);
    }
    if (resolved) done.add(a.id);
  }
  if (done.size) await prisma.alert.updateMany({ where: { id: { in: [...done] } }, data: { resolvedAt: now } });
  return done.size;
}

export async function listAlerts(actor: Actor, filters: { kind?: string; subjectType?: string; open?: boolean; regionId?: string } = {}) {
  assertPermission(actor, "alerts.view");
  const regionId = actor.role === "SCRUTINY_OFFICER" && actor.regionId ? actor.regionId : filters.regionId;
  return prisma.alert.findMany({
    where: {
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.subjectType ? { subjectType: filters.subjectType } : {}),
      ...(filters.open ? { resolvedAt: null } : {}),
      ...(regionId ? { regionId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
}

/** An official acknowledges an escalation (accountability: who saw it, when, and what they did). */
export async function acknowledgeAlert(actor: Actor, alertId: string, note: string) {
  assertPermission(actor, "alerts.acknowledge");
  const alert = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!alert) throw new NotFoundError();
  if (actor.role === "SCRUTINY_OFFICER" && actor.regionId && alert.regionId && alert.regionId !== actor.regionId) throw new NotFoundError();
  if (alert.acknowledgedAt) throw new DomainError("This alert has already been acknowledged.");
  const n = note.trim();
  if (n.length < 5) throw new DomainError("Record the action taken (at least 5 characters).");
  await prisma.alert.update({ where: { id: alertId }, data: { acknowledgedAt: new Date(), acknowledgedBy: actor.name, acknowledgeNote: n } });
  await recordAudit({ actor, eventType: "ESCALATION_ACKNOWLEDGED", action: `Acknowledged: ${alert.title}`, applicationId: alert.applicationId, reason: n });
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Run the sweep periodically inside the server process (see src/instrumentation.ts). */
export function startAlertScheduler(intervalMinutes: number) {
  if (timer || intervalMinutes <= 0) return;
  const tick = () => runAlertSweep(null).catch((e) => console.error("[alerts] sweep failed", (e as Error)?.message));
  setTimeout(tick, 15_000);
  timer = setInterval(tick, intervalMinutes * 60_000);
}
