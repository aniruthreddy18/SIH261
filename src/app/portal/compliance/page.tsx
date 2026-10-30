import Link from "next/link";
import { BadgeCheck, ClipboardList } from "lucide-react";
import { complianceTypeLabel } from "@/lib/workflow/stages";
import { listComplianceItems } from "@/server/compliance-monitor";
import { getSettings } from "@/server/settings";
import { requireActor } from "@/server/session";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { ComplianceTiming } from "@/components/workflow/compliance-ui";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Compliance" };

type Item = Awaited<ReturnType<typeof listComplianceItems>>[number];

function ItemList({ items, warn }: { items: Item[]; warn: { und: number; doc: number } }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((i) => (
        <li key={i.id}>
          <Link href={`/portal/compliance/${i.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-subtle/60">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-ink">{i.title}</p>
              <p className="text-xs text-muted">{i.kind === "UNDERTAKING" ? "Undertaking" : "Document validity"} · {complianceTypeLabel(i.typeCode)}{i.reference ? ` · ${i.reference}` : ""} · {i.kind === "UNDERTAKING" ? "due" : "valid until"} {formatDate(i.dueDate)}{i.application ? ` · ${i.application.reference}` : ""}</p>
            </div>
            <ComplianceTiming status={i.status} dueDate={i.dueDate} kind={i.kind} warnDays={i.kind === "UNDERTAKING" ? warn.und : warn.doc} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function PortalCompliancePage() {
  const actor = await requireActor();
  const [items, settings] = await Promise.all([listComplianceItems(actor), getSettings()]);
  const warn = { und: settings.undertakingReminderDays, doc: settings.documentExpiryFirstAlertDays };
  const open = items.filter((i) => i.status === "OPEN");
  const submitted = items.filter((i) => i.status === "SUBMITTED");
  const closed = items.filter((i) => i.status === "FULFILLED" || i.status === "WAIVED");
  return (
    <>
      <PageHeader
        title="Compliance"
        crumbs={[{ label: "Home", href: "/portal" }, { label: "Compliance" }]}
        description="Time-bound undertakings given by your institution and the validity of documents such as the lease deed and fire NOC. Upload evidence or renewed documents before the due date; an official verifies each submission. Reminders are sent in advance and overdue items are escalated."
      />
      {items.length === 0 ? <Card><EmptyState icon={<ClipboardList />} title="Nothing to track" description="Undertakings and document validity dates appear here once they are recorded for your institution." /></Card> : (
        <div className="space-y-4">
          <Card className={open.some((i) => i.dueDate < new Date()) ? "border-bad-line" : undefined}>
            <CardHeader title={`Action needed (${open.length})`} description="Submit evidence or the renewed document for each of these." />
            {open.length ? <ItemList items={open} warn={warn} /> : <EmptyState icon={<BadgeCheck />} title="Nothing outstanding" />}
          </Card>
          {submitted.length > 0 && <Card><CardHeader title={`Awaiting verification (${submitted.length})`} description="Submitted; an official will accept or return it with remarks." /><ItemList items={submitted} warn={warn} /></Card>}
          {closed.length > 0 && <Card><CardHeader title={`Closed (${closed.length})`} /><ItemList items={closed} warn={warn} /></Card>}
        </div>
      )}
    </>
  );
}
