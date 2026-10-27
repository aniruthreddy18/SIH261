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
      <header className="sticky top-0 z-30 shadow-sm">
        <div className={`text-white ${ROLE_THEME.APPLICANT.header}`}>
          <div className="tri-rule-on-navy h-1" />
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
            <BrandMark inverted className="size-8" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-4">Aegis · Institution Portal</p>
              <p className="truncate text-[11px] text-white/85">{institution ? `${institution.name} · ${institution.code}` : "Institution"}</p>
            </div>
            <div className="ml-auto flex items-center gap-1 rounded-lg bg-white/95 px-1 text-ink shadow-sm">
              <NotificationBell unread={unread} items={items.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, severity: n.severity, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() }))} />
              <UserMenu name={actor.name} email={actor.email} roleLabel="Institution Applicant" institution={institution?.name} />
            </div>
          </div>
        </div>
        <div className="border-b border-white/60 bg-white/70 backdrop-blur-md">
          <div className="mx-auto w-full max-w-6xl px-4">
            <PortalNav />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <footer className="mx-auto w-full max-w-6xl px-4 py-4">
        <p className="inline-block rounded-2xl bg-white/75 px-3 py-1 text-[11px] text-ink-2 backdrop-blur">
          Aegis Institution Portal · demo environment with synthetic data · decision support only — automated results are not an official AICTE approval.
        </p>
      </footer>
    </div>
  );
}
