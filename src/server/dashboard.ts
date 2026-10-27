// Command Centre metrics — every number is computed from stored records at request time.
import type { Actor } from "@/lib/auth/permissions";
import { ACTIVE_FINDING_STATUSES, APPLICATION_STATUSES, SEVERITY_RANK, type ApplicationStatus, type Severity } from "@/lib/domain";
import { prisma } from "./db";
import { applicationScope, listApplications } from "./applications";

export async function getDashboard(actor: Actor) {
  const scope = applicationScope(actor);
  const [byStatus, apps, openFindings, recentRuns, recentReviews, verifDocs] = await Promise.all([
    prisma.application.groupBy({ by: ["status"], where: scope, _count: true }),
    listApplications(actor),
    prisma.finding.findMany({
      where: { status: { in: ACTIVE_FINDING_STATUSES }, application: { ...scope, status: { not: "CLOSED" } } },
      include: { application: { select: { id: true, reference: true, institutionName: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.validationRun.findMany({ where: { application: scope }, orderBy: { startedAt: "desc" }, take: 6, include: { application: { select: { id: true, reference: true, institutionName: true } } } }),
    prisma.reviewAction.findMany({ where: { application: scope, ...(actor.role === "APPLICANT" ? { action: { not: "NOTE" } } : {}) }, orderBy: { createdAt: "desc" }, take: 6, include: { application: { select: { id: true, reference: true } } } }),
    // Documents whose category requires verification, in open applications.
    prisma.document.findMany({
      where: { state: "ACTIVE", category: { verificationRequired: true }, application: { ...scope, status: { notIn: ["CLOSED", "DRAFT"] } } },
      select: { applicationId: true, versions: { where: { isCurrent: true }, select: { id: true } } },
    }),
  ]);
  const count = (s: ApplicationStatus[]) => byStatus.filter((b) => s.includes(b.status as ApplicationStatus)).reduce((n, b) => n + b._count, 0);

  // Issuer verification pending: any verifiable current version without a VERIFIED result.
  const versionIds = verifDocs.flatMap((d) => d.versions.map((v) => v.id));
  const verified = await prisma.issuerVerification.findMany({ where: { documentVersionId: { in: versionIds } }, orderBy: { requestedAt: "desc" }, select: { documentVersionId: true, status: true } });
  const latest = new Map<string, string>();
  for (const v of verified) if (!latest.has(v.documentVersionId)) latest.set(v.documentVersionId, v.status);
  const pendingApps = new Set(verifDocs.filter((d) => d.versions[0] && latest.get(d.versions[0].id) !== "VERIFIED").map((d) => d.applicationId));

  const total = apps.length;
  const validated = apps.filter((a) => a.lastRun).length;
  const attention = [...openFindings]
    .sort((a, b) => SEVERITY_RANK[b.severity as Severity] - SEVERITY_RANK[a.severity as Severity] || a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, 8);

  return {
    metrics: {
      total,
      awaitingValidation: count(["DRAFT", "PROCESSING_FAILED"]),
      rectification: count(["RECTIFICATION_REQUIRED"]),
      awaitingReview: count(["REVIEW_REQUIRED", "AUTO_FAILED"]),
      verificationPending: pendingApps.size,
      readyForReview: count(["READY_FOR_AUTHORIZED_REVIEW"]),
      openFindings: openFindings.length,
      validationCompletion: total ? Math.round((validated / total) * 100) : 0,
    },
    statusBreakdown: byStatus.map((b) => ({ status: b.status as ApplicationStatus, count: b._count })).sort((a, b) => APPLICATION_STATUSES.indexOf(a.status) - APPLICATION_STATUSES.indexOf(b.status)),
    findingsBySource: ["RULE", "ANOMALY", "VERIFICATION"].map((s) => ({ source: s, count: openFindings.filter((f) => f.source === s).length })),
    recentApplications: apps.slice(0, 8),
    attention,
    recentRuns,
    recentReviews,
  };
}

const CONFIG_EVENTS = ["RULE_VERSION_CREATED", "RULE_STATUS_CHANGED", "USER_CREATED", "USER_UPDATED", "SETTINGS_UPDATED", "ISSUER_SOURCE_UPDATED", "ALERT_SWEEP_RUN"];

/** Data that only one role's dashboard needs. */
export async function getRoleExtras(actor: Actor) {
  const scope = applicationScope(actor);
  if (actor.role === "APPLICANT") {
    const rectifications = await prisma.rectificationRequest.findMany({
      where: { status: "OPEN", application: scope },
      include: { application: { select: { id: true, reference: true } } },
      orderBy: { createdAt: "desc" },
    });
    return { kind: "APPLICANT" as const, rectifications };
  }
  if (actor.role === "SENIOR_OFFICIAL") {
    const [awaiting, decisions] = await Promise.all([
      prisma.application.findMany({
        where: { status: "READY_FOR_AUTHORIZED_REVIEW" },
        orderBy: { updatedAt: "asc" },
        include: { reviewActions: { where: { action: "FORWARD" }, orderBy: { createdAt: "desc" }, take: 1 } },
      }),
      prisma.reviewAction.findMany({ where: { action: "DECISION" }, orderBy: { createdAt: "desc" }, take: 6, include: { application: { select: { id: true, reference: true, institutionName: true } } } }),
    ]);
    return { kind: "SENIOR_OFFICIAL" as const, awaiting, decisions };
  }
  if (actor.role === "ADMIN") {
    const since = new Date(Date.now() - 86_400_000);
    const [activeUsers, totalUsers, activeRules, ruleVersions, sources, auditToday, configChanges] = await Promise.all([
      prisma.user.count({ where: { active: true } }),
      prisma.user.count(),
      prisma.validationRule.count({ where: { active: true } }),
      prisma.ruleVersion.count(),
      prisma.issuerSource.findMany({ select: { enabled: true } }),
      prisma.auditEvent.count({ where: { createdAt: { gte: since } } }),
      prisma.auditEvent.findMany({ where: { eventType: { in: CONFIG_EVENTS } }, orderBy: { createdAt: "desc" }, take: 8 }),
    ]);
    return { kind: "ADMIN" as const, activeUsers, totalUsers, activeRules, ruleVersions, sourcesEnabled: sources.filter((s) => s.enabled).length, sourcesTotal: sources.length, auditToday, configChanges };
  }
  return { kind: "OFFICER" as const };
}
