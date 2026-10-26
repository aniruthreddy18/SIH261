import { NextResponse, type NextRequest } from "next/server";
import { AuthorizationError, DomainError, NotFoundError, type Actor } from "@/lib/auth/permissions";
import { getActorForToken, SESSION_COOKIE } from "./auth";
import { safeErrorMessage } from "./session";

/** Wrap a route handler with authentication, same-origin checks for writes, and safe errors. */
export function withActor<C>(handler: (req: NextRequest, actor: Actor, ctx: C) => Promise<Response>) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    const actor = await getActorForToken(req.cookies.get(SESSION_COOKIE)?.value);
    if (!actor) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (req.method !== "GET" && req.method !== "HEAD") {
      const origin = req.headers.get("origin");
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
      if (!origin || !host || new URL(origin).host !== host) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
    }
    try {
      return await handler(req, actor, ctx);
    } catch (err) {
      const status = err instanceof NotFoundError ? 404 : err instanceof AuthorizationError ? 403 : err instanceof DomainError ? 400 : 500;
      return NextResponse.json({ error: safeErrorMessage(err) }, { status });
    }
  };
}

export function contentDisposition(kind: "inline" | "attachment", fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
