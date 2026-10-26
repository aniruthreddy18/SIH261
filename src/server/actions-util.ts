import { revalidatePath } from "next/cache";
import type { Actor } from "@/lib/auth/permissions";
import { getActor, safeErrorMessage } from "./session";

export type ActionResult<T = unknown> = { ok: true; message?: string; data?: T } | { ok: false; error: string };

export async function runAction<T>(fn: (actor: Actor) => Promise<T>, opts: { success?: string | ((r: T) => string); revalidate?: string[] } = {}): Promise<ActionResult<T>> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "Your session has expired. Please sign in again." };
  try {
    const data = await fn(actor);
    for (const p of opts.revalidate ?? ["/", "/applications"]) revalidatePath(p, "layout");
    const message = typeof opts.success === "function" ? opts.success(data) : opts.success;
    return { ok: true, message, data };
  } catch (err) {
    return { ok: false, error: safeErrorMessage(err) };
  }
}
