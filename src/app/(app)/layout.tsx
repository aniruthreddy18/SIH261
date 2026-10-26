import { Search } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ACTIVE_FINDING_STATUSES, ROLE_LABELS } from "@/lib/domain";
import { prisma } from "@/server/db";
import { listNotifications } from "@/server/notifications";
import { requireActor } from "@/server/session";
import { applicationScope } from "@/server/applications";
import { Sidebar } from "@/components/shell/sidebar";
import { NAV } from "@/components/shell/nav";
import { NotificationBell } from "@/components/shell/notifications";
import { UserMenu } from "@/components/shell/user-menu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const items = NAV.filter((i) => !i.permission || hasPermission(actor.role, i.permission));
  const [{ items: notifications, unread }, reviewCount, institution] = await Promise.all([
    listNotifications(actor.userId),
    hasPermission(actor.role, "finding.review") ? prisma.finding.count({ where: { status: { in: ACTIVE_FINDING_STATUSES }, application: { ...applicationScope(actor), status: { not: "CLOSED" } } } }) : Promise.resolve(0),
    actor.institutionId ? prisma.institution.findUnique({ where: { id: actor.institutionId }, select: { name: true } }) : Promise.resolve(null),
  ]);
  return (
    <div className="flex min-h-screen">
      <Sidebar items={items} reviewCount={reviewCount} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/95 pl-14 pr-4 backdrop-blur lg:pl-6">
          <form action="/applications" className="relative hidden w-full max-w-sm md:block" role="search">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input name="q" placeholder="Search applications by ID, institution or code…" aria-label="Search applications" className="h-9 w-full rounded-md border border-border bg-subtle pl-8 pr-3 text-[13px] placeholder:text-faint focus:border-accent focus:bg-surface focus:outline-none" />
          </form>
          <span className="rounded border border-amber-300 bg-warn-soft px-2 py-0.5 text-[10px] font-semibold tracking-wider text-warn" title="All data is synthetic; issuer verification uses simulated sources.">DEMO ENVIRONMENT</span>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell unread={unread} items={notifications.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, severity: n.severity, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() }))} />
            <UserMenu name={actor.name} email={actor.email} roleLabel={ROLE_LABELS[actor.role]} institution={institution?.name} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 lg:px-6">{children}</main>
        <footer className="border-t border-border px-6 py-3 text-[11px] text-faint">
          Aegis prototype (SIH 2026 PS 26261) — decision support only; outputs are not official AICTE approvals. Synthetic data.
        </footer>
      </div>
    </div>
  );
}
