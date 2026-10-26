// Server-side authentication: credential verification and opaque, DB-backed sessions.
// Only a SHA-256 hash of the session token is stored, so a database leak does not expose
// usable session tokens.
import crypto from "node:crypto";
import type { Actor } from "@/lib/auth/permissions";
import { verifyPassword } from "@/lib/auth/password";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import type { Role } from "@/lib/domain";
import { prisma } from "./db";
import { recordAudit } from "./audit";

export const SESSION_COOKIE = "aegis_session";
const ttlHours = () => Number(process.env.SESSION_TTL_HOURS ?? 12);

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export type LoginResult = { ok: true; token: string; expiresAt: Date; actor: Actor } | { ok: false; error: string };

export async function login(email: string, password: string, meta: { ip: string; userAgent?: string }): Promise<LoginResult> {
  const normalized = email.trim().toLowerCase();
  const limiter = rateLimit(`login:${meta.ip}:${normalized}`, 5, 15 * 60_000);
  if (!limiter.allowed) return { ok: false, error: `Too many sign-in attempts. Try again in ${Math.ceil(limiter.retryAfterSec / 60)} minute(s).` };
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  // Always run a hash comparison to keep timing similar for unknown accounts.
  const valid = user ? await verifyPassword(password, user.passwordHash) : await verifyPassword(password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
  if (!user || !valid || !user.active) {
    await recordAudit({ actor: { label: `anonymous (${normalized.slice(0, 80)})` }, eventType: "AUTH_LOGIN_FAILED", action: "Failed sign-in attempt", reason: !user ? "Unknown account" : !user.active ? "Account disabled" : "Invalid password" });
    return { ok: false, error: "Invalid email or password." };
  }
  resetRateLimit(`login:${meta.ip}:${normalized}`);
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlHours() * 3_600_000);
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId: user.id, expiresAt, userAgent: meta.userAgent?.slice(0, 200) } });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const actor = toActor(user);
  await recordAudit({ actor, eventType: "AUTH_LOGIN", action: "Signed in" });
  return { ok: true, token, expiresAt, actor };
}

export async function getActorForToken(token: string | undefined): Promise<Actor | null> {
  if (!token || token.length > 200) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  return toActor(session.user);
}

export async function logout(token: string | undefined) {
  if (!token) return;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session) return;
  await prisma.session.delete({ where: { id: session.id } });
  await recordAudit({ actor: toActor(session.user), eventType: "AUTH_LOGOUT", action: "Signed out" });
}

export function toActor(u: { id: string; name: string; email: string; role: Role | string; institutionId: string | null }): Actor {
  return { userId: u.id, name: u.name, email: u.email, role: u.role as Role, institutionId: u.institutionId };
}
