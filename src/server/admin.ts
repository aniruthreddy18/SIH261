// Administration: users, system settings, issuer sources, synthetic records, alert sweep.
import { z } from "zod";
import { assertPermission, DomainError, NotFoundError, type Actor } from "@/lib/auth/permissions";
import { hashPassword, passwordPolicyError } from "@/lib/auth/password";
import { ACTIVE_FINDING_STATUSES, ROLES } from "@/lib/domain";
import { prisma } from "./db";
import { recordAudit, SYSTEM } from "./audit";
import { notifyRoles } from "./notifications";
import { getSettings, SETTING_DEFS, type SettingKey } from "./settings";

export async function listUsers(actor: Actor) {
  assertPermission(actor, "users.manage");
  return prisma.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }], select: { id: true, email: true, name: true, designation: true, role: true, active: true, lastLoginAt: true, institution: { select: { id: true, name: true } } } });
}

const CreateUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().min(2).max(120),
  designation: z.string().trim().max(120).optional(),
  role: z.enum(ROLES),
  institutionId: z.string().optional().transform((v) => v || null),
  password: z.string().min(1),
});

export async function createUser(actor: Actor, input: z.input<typeof CreateUserSchema>) {
  assertPermission(actor, "users.manage");
  const data = CreateUserSchema.parse(input);
  const pwErr = passwordPolicyError(data.password);
  if (pwErr) throw new DomainError(pwErr);
  if (data.role === "APPLICANT" && !data.institutionId) throw new DomainError("Applicant accounts must be linked to an institution.");
  if (data.role !== "APPLICANT" && data.institutionId) throw new DomainError("Only applicant accounts are linked to an institution.");
  if (await prisma.user.findUnique({ where: { email: data.email } })) throw new DomainError("A user with this email already exists.");
  await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { email: data.email, name: data.name, designation: data.designation || null, role: data.role, institutionId: data.institutionId, passwordHash: await hashPassword(data.password) } });
    await recordAudit({ actor, eventType: "USER_CREATED", action: `Created user ${u.email} (${u.role})`, after: { email: u.email, role: u.role, institutionId: u.institutionId } }, tx);
  });
}

export async function updateUser(actor: Actor, userId: string, patch: { role?: string; active?: boolean }) {
  assertPermission(actor, "users.manage");
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw new NotFoundError();
  if (userId === actor.userId) throw new DomainError("You cannot change your own role or status.");
  const role = patch.role !== undefined ? z.enum(ROLES).parse(patch.role) : undefined;
  if (role && role !== "APPLICANT" && u.institutionId) throw new DomainError("Unlink the institution before changing an applicant to a staff role (create a new account instead).");
  if (role === "APPLICANT" && !u.institutionId) throw new DomainError("Staff accounts cannot become applicants; create an applicant account linked to an institution.");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { ...(role ? { role } : {}), ...(patch.active !== undefined ? { active: patch.active } : {}) } });
    if (patch.active === false) await tx.session.deleteMany({ where: { userId } });
    await recordAudit({ actor, eventType: "USER_UPDATED", action: `Updated user ${u.email}`, before: { role: u.role, active: u.active }, after: { role: role ?? u.role, active: patch.active ?? u.active } }, tx);
  });
}

export async function updateSettings(actor: Actor, values: Record<string, string>) {
  assertPermission(actor, "settings.manage");
  const before = await getSettings();
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, raw] of Object.entries(values)) {
    const def = SETTING_DEFS[key as SettingKey];
    if (!def) continue;
    let value: string;
    if (def.type === "boolean") value = raw === "true" || raw === "on" ? "true" : "false";
    else {
      const n = Number(raw);
      const d = def as { min: number; max: number };
      if (!Number.isFinite(n) || n < d.min || n > d.max) throw new DomainError(`${def.label} must be between ${d.min} and ${d.max}.`);
      value = String(n);
    }
    if (String(before[key as SettingKey]) !== value) changes[key] = { from: before[key as SettingKey], to: value };
    await prisma.systemSetting.upsert({ where: { key }, create: { key, value, updatedById: actor.userId }, update: { value, updatedById: actor.userId } });
  }
  if (Object.keys(changes).length) await recordAudit({ actor, eventType: "SETTINGS_UPDATED", action: `Updated settings: ${Object.keys(changes).join(", ")}`, before: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.from])), after: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.to])) });
  return changes;
}

export async function setIssuerSourceEnabled(actor: Actor, sourceId: string, enabled: boolean) {
  assertPermission(actor, "issuers.manage");
  const s = await prisma.issuerSource.findUnique({ where: { id: sourceId } });
  if (!s) throw new NotFoundError();
  await prisma.issuerSource.update({ where: { id: sourceId }, data: { enabled } });
  await recordAudit({ actor, eventType: "ISSUER_SOURCE_UPDATED", action: `${s.name} ${enabled ? "enabled" : "disabled"}`, before: { enabled: s.enabled }, after: { enabled } });
}

/** Alert on unresolved HIGH/CRITICAL findings older than the configured threshold (deduplicated). */
export async function sweepAlerts(actor: Actor | null) {
  if (actor) assertPermission(actor, "settings.manage");
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings.highSeverityAlertDays * 86_400_000);
  const aged = await prisma.finding.findMany({ where: { status: { in: ACTIVE_FINDING_STATUSES }, severity: { in: ["HIGH", "CRITICAL"] }, createdAt: { lte: cutoff }, application: { status: { not: "CLOSED" } } }, include: { application: { select: { reference: true } } } });
  let sent = 0;
  for (const f of aged) {
    sent += await notifyRoles([f.assignedRole ?? "SCRUTINY_OFFICER"], { type: "AGEING_HIGH_SEVERITY", title: "Unresolved high-severity finding", body: `${f.application.reference}: ${f.title} (open since ${f.createdAt.toISOString().slice(0, 10)})`, link: `/review/${f.id}`, severity: f.severity, dedupeKey: `ageing:${f.id}` });
  }
  await recordAudit({ actor: actor ?? SYSTEM.alerts, eventType: "ALERT_SWEEP_RUN", action: `Alert sweep: ${aged.length} ageing high-severity finding(s), ${sent} notification(s) created` });
  return { aged: aged.length, sent };
}
