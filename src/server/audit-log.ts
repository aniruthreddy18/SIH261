import { assertPermission, type Actor } from "@/lib/auth/permissions";
import { prisma } from "./db";

export interface AuditFilters {
  applicationId?: string;
  eventType?: string;
  actor?: string;
  from?: string;
  to?: string;
  take?: number;
}

function where(f: AuditFilters) {
  return {
    ...(f.applicationId ? { applicationId: f.applicationId } : {}),
    ...(f.eventType ? { eventType: f.eventType } : {}),
    ...(f.actor ? { actorLabel: { contains: f.actor } } : {}),
    ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}), ...(f.to ? { lte: new Date(`${f.to}T23:59:59Z`) } : {}) } } : {}),
  };
}

export async function listAuditEvents(actor: Actor, f: AuditFilters) {
  assertPermission(actor, "audit.view");
  const [events, total] = await Promise.all([
    prisma.auditEvent.findMany({ where: where(f), orderBy: { createdAt: "desc" }, take: Math.min(f.take ?? 200, 1000) }),
    prisma.auditEvent.count({ where: where(f) }),
  ]);
  const appIds = [...new Set(events.map((e) => e.applicationId).filter(Boolean))] as string[];
  const apps = await prisma.application.findMany({ where: { id: { in: appIds } }, select: { id: true, reference: true } });
  const refs = new Map(apps.map((a) => [a.id, a.reference]));
  return { events: events.map((e) => ({ ...e, applicationReference: e.applicationId ? refs.get(e.applicationId) ?? null : null })), total };
}

/** Application-scoped history; applicants see their own application's trail. */
export async function listApplicationHistory(applicationId: string) {
  return prisma.auditEvent.findMany({ where: { applicationId }, orderBy: { createdAt: "desc" }, take: 300 });
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
    // Neutralise spreadsheet formula injection.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}
