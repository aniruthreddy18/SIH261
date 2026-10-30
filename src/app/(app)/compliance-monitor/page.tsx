import Link from "next/link";
import { Download, FilePlus2, ShieldCheck } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { complianceTypeLabel, COMPLIANCE_STATUS_LABELS, DOCUMENT_VALIDITY_TYPES, UNDERTAKING_TYPES } from "@/lib/workflow/stages";
import { createUndertakingAction, registerDocumentAction } from "@/app/actions/monitoring";
import { listComplianceItems } from "@/server/compliance-monitor";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { pageGuard } from "@/server/session";
import { PageHeader, EmptyState } from "@/components/page-header";
import { AccessDenied } from "@/components/access-denied";
import { ActionDialog } from "@/components/action-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EscalationBadge } from "@/components/workflow/stage-ui";
import { ComplianceTiming } from "@/components/workflow/compliance-ui";
import { cn, formatDate } from "@/lib/utils";

export const metadata = { title: "Compliance Monitor" };

const STATES = [
  { key: "", label: "All" },
  { key: "overdue", label: "Overdue / expired" },
  { key: "awaiting", label: "Awaiting verification" },
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
];

export default async function ComplianceMonitorPage({ searchParams }: { searchParams: Promise<{ kind?: string; state?: string }> }) {
  const { actor, denied } = await pageGuard(["compliance.verify", "compliance.manage"]);
  const crumbs = [{ label: "Command Centre", href: "/" }, { label: "Compliance Monitor" }];
  if (denied) return (<><PageHeader title="Compliance Monitor" crumbs={crumbs} /><AccessDenied /></>);
  const sp = await searchParams;
  const kind = sp.kind === "DOCUMENT_VALIDITY" ? "DOCUMENT_VALIDITY" : "UNDERTAKING";
  const [items, all, settings, institutions] = await Promise.all([
    listComplianceItems(actor, { kind, state: sp.state || undefined }),
    listComplianceItems(actor, {}),
    getSettings(),
    prisma.institution.findMany({ where: actor.role === "SCRUTINY_OFFICER" && actor.regionId ? { regionId: actor.regionId } : {}, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const now = new Date();
  const count = (k: string, f: (i: (typeof all)[number]) => boolean) => all.filter((i) => i.kind === k && f(i)).length;
  const overdue = (i: (typeof all)[number]) => i.status === "OPEN" && i.dueDate < now;
  const canManage = hasPermission(actor.role, "compliance.manage");
  const warnDays = kind === "DOCUMENT_VALIDITY" ? settings.documentExpiryFirstAlertDays : settings.undertakingReminderDays;
  const instOptions = institutions.map((i) => ({ value: i.id, label: i.name }));
  return (
    <>
      <PageHeader
        title="Compliance Monitor"
        crumbs={crumbs}
        description="Time-bound undertakings attached to approvals, and the validity of lease deeds and other prescribed documents. Institutions submit evidence or renewals online; you verify or return them. Reminders and escalations are raised automatically."
        actions={<>
          <Button asChild size="sm" variant="outline"><a href={`/api/exports/monitoring/${kind === "UNDERTAKING" ? "undertakings" : "documents"}`}><Download /> CSV</a></Button>
          {canManage && kind === "UNDERTAKING" && institutions.length > 0 && (
            <ActionDialog label="Record undertaking" icon={<FilePlus2 />} title="Record a time-bound undertaking" description="For approvals granted subject to a condition. The institution is notified and reminded before the due date." variant="default"
              fields={[{ name: "institutionId", label: "Institution", type: "select", options: instOptions }, { name: "typeCode", label: "Type", type: "select", options: Object.entries(UNDERTAKING_TYPES).map(([value, label]) => ({ value, label })) }, { name: "title", label: "Undertaking", minLength: 5, placeholder: "e.g. Recruit 6 additional faculty for B.Tech AI&DS" }, { name: "description", label: "Condition and evidence expected", type: "textarea" }, { name: "dueDate", label: "Due date", type: "date" }]}
              action={async (v) => { "use server"; return createUndertakingAction(v.institutionId ?? "", null, v); }} />
          )}
          {canManage && kind === "DOCUMENT_VALIDITY" && institutions.length > 0 && (
            <ActionDialog label="Track a document" icon={<FilePlus2 />} title="Add a prescribed document to the validity register" description="Advance alerts go to the institution before expiry; expired documents without a verified renewal are escalated." variant="default"
              fields={[{ name: "institutionId", label: "Institution", type: "select", options: instOptions }, { name: "typeCode", label: "Document", type: "select", options: Object.entries(DOCUMENT_VALIDITY_TYPES).map(([value, label]) => ({ value, label })) }, { name: "reference", label: "Reference / registration no.", minLength: 2 }, { name: "validUntil", label: "Valid until", type: "date" }]}
              action={registerDocumentAction} />
          )}
        </>}
      />
      <div className="mb-3 flex flex-wrap gap-2">
        {[{ k: "UNDERTAKING", label: "Undertakings" }, { k: "DOCUMENT_VALIDITY", label: "Document validity" }].map((t) => (
          <Link key={t.k} href={`/compliance-monitor?kind=${t.k}`} className={cn("rounded-full border px-3 py-1.5 text-[13px] font-medium", kind === t.k ? "border-accent-line bg-accent-soft text-accent" : "border-border bg-white/50 text-ink-2 hover:bg-subtle")}>
            {t.label} <span className="ml-1 tabular text-xs">{count(t.k, () => true)}</span>
            {count(t.k, overdue) > 0 && <span className="ml-1.5 rounded bg-bad-soft px-1 text-[11px] text-bad tabular">{count(t.k, overdue)} {t.k === "UNDERTAKING" ? "overdue" : "expired"}</span>}
            {count(t.k, (i) => i.status === "SUBMITTED") > 0 && <span className="ml-1.5 rounded bg-info-soft px-1 text-[11px] text-info tabular">{count(t.k, (i) => i.status === "SUBMITTED")} to verify</span>}
          </Link>
        ))}
        <span className="ml-auto self-center text-xs text-muted"><Link href="/compliance" className="hover:underline">Application requirement mapping →</Link></span>
      </div>
      <Card>
        <div className="flex flex-wrap gap-1 border-b border-border p-2">
          {STATES.map((s) => <Link key={s.key} href={`/compliance-monitor?kind=${kind}${s.key ? `&state=${s.key}` : ""}`} className={cn("rounded-full px-3 py-1 text-xs", (sp.state ?? "") === s.key ? "bg-accent text-white" : "text-ink-2 hover:bg-subtle")}>{s.label}</Link>)}
          <span className="ml-auto self-center pr-2 text-xs text-muted">{items.length} item(s)</span>
        </div>
        {items.length === 0 ? <EmptyState icon={<ShieldCheck />} title="Nothing here" description="No items match this view." /> : (
          <Table>
            <THead><tr><TH>Institution</TH><TH>{kind === "UNDERTAKING" ? "Undertaking" : "Document"}</TH><TH>{kind === "UNDERTAKING" ? "Due" : "Valid until"}</TH><TH>Timing</TH><TH className="hidden lg:table-cell">Status</TH><TH className="hidden xl:table-cell">Last submission</TH><TH /></tr></THead>
            <TBody>
              {items.map((i) => (
                <TR key={i.id}>
                  <TD><p className="font-medium text-ink">{i.institution.name}</p><p className="text-[11px] text-muted">{i.institution.region?.name}{i.application ? <> · <Link href={`/applications/${i.application.id}?tab=workflow`} className="font-mono hover:underline">{i.application.reference}</Link></> : null}</p></TD>
                  <TD className="max-w-sm"><p className="text-ink">{i.title}</p><p className="text-[11px] text-muted">{complianceTypeLabel(i.typeCode)}{i.reference ? ` · ${i.reference}` : ""}</p></TD>
                  <TD className="text-xs tabular">{formatDate(i.dueDate)}</TD>
                  <TD><div className="flex flex-wrap gap-1"><ComplianceTiming status={i.status} dueDate={i.dueDate} kind={i.kind} warnDays={warnDays} /><EscalationBadge level={i.escalationLevel} /></div></TD>
                  <TD className="hidden lg:table-cell text-xs">{COMPLIANCE_STATUS_LABELS[i.status]}</TD>
                  <TD className="hidden xl:table-cell text-xs">{i.submissions[0] ? `${formatDate(i.submissions[0].submittedAt)} · ${i.submissions[0].review.toLowerCase()}` : "—"}</TD>
                  <TD className="text-right"><Button asChild size="xs" variant={i.status === "SUBMITTED" ? "default" : "outline"}><Link href={`/compliance-monitor/${i.id}`}>{i.status === "SUBMITTED" ? "Verify" : "Open"}</Link></Button></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
