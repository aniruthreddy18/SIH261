"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { login, logout, SESSION_COOKIE, type LoginPortal } from "@/server/auth";
import { clearSessionCookie, getActor, setSessionCookie } from "@/server/session";
import { DEMO_PASSWORD, isDemoAccount, isDemoMode } from "@/lib/demo-accounts";

const safePath = (p: string, fallback: string) => (p.startsWith("/") && !p.startsWith("//") ? p : fallback);

export async function loginAction(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const email = String(form.get("email") ?? "");
  const portal: LoginPortal = form.get("portal") === "INSTITUTION" ? "INSTITUTION" : "OFFICIAL";
  // One-click demo access: only in demo mode, only for the listed synthetic accounts, and still
  // through the normal password check below (the demo password is published on the page anyway).
  const quick = form.get("demo") === "1";
  if (quick && !(isDemoMode() && isDemoAccount(email, portal))) return { error: "Quick demo access is not available for this account." };
  const password = quick ? DEMO_PASSWORD : String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  const result = await login(email, password, { ip, userAgent: h.get("user-agent") ?? undefined, portal });
  if (!result.ok) return { error: result.error };
  await setSessionCookie(result.token, result.expiresAt);
  // Institutions land in their portal; officials in the Command Centre. Only same-site paths.
  if (portal === "INSTITUTION") redirect(next.startsWith("/portal") ? safePath(next, "/portal") : "/portal");
  redirect(next && !next.startsWith("/portal") ? safePath(next, "/") : "/");
}

export async function logoutAction() {
  const actor = await getActor();
  const jar = await cookies();
  await logout(jar.get(SESSION_COOKIE)?.value);
  await clearSessionCookie();
  redirect(actor?.role === "APPLICANT" ? "/institution/login" : "/login");
}
