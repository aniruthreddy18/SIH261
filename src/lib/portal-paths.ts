/**
 * Map an official-area path to its Institution Portal equivalent, so old links and
 * notifications keep working when an institution user follows them.
 */
export function portalPathFor(pathname: string): string {
  if (pathname === "/applications/new") return "/portal/applications/new";
  const app = /^\/applications\/([^/]+)/.exec(pathname);
  if (app) return `/portal/applications/${app[1]}`;
  if (pathname.startsWith("/applications")) return "/portal/applications";
  const doc = /^\/documents\/([^/]+)/.exec(pathname);
  if (doc) return `/portal/documents/${doc[1]}`;
  return "/portal";
}

/** Rewrite an in-app link for an institution user (used for notifications). */
export function institutionLink(link: string | undefined): string | undefined {
  if (!link || link.startsWith("/portal")) return link;
  return portalPathFor(link.split("?")[0]);
}
