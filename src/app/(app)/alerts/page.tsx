import Link from "next/link";
import { BellRing, CheckCheck, Download, Siren } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ALERT_KIND_LABELS, ALERT_SUBJECT_LABELS } from "@/lib/workflow/stages";
import { acknowledgeAlertAction, runAlertSweepAction } from "@/app/actions/monitoring";
import { listAlerts } from "@/server/alerts";
import { highestPerSubject } from "@/server/dashboard";
import { pageGuard } from "@/server/session";
import { PageHeader, EmptyState } from "@/components/page-header";
import { AccessDenied } from "@/components/access-denied";
import { ActionButton, ActionDialog } from "@/components/action-dialog";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { SeverityBadge } from "@/components/status";
import { formatDateTime, relativeAge } from "@/lib/utils";
import { reportCsvPath } from "@/server/monitoring-reports";

export const metadata = { title: "Alerts & Escalations" };

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ kind?: string; subject?: string; open?: string }> }) {
  const { actor, denied } = await pageGuard("alerts.view");
  const crumbs = [{ label: "Command Centre", href: "/" }, { label: "Alerts & Escalations" }];
  if (denied) return (<><PageHeader title="Alerts & Escalations" crumbs={crumbs} /><AccessDenied /></>);
  const sp = await searchParams;
  const [allEscalations, alerts] = await Promise.all([
    listAlerts(actor, { kind: "ESCALATION", open: true }),
    listAlerts(actor, { kind: sp.kind || undefined, subjectType: sp.subject || undefined, open: sp.open === "1" }),
  ]);
  // Lower levels of the same escalation stay in the log below; the list shows the highest open level.
  const escalations = highestPerSubject(allEscalations);
  const canAck = hasPermission(actor.role, "alerts.acknowledge");
  const canRun = hasPermission(actor.role, "alerts.run");
  return (
    <>
      <PageHeader
        title="Alerts & Escalations"
        crumbs={crumbs}
        description="Reminders before deadlines, overdue alerts and escalations up the ladder (responsible officer → Approval Bureau → competent authority), raised automatically by the alert engine. Alerts support follow-up; they never take a regulatory decision. Delivered in-app — no e-mail or SMS is sent by this prototype."
        actions={<>
          <Button asChild size="sm" variant="outline"><a href={reportCsvPath("alerts")}><Download /> CSV</a></Button>
          {canRun && <ActionButton label="Run alert sweep now" icon={<BellRing />} variant="default" action={runAlertSweepAction} pendingLabel="Sweeping…" />}
        </>}
      />

      <Card>
        <CardHeader title={`Open escalations (${escalations.length})`} description="Acknowledge with the action taken; an escalation closes on its own once the underlying stage, visit or compliance item is dealt with." />
        {escalations.length === 0 ? <EmptyState icon={<CheckCheck />} title="No open escalations" /> : (
          <ul className="divide-y divide-border">
            {escalations.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <Siren className={a.level >= 3 ? "mt-0.5 size-4 shrink-0 text-bad" : "mt-0.5 size-4 shrink-0 text-warn"} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink">{a.link ? <Link href={a.link} className="hover:underline">{a.title}</Link> : a.title}</p>
                  <p className="text-xs text-muted">{a.body}</p>
                  <p className="mt-0.5 text-[11px] text-faint">{ALERT_SUBJECT_LABELS[a.subjectType]} · raised {relativeAge(a.createdAt)} ago · to {a.recipientRoles.toLowerCase().replace(/_/g, " ").replace(/,/g, ", ")}</p>
                  {a.acknowledgedAt && <p className="mt-1 rounded-md bg-ok-soft/70 px-2 py-1 text-xs text-ok-ink">Acknowledged by {a.acknowledgedBy} · {formatDateTime(a.acknowledgedAt)}: {a.acknowledgeNote}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={a.level >= 3 ? "bad" : "warn"}>Level {a.level}</Badge>
                  <SeverityBadge severity={a.severity} />
                  {canAck && !a.acknowledgedAt && <ActionDialog label="Acknowledge" size="xs" title="Acknowledge escalation" description="Record what you have done or directed. Stored in the audit trail." fields={[{ name: "note", label: "Action taken", type: "textarea" }]} action={acknowledgeAlertAction.bind(null, a.id)} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-4">
        <form className="flex flex-wrap items-end gap-2 border-b border-border p-3">
          <p className="mr-2 text-sm font-semibold text-ink">Alert log</p>
          <Select name="kind" defaultValue={sp.kind ?? ""} className="w-40" aria-label="Kind"><option value="">All kinds</option>{Object.entries(ALERT_KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Select name="subject" defaultValue={sp.subject ?? ""} className="w-48" aria-label="Subject"><option value="">All subjects</option>{Object.entries(ALERT_SUBJECT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Select name="open" defaultValue={sp.open ?? ""} className="w-36" aria-label="State"><option value="">Open and resolved</option><option value="1">Open only</option></Select>
          <Button type="submit" variant="secondary" size="sm">Apply</Button>
          <span className="ml-auto text-xs text-muted">{alerts.length} alert(s)</span>
        </form>
        {alerts.length === 0 ? <EmptyState icon={<BellRing />} title="No alerts yet" description="Run the sweep, or wait for the scheduled run." /> : (
          <Table>
            <THead><tr><TH>Raised</TH><TH>Kind</TH><TH>Subject</TH><TH>Alert</TH><TH className="hidden lg:table-cell">Recipients</TH><TH>State</TH></tr></THead>
            <TBody>
              {alerts.map((a) => (
                <TR key={a.id}>
                  <TD className="whitespace-nowrap text-xs tabular">{formatDateTime(a.createdAt)}</TD>
                  <TD><Badge tone={a.kind === "ESCALATION" ? (a.level >= 3 ? "bad" : "warn") : a.kind === "OVERDUE" ? "bad" : "info"}>{ALERT_KIND_LABELS[a.kind]}{a.kind === "ESCALATION" ? ` L${a.level}` : ""}</Badge></TD>
                  <TD className="text-xs">{ALERT_SUBJECT_LABELS[a.subjectType]}</TD>
                  <TD className="max-w-lg"><p className="text-[13px] text-ink">{a.link ? <Link href={a.link} className="hover:underline">{a.title}</Link> : a.title}</p><p className="truncate text-[11px] text-muted" title={a.body}>{a.body}</p></TD>
                  <TD className="hidden lg:table-cell text-xs">{a.recipients} · {a.recipientRoles.toLowerCase().replace(/_/g, " ").replace(/,/g, ", ")}</TD>
                  <TD className="text-xs">{a.resolvedAt ? <Badge tone="ok">Resolved</Badge> : <Badge tone="neutral">Open</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
