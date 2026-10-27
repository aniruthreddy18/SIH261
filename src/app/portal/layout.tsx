import { redirect } from "next/navigation";
import { requireActor } from "@/server/session";
import { prisma } from "@/server/db";
import { listNotifications } from "@/server/notifications";
import { BrandMark } from "@/components/brand";
import { NotificationBell } from "@/components/shell/notifications";
import { UserMenu } from "@/components/shell/user-menu";
import { PortalNav } from "@/components/portal/portal-nav";

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
      <header className="sticky top-0 z-30 bg-green text-white shadow-sm">
        <div className="tri-rule-on-green h-1" />
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
          <BrandMark inverted className="size-8" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-4">Aegis · Institution Portal</p>
            <p className="truncate text-[11px] text-white/80">{institution ? `${institution.name} · ${institution.code}` : "Institution"}</p>
          </div>
          <div className="ml-auto flex items-center gap-1 rounded-md bg-white px-1 text-ink">
            <NotificationBell unread={unread} items={items.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, severity: n.severity, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() }))} />
            <UserMenu name={actor.name} email={actor.email} roleLabel="Institution Applicant" institution={institution?.name} />
          </div>
        </div>
        <div className="mx-auto w-full max-w-6xl px-2">
          <PortalNav />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <footer className="mx-auto w-full max-w-6xl px-4 py-4 text-[11px] text-faint">
        Aegis Institution Portal · demo environment with synthetic data · decision support only — automated results are not an official AICTE approval.
      </footer>
    </div>
  );
}
