// Pendency monitoring (PS 26262 §B): stage-wise pendency across Regions, application ageing
// against prescribed timelines, workload by desk, processing bottlenecks and overdue cases.
// Every number is computed from stored stage visits at request time.
import type { Actor } from "@/lib/auth/permissions";
import { AGE_BUCKETS, ageBucket, daysBetween, dueState, STAGE_CODES, stageLabel, type DueState, type StageCode } from "@/lib/workflow/stages";
import { prisma } from "./db";
import { applicationScope } from "./applications";
import { loadStageConfigs } from "./stage-engine";

export interface PendencyFilters { regionId?: string; stage?: string; type?: string; state?: string }

export interface PendingCase {
  instanceId: string;
  applicationId: string;
  reference: string;
  institutionName: string;
  applicationType: string;
  regionId: string | null;
  regionName: string;
  stage: StageCode;
  stageLabel: string;
  enteredAt: Date;
  dueAt: Date;
  daysInStage: number;
  daysLeft: number;
  totalAgeDays: number;
  state: DueState;
  escalationLevel: number;
  desk: string;
}

export async function getPendency(actor: Actor, filters: PendencyFilters = {}, now: Date = new Date()) {
  const scope = applicationScope(actor);
  const [configs, regions, active, completed, returned] = await Promise.all([
    loadStageConfigs(),
    prisma.region.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.stageInstance.findMany({
      where: { status: "ACTIVE", application: { ...scope, ...(filters.type ? { applicationType: filters.type } : {}), ...(filters.regionId ? { institution: { regionId: filters.regionId } } : {}) }, ...(filters.stage ? { stageCode: filters.stage } : {}) },
      include: {
        application: { select: { id: true, reference: true, institutionName: true, applicationType: true, submittedAt: true, createdAt: true, institution: { select: { regionId: true, region: { select: { name: true } } } } } },
        evcVisits: { where: { status: { in: ["AWAITING_SCHEDULE", "SCHEDULED"] } }, select: { convenorName: true, status: true } },
      },
    }),
    prisma.stageInstance.findMany({ where: { status: "COMPLETED", application: scope }, select: { stageCode: true, enteredAt: true, completedAt: true, dueAt: true, application: { select: { institution: { select: { regionId: true } } } } } }),
    prisma.application.count({ where: { ...scope, currentStage: "RETURNED" } }),
  ]);

  const cases: PendingCase[] = active.map((s) => {
    const cfg = configs.get(s.stageCode as StageCode);
    const a = s.application;
    const visit = s.evcVisits[0];
    const desk =
      s.stageCode === "EVC" ? (visit?.convenorName ? `EVC — ${visit.convenorName}` : "EVC — awaiting scheduling (Bureau)") :
      s.stageCode === "SAC_SHC" ? "SAC/SHC" :
      s.stageCode === "DECISION" ? "Competent authority" :
      `${a.institution.region?.name ?? "Unassigned"} office`;
    return {
      instanceId: s.id,
      applicationId: a.id,
      reference: a.reference,
      institutionName: a.institutionName,
      applicationType: a.applicationType,
      regionId: a.institution.regionId,
      regionName: a.institution.region?.name ?? "Unassigned",
      stage: s.stageCode as StageCode,
      stageLabel: stageLabel(s.stageCode, s.attempt),
      enteredAt: s.enteredAt,
      dueAt: s.dueAt,
      daysInStage: Math.max(0, daysBetween(s.enteredAt, now)),
      daysLeft: daysBetween(now, s.dueAt),
      totalAgeDays: Math.max(0, daysBetween(a.submittedAt ?? a.createdAt, now)),
      state: dueState(s.dueAt, now, cfg?.reminderDaysBefore ?? 3),
      escalationLevel: s.escalationLevel,
      desk,
    };
  });
  const filtered = filters.state ? cases.filter((c) => c.state === filters.state) : cases;

  const stages = STAGE_CODES.filter((s) => configs.has(s));
  const matrix = regions.map((r) => ({
    regionId: r.id,
    regionName: r.name,
    cells: stages.map((st) => {
      const here = cases.filter((c) => c.regionId === r.id && c.stage === st);
      return { stage: st, total: here.length, overdue: here.filter((c) => c.state === "OVERDUE").length, dueSoon: here.filter((c) => c.state === "DUE_SOON").length };
    }),
  }));

  const ageing = stages.map((st) => ({
    stage: st,
    buckets: AGE_BUCKETS.map((b) => ({ key: b.key, label: b.label, count: cases.filter((c) => c.stage === st && ageBucket(c.daysInStage) === b.key).length })),
  }));

  const deskMap = new Map<string, { desk: string; total: number; overdue: number; oldest: number }>();
  for (const c of cases) {
    const d = deskMap.get(c.desk) ?? { desk: c.desk, total: 0, overdue: 0, oldest: 0 };
    d.total++;
    if (c.state === "OVERDUE") d.overdue++;
    d.oldest = Math.max(d.oldest, c.daysInStage);
    deskMap.set(c.desk, d);
  }
  const workload = [...deskMap.values()].sort((a, b) => b.total - a.total || b.overdue - a.overdue);

  // Bottlenecks: average days per stage visit and share completed within the timeline.
  const bottlenecks = stages.map((st) => {
    const done = completed.filter((c) => c.stageCode === st && c.completedAt);
    const days = done.map((c) => (c.completedAt!.getTime() - c.enteredAt.getTime()) / 86_400_000);
    const pending = cases.filter((c) => c.stage === st);
    return {
      stage: st,
      slaDays: configs.get(st)?.slaDays ?? 0,
      completed: done.length,
      avgDays: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null,
      maxDays: days.length ? Math.round(Math.max(...days)) : null,
      withinTimeline: done.length ? Math.round((done.filter((c) => c.completedAt! <= c.dueAt).length / done.length) * 100) : null,
      pending: pending.length,
      pendingOverdue: pending.filter((c) => c.state === "OVERDUE").length,
    };
  });

  const regionPerformance = regions.map((r) => {
    const here = cases.filter((c) => c.regionId === r.id);
    const done = completed.filter((c) => c.application.institution.regionId === r.id && c.completedAt);
    return {
      regionId: r.id,
      regionName: r.name,
      office: r.office,
      pending: here.length,
      overdue: here.filter((c) => c.state === "OVERDUE").length,
      avgAge: here.length ? Math.round(here.reduce((n, c) => n + c.daysInStage, 0) / here.length) : 0,
      completedStages: done.length,
      withinTimeline: done.length ? Math.round((done.filter((c) => c.completedAt! <= c.dueAt).length / done.length) * 100) : null,
    };
  });

  return {
    now,
    regions,
    stages,
    cases: filtered.sort((a, b) => a.daysLeft - b.daysLeft),
    totals: {
      inProcess: cases.length,
      overdue: cases.filter((c) => c.state === "OVERDUE").length,
      dueSoon: cases.filter((c) => c.state === "DUE_SOON").length,
      escalated: cases.filter((c) => c.escalationLevel >= 2).length,
      withInstitution: returned,
      avgDaysInStage: cases.length ? Math.round(cases.reduce((n, c) => n + c.daysInStage, 0) / cases.length) : 0,
    },
    matrix,
    ageing,
    workload,
    bottlenecks,
    regionPerformance,
  };
}

/** Stage history for an application's Workflow tab. */
export async function getStageHistory(applicationId: string) {
  const [instances, visits, configs] = await Promise.all([
    prisma.stageInstance.findMany({ where: { applicationId }, orderBy: { enteredAt: "asc" } }),
    prisma.evcVisit.findMany({ where: { applicationId }, orderBy: { createdAt: "asc" } }),
    loadStageConfigs(),
  ]);
  return { instances, visits, configs };
}
