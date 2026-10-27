import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { portalPathFor } from "@/lib/portal-paths";
import { hasPermission } from "@/lib/auth/permissions";
import { ACTIVE_FINDING_STATUSES, ROLE_LABELS } from "@/lib/domain";
import { prisma } from "@/server/db";
import { listNotifications } from "@/server/notifications";
import { requireActor } from "@/server/session";
import { applicationScope } from "@/server/applications";
import { TopNav } from "@/components/shell/top-nav";
import { BrandMark } from "@/components/brand";
import { ROLE_THEME } from "@/lib/role-theme";
import { cn } from "@/lib/utils";
import { NAV } from "@/components/shell/nav";
import { NotificationBell } from "@/components/shell/notifications";
import { UserMenu } from "@/components/shell/user-menu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  // Institutions use their own portal; send them to the matching page there.
  if (actor.role === "APPLICANT") redirect(portalPathFor((await headers()).get("x-pathname") ?? "/"));
  const items = NAV.filter((i) => !i.permission || hasPermission(actor.role, i.permission)).map((i) =>
    i.href === "/" ? { ...i, label: actor.role === "APPLICANT" ? "My Dashboard" : actor.role === "ADMIN" ? "Admin Dashboard" : "Command Centre" } : i,
  );
  const [{ items: notifications, unread }, reviewCount, institution] = await Promise.all([
    listNotifications(actor.userId),
    hasPermission(actor.role, "finding.review") ? prisma.finding.count({ where: { status: { in: ACTIVE_FINDING_STATUSES }, application: { ...applicationScope(actor), status: { not: "CLOSED" } } } }) : Promise.resolve(0),
    actor.institutionId ? prisma.institution.findUnique({ where: { id: actor.institutionId }, select: { name: true } }) : Promise.resolve(null),
  ]);
  const theme = ROLE_THEME[actor.role];
  return (
    <div className="flex min-h-screen flex-col">
      <div className="app-backdrop" aria-hidden />
      <header className="sticky top-0 z-30">
        {/* Role bar: the gradient and portal name tell each user type apart at a glance. */}
        <div className={cn("glass-bar text-white", theme.header)}>
          <div className="tri-rule-on-navy h-1" />
          <div className="flex h-14 w-full items-center gap-3 px-4 sm:px-6 lg:px-8">
            <Link href="/" className="flex shrink-0 items-center gap-2.5">
              <BrandMark inverted className="size-8" />
              <span className="hidden sm:block">
                <span className="block text-sm font-semibold leading-4">Aegis</span>
                <span className="block text-[11px] text-white/85">{theme.portal}</span>
              </span>
            </Link>
            <form action="/applications" className="relative ml-4 hidden w-full max-w-sm md:block" role="search">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-white/75" />
              <input name="q" placeholder="Search applications by ID, institution or code…" aria-label="Search applications" className="h-9 w-full rounded-full border border-white/25 bg-white/15 pl-8 pr-3 text-[13px] text-white placeholder:text-white/75 focus:border-white focus:bg-white focus:text-ink focus:placeholder:text-faint focus:outline-none" />
            </form>
            <div className="glass-strong ml-auto flex items-center gap-1 rounded-xl border px-1 text-ink">
              <NotificationBell unread={unread} items={notifications.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, severity: n.severity, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() }))} />
              <UserMenu name={actor.name} email={actor.email} roleLabel={ROLE_LABELS[actor.role]} institution={institution?.name} />
            </div>
          </div>
          {actor.role === "ADMIN" && <div className="h-0.5 bg-saffron-bright" />}
        </div>
        <div className="glass-bar border-b border-white/45 bg-white/22 shadow-[0_8px_24px_-18px_rgb(13_35_64/0.35)]">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <TopNav items={items} reviewCount={reviewCount} />
          </div>
        </div>
      </header>
      <main className="w-full flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      <footer className="w-full px-4 py-3 sm:px-6 lg:px-8">
        <p className="inline-block glass rounded-full px-3 py-1 text-[11px] text-ink-2">Aegis prototype · demo environment with synthetic data · decision support only — not an official AICTE approval.</p>
      </footer>
    </div>
  );
}
