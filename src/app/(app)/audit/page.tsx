import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { AUDIT_EVENT_TYPES } from "@/server/audit";
import { listAuditEvents } from "@/server/audit-log";
import { listApplications } from "@/server/applications";
import { pageGuard } from "@/server/session";
import { PageHeader, Notice } from "@/components/page-header";
import { AccessDenied } from "@/components/access-denied";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ApplicationStatusBadge } from "@/components/status";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Reports & Audit" };

function Diff({ before, after }: { before: string | null; after: string | null }) {
  if (!before && !after) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-[11px] text-accent">Before / after</summary>
      <div className="mt-1 grid gap-1 md:grid-cols-2">
        {before && <pre className="overflow-x-auto rounded bg-bad-soft/60 p-1.5 font-mono text-[10.5px] text-ink-2">{JSON.stringify(JSON.parse(before), null, 1)}</pre>}
        {after && <pre className="overflow-x-auto rounded bg-ok-soft/60 p-1.5 font-mono text-[10.5px] text-ink-2">{JSON.stringify(JSON.parse(after), null, 1)}</pre>}
      </div>
    </details>
  );
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ applicationId?: string; eventType?: string; actor?: string; from?: string; to?: string }> }) {
  const { actor, denied } = await pageGuard("audit.view");
  const crumbs = [{ label: "Command Centre", href: "/" }, { label: "Reports & Audit" }];
  if (denied) return (<><PageHeader title="Reports & Audit" crumbs={crumbs} /><AccessDenied /></>);
  const sp = await searchParams;
  const [{ events, total }, apps] = await Promise.all([listAuditEvents(actor, { ...sp, take: 300 }), listApplications(actor)]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <>
      <PageHeader
        title="Reports & Audit"
        crumbs={crumbs}
        description="Validation reports per application and the append-only audit trail of every significant action."
        actions={<Button asChild variant="outline" size="sm"><a href={`/api/exports/audit${qs ? `?${qs}` : ""}`}><Download /> Export audit CSV</a></Button>}
      />
      <Card className="mb-4">
        <CardHeader title="Validation reports" description="PDF reports include the demo disclaimer, extracted values with page references, rule results and versions, verification outcomes (with source type) and recorded human decisions." actions={<Button asChild variant="outline" size="xs"><a href="/api/exports/applications"><Download /> Applications CSV</a></Button>} />
        <Table>
          <THead><tr><TH>Application</TH><TH>Institution</TH><TH>Status</TH><TH className="text-right">Report</TH></tr></THead>
          <TBody>
            {apps.map((a) => (
              <TR key={a.id}>
                <TD><Link href={`/applications/${a.id}`} className="font-mono text-xs hover:underline">{a.reference}</Link></TD>
                <TD className="text-ink">{a.institutionName}</TD>
                <TD><ApplicationStatusBadge status={a.status} /></TD>
                <TD className="text-right"><a className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline" href={`/api/applications/${a.id}/report`}><FileText className="size-3.5" /> PDF</a> <span className="text-faint">·</span> <a className="text-xs text-accent hover:underline" href={`/api/applications/${a.id}/report?format=json`}>JSON</a></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Card>
        <form className="flex flex-wrap items-end gap-2 border-b border-border p-3">
          <Select name="applicationId" defaultValue={sp.applicationId ?? ""} className="w-72" aria-label="Application"><option value="">All applications</option>{apps.map((a) => <option key={a.id} value={a.id}>{a.reference} — {a.institutionName}</option>)}</Select>
          <Select name="eventType" defaultValue={sp.eventType ?? ""} className="w-64" aria-label="Event type"><option value="">All event types</option>{AUDIT_EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
          <Input name="actor" defaultValue={sp.actor} placeholder="User or service" className="w-44" aria-label="Actor" />
          <Input name="from" type="date" defaultValue={sp.from} className="w-40" aria-label="From date" />
          <Input name="to" type="date" defaultValue={sp.to} className="w-40" aria-label="To date" />
          <Button type="submit" variant="secondary" size="sm">Filter</Button>
          {qs && <Link href="/audit" className="text-xs text-accent hover:underline">Clear</Link>}
          <span className="ml-auto text-xs text-muted">Showing {events.length} of {total}</span>
        </form>
        <Table>
          <THead><tr><TH>Time</TH><TH>Actor</TH><TH>Event</TH><TH>Application</TH><TH className="hidden xl:table-cell">References</TH></tr></THead>
          <TBody>
            {events.map((e) => (
              <TR key={e.id}>
                <TD className="whitespace-nowrap text-xs">{formatDateTime(e.createdAt)}</TD>
                <TD className="max-w-[200px] text-xs"><p className="truncate text-ink" title={e.actorLabel}>{e.actorLabel}</p><p className="text-[11px] text-muted">{e.actorRole}</p></TD>
                <TD className="max-w-xl text-xs"><p className="font-mono text-[10.5px] text-muted">{e.eventType}</p><p className="text-ink">{e.action}</p>{e.reason && <p className="text-muted">Reason: {e.reason}</p>}<Diff before={e.beforeJson} after={e.afterJson} /></TD>
                <TD className="text-xs">{e.applicationReference ? <Link className="font-mono hover:underline" href={`/applications/${e.applicationId}?tab=history`}>{e.applicationReference}</Link> : "—"}</TD>
                <TD className="hidden xl:table-cell text-[11px] text-muted">{[e.ruleVersion && `rule ${e.ruleVersion}`, e.validationRunId && `run ${e.validationRunId.slice(-6)}`, e.verificationRef && `verif ${e.verificationRef.slice(-6)}`, e.documentId && `doc ${e.documentId.slice(-6)}`, e.correlationId && `corr ${e.correlationId.slice(0, 8)}`].filter(Boolean).join(" · ") || "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <div className="mt-3"><Notice tone="info">Audit events are append-only: the application only inserts them, and database triggers reject UPDATE and DELETE on the audit table. Passwords, tokens and document contents are never written to the audit log.</Notice></div>
    </>
  );
}
