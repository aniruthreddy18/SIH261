import { NextResponse, type NextRequest } from "next/server";

// Coarse gate only: real session validation and authorisation happen server-side in every
// page, action and route handler. Unauthenticated visitors are sent to the right sign-in page:
// /portal/* → Institution login, everything else → AICTE official sign-in.
const PUBLIC = ["/login", "/institution/login"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get("aegis_session")?.value);
  // Layouts read the path to route users into the correct portal.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  const pass = () => NextResponse.next({ request: { headers: requestHeaders } });

  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return pass();
  if (!hasSession) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const url = req.nextUrl.clone();
    const institution = pathname.startsWith("/portal");
    url.pathname = institution ? "/institution/login" : "/login";
    url.search = pathname === "/" || pathname === "/portal" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return pass();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|backgrounds/).*)"] };
