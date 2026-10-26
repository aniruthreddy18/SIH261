// Next.js request-scoped auth helpers (cookies). Business services never import this file;
// they receive an explicit Actor instead.
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { AuthorizationError, DomainError, hasPermission, NotFoundError, type Actor, type Permission } from "@/lib/auth/permissions";
import { getActorForToken, SESSION_COOKIE } from "./auth";

export const getActor = cache(async (): Promise<Actor | null> => {
  const jar = await cookies();
  return getActorForToken(jar.get(SESSION_COOKIE)?.value);
});

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  return actor;
}

/** For pages: returns the actor plus whether the permission is missing (render AccessDenied). */
export async function pageGuard(permission?: Permission | Permission[]): Promise<{ actor: Actor; denied: boolean }> {
  const actor = await requireActor();
  const perms = permission ? (Array.isArray(permission) ? permission : [permission]) : [];
  const denied = perms.length > 0 && !perms.some((p) => hasPermission(actor.role, p));
  return { actor, denied };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", path: "/", expires: expiresAt });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Convert any thrown error into a message that is safe to show to the user. */
export function safeErrorMessage(err: unknown): string {
  if (err instanceof DomainError || err instanceof AuthorizationError || err instanceof NotFoundError) return err.message;
  if (err instanceof ZodError) {
    const i = err.issues[0];
    return `${i.path.length ? `${i.path.join(".")}: ` : ""}${i.message}`;
  }
  console.error("[action] unexpected error", err instanceof Error ? err.message : err);
  return "Something went wrong. The action was not completed; please try again.";
}
