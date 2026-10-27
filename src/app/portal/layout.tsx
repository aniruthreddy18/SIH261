import { redirect } from "next/navigation";
import { requireActor } from "@/server/session";
import { prisma } from "@/server/db";
import { listNotifications } from "@/server/notifications";
import { BrandMark } from "@/components/brand";
import { NotificationBell } from "@/components/shell/notifications";
import { UserMenu } from "@/components/shell/user-menu";
import { PortalNav } from "@/components/portal/portal-nav";
import { ROLE_THEME } from "@/lib/role-theme";

export const metadata = { title: { default: "Institution Portal", template: "%s · Institution Portal · Aegis" } };

/** The Institution Portal: a separate, simpler area for institution users only. */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  if (actor.role !== "APPLICANT") redirect("/");
  const [institution, { items, unread }] = await Promise.all([
    prisma.institution.findUnique({ where: { id: actor.institutionId ?? "" }, select: { name: true, code: true } }),
    listNotifications(actor.userId),
  ]);
  return (
    <div className="flex min-h-screen flex-col">
      <div className="app-backdrop" aria-hidden />
      <header className="sticky top-0 z-30">
        <div className={`glass-bar text-white ${ROLE_THEME.APPLICANT.header}`}>
          <div className="tri-rule-on-navy h-1" />
          <div className="flex h-14 w-full items-center gap-3 px-4 sm:px-6 lg:px-8">
            <BrandMark inverted className="size-8" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-4">Aegis · Institution Portal</p>
              <p className="truncate text-[11px] text-white/85">{institution ? `${institution.name} · ${institution.code}` : "Institution"}</p>
            </div>
            <div className="glass-strong ml-auto flex items-center gap-1 rounded-xl border px-1 text-ink">
              <NotificationBell unread={unread} items={items.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, severity: n.severity, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() }))} />
              <UserMenu name={actor.name} email={actor.email} roleLabel="Institution Applicant" institution={institution?.name} />
            </div>
          </div>
        </div>
        <div className="glass-bar border-b border-white/45 bg-white/22 shadow-[0_8px_24px_-18px_rgb(13_35_64/0.35)]">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <PortalNav />
          </div>
        </div>
      </header>
      <main className="w-full flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      <footer className="w-full px-4 py-4 sm:px-6 lg:px-8">
        <p className="inline-block glass rounded-2xl px-3 py-1 text-[11px] text-ink-2">
          Aegis Institution Portal · demo environment with synthetic data · decision support only — automated results are not an official AICTE approval.
        </p>
      </footer>
    </div>
  );
}
