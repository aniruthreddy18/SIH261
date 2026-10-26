"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { login, logout, SESSION_COOKIE } from "@/server/auth";
import { clearSessionCookie, setSessionCookie } from "@/server/session";

export async function loginAction(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  if (!email || !password) return { error: "Enter your email and password." };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  const result = await login(email, password, { ip, userAgent: h.get("user-agent") ?? undefined });
  if (!result.ok) return { error: result.error };
  await setSessionCookie(result.token, result.expiresAt);
  // Only allow same-site relative redirects.
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logoutAction() {
  const jar = await cookies();
  await logout(jar.get(SESSION_COOKIE)?.value);
  await clearSessionCookie();
  redirect("/login");
}
