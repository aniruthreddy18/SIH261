import Link from "next/link";
import { BadgeCheck, CalendarClock, FileClock, FilePlus2, FileWarning, FolderOpen, HelpCircle, MessageSquareWarning, Undo2 } from "lucide-react";
import { listApplications } from "@/server/applications";
import { prisma } from "@/server/db";
import { requireActor } from "@/server/session";
import { DashboardHero, HeroLink } from "@/components/dashboard-hero";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/page-header";
import { ApplicationCard } from "@/components/portal/application-card";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Home" };

export default async function PortalHome() {
  const actor = await requireActor();
  const scope = { institutionId: actor.institutionId ?? "__none__" };
  const [apps, institution, rectifications, infoRequests] = await Promise.all([
    listApplications(actor),
    prisma.institution.findUnique({ where: { id: actor.institutionId ?? "" }, select: { name: true } }),
    prisma.rectificationRequest.findMany({ where: { status: "OPEN", application: scope }, include: { application: { select: { id: true, reference: true } } }, orderBy: { dueDate: "asc" } }),
    prisma.finding.findMany({ where: { status: "INFO_REQUESTED", application: scope }, include: { application: { select: { id: true, reference: true } } }, orderBy: { updatedAt: "desc" } }),
  ]);
  const count = (s: string[]) => apps.filter((a) => s.includes(a.status)).length;
  const needsAction = apps.filter((a) => ["DRAFT", "AUTO_FAILED", "PROCESSING_FAILED"].includes(a.status));
  const tiles = [
    { label: "My applications", value: apps.length, Icon: FolderOpen },
    { label: "Need your action", value: count(["DRAFT", "RECTIFICATION_REQUIRED", "AUTO_FAILED", "PROCESSING_FAILED"]), Icon: FileWarning },
    { label: "Under AICTE review", value: count(["PROCESSING", "REVIEW_REQUIRED", "AUTO_PASSED"]), Icon: FileClock },
    { label: "Forwarded or decided", value: count(["READY_FOR_AUTHORIZED_REVIEW", "CLOSED"]), Icon: BadgeCheck },
  ];
  const actions = rectifications.length + infoRequests.length + needsAction.length;
  return (
    <>
      <DashboardHero
        band="bg-green"
        eyebrow="Institution Portal"
        title={`Welcome, ${actor.name}`}
        subtitle={<>{institution?.name} — submit your documents, see what the checks found, and fix anything flagged.</>}
        actions={
          <>
            <HeroLink primary href="/portal/applications/new" icon={<FilePlus2 />}>New application</HeroLink>
            <HeroLink href="/portal/help" icon={<HelpCircle />}>How it works</HeroLink>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map(({ label, value, Icon }) => (
          <div key={label} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"><Icon className="size-5" /></span>
            <span><span className="block text-2xl font-semibold leading-7 text-ink tabular">{value}</span><span className="block text-xs text-muted">{label}</span></span>
          </div>
        ))}
      </div>

      <Card className={`mt-4 ${actions ? "border-warn-line" : ""}`}>
        <CardHeader title="Action required" description={actions ? "Things AICTE is waiting on from your institution." : undefined} />
        {actions === 0 ? (
          <EmptyState icon={<BadgeCheck />} title="Nothing needs your action" description="We will notify you here and in the bell if anything is needed." />
        ) : (
          <ul className="divide-y divide-border">
            {rectifications.map((r) => (
              <li key={r.id}>
                <Link href={`/portal/applications/${r.application.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-subtle/60">
                  <Undo2 className="mt-0.5 size-4 shrink-0 text-warn" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-ink">Correction requested · <span className="font-mono text-xs">{r.application.reference}</span></p>
                    <p className="mt-0.5 text-xs text-muted">{r.message}</p>
                  </div>
                  {r.dueDate && <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-warn"><CalendarClock className="size-3.5" /> Due {formatDate(r.dueDate)}</span>}
                </Link>
              </li>
            ))}
            {infoRequests.map((f) => (
              <li key={f.id}>
                <Link href={`/portal/applications/${f.application.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-subtle/60">
                  <MessageSquareWarning className="mt-0.5 size-4 shrink-0 text-info" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-ink">Information requested · <span className="font-mono text-xs">{f.application.reference}</span></p>
                    <p className="mt-0.5 text-xs text-muted">{f.title}</p>
                  </div>
                </Link>
              </li>
            ))}
            {needsAction.map((a) => (
              <li key={a.id}>
                <Link href={`/portal/applications/${a.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-subtle/60">
                  <FileWarning className="mt-0.5 size-4 shrink-0 text-warn" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-ink">{a.status === "DRAFT" ? "Finish your draft" : a.status === "PROCESSING_FAILED" ? "A document could not be read" : "Issues found by the automatic checks"} · <span className="font-mono text-xs">{a.reference}</span></p>
                    <p className="mt-0.5 text-xs text-muted">{a.status === "DRAFT" ? "Upload the mandatory documents and run the checks." : `${a.openFindings} open issue(s) — see what to fix.`}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">My applications</h2>
        <Link href="/portal/applications" className="text-xs font-medium text-accent hover:underline">View all</Link>
      </div>
      {apps.length === 0 ? (
        <Card className="mt-3"><EmptyState icon={<FolderOpen />} title="No applications yet" description="Start a new application to upload your documents." action={<Link href="/portal/applications/new" className="text-sm font-medium text-accent hover:underline">New application</Link>} /></Card>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-2">{apps.slice(0, 4).map((a) => <ApplicationCard key={a.id} a={a} />)}</div>
      )}
    </>
  );
}
