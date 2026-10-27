// Database-backed in-app notifications. No e-mail is sent; the UI never claims otherwise.
import type { Role, Severity } from "@/lib/domain";
import { prisma, type Tx } from "./db";
import { institutionLink } from "@/lib/portal-paths";

export interface NotificationInput {
  type: string;
  title: string;
  body: string;
  link?: string;
  severity?: Severity;
  dedupeKey?: string;
}

export async function notifyUsers(userIds: string[], n: NotificationInput, tx: Tx = prisma): Promise<number> {
  let count = 0;
  for (const userId of new Set(userIds)) {
    if (n.dedupeKey) {
      const exists = await tx.notification.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey: n.dedupeKey } } });
      if (exists) continue;
    }
    await tx.notification.create({ data: { userId, type: n.type, title: n.title, body: n.body, link: n.link, severity: n.severity, dedupeKey: n.dedupeKey } });
    count++;
  }
  return count;
}

export async function notifyRoles(roles: Role[], n: NotificationInput, tx: Tx = prisma) {
  const users = await tx.user.findMany({ where: { role: { in: roles }, active: true }, select: { id: true } });
  return notifyUsers(users.map((u) => u.id), n, tx);
}

export async function notifyInstitution(institutionId: string, n: NotificationInput, tx: Tx = prisma) {
  const users = await tx.user.findMany({ where: { institutionId, role: "APPLICANT", active: true }, select: { id: true } });
  // Institution users work in the Institution Portal, so their links point there.
  return notifyUsers(users.map((u) => u.id), { ...n, link: institutionLink(n.link) }, tx);
}

export async function listNotifications(userId: string, limit = 20) {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, unread };
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  await prisma.notification.updateMany({ where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
}
